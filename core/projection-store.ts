// dsh-shadow —— core/projection-store.ts：Shadow Projection Store（ADR-0046 Phase 1B，Performance Feature）。
// 目标：把「Atom → ShadowNode」的派生结果缓存成可重建的投影，避免每次查询全量顺序重读重派生。
// 定位（ADR-0046）：这是 **Performance Feature，不是 Storage Feature**——不存事实，只缓投影，rm -rf 可重建。
// 接口先行（save/load/invalidate/rebuild），首版 JsonlProjectionStore；将来可换 SQLite / EmbeddedGraph（不改调用方）。
// 触发（ADR-0046）：只在「Node 稳定 + query 稳定 + rebuild 成本明显」时才启用；默认关（config.projectionStore.enabled）。
import { SHADOW_ROOT } from "./paths.js";
import type { ShadowNode } from "./node.js";
import type { ChangeSet } from "./change-set.js";
import { buildManifest, writeManifest } from "./manifest.js";

export interface ShadowProjectionStore {
  save(nodes: ShadowNode[]): Promise<void>;
  load(): Promise<ShadowNode[] | null>;   // null = 无缓存 / 读到坏数据（需 rebuild）
  invalidate(): Promise<void>;
  rebuild(derive: () => Promise<ShadowNode[]>, failures?: { path: string; reason: string }[]): Promise<ShadowNode[]>;
  /**
   * ADR-0048⑤：变革驱动——只移除变更 rel 的节点（保持其余缓存），回退到「无变更→不清」。
   *
   * ⚠ **生产中未接线**（v1.15.19 用 `tools/audit-wiring.ts` 审计确认，见 ADR-0062）：
   *   本方法的**唯一调用点是测试**（`test/projection-store.test.ts`）。生产走的是
   *   `invalidateProjection` 的**粗粒度清空**（`invalidate()`）——见 `writer-materialize.ts` 的
   *   `ensureIndex`：它在 `rebuildIndex` 后清整个缓存，而 `rebuildIndex` 本身是**全量扫描**
   *   （`listMemories`），**没有跟踪变更集**，故拿不到可喂给本方法的 `ChangeSet`。
   *
   * **这不是正确性缺陷**：粗粒度清空是正确路径（缓存是可重建派生，清空后下次读自动重建），
   *   只是放弃了「只失效变更项」的优化。接线它需要**新增写侧变更跟踪**（并伴随一次性能取舍：
   *   清空 = 一次极小写 + 下次全量重建；本方法 = 读全量缓存 + 写回，换下次读更快）。
   *   按本仓纪律**不臆造机制**，故保留实现与测试、显式标注未接线，由后续决策是否接线或删除。
   */
  invalidateFor?(set: ChangeSet): Promise<void>;
}

export const projectionIndexRel = () => `${SHADOW_ROOT}/shadow-index/nodes.jsonl`;

/** JsonlProjectionStore：把 ShadowNode 投影持久化到 `.shadow/shadow-index/nodes.jsonl`（逐行 JSON，可重建）。 */
export const createJsonlProjectionStore = (fs: any, ws: string): ShadowProjectionStore => {
  // v1.15.12 修既有 bug：这里原先返回 `.displayPath`（**字符串**），却被当作 `FsTarget` 传给
  // `writeText` / `readText` —— 契约要求的是 `resolve()` 产出的 target 对象（key 才是 branded 值）。
  // local 后端可能宽松容忍，**sandbox / 隔离后端不会**；mock 则直接把它当 `undefined.displayPath`。
  // 该 bug 此前一直隐藏：`invalidate()` **零调用点**，而 `save/load` 只在 `projectionStore.enabled` 时走。
  // 现在 invalidate 有了生产调用点（写侧索引重建后），必须一并修对。
  const target = async () => await fs.resolve(`${ws}/${projectionIndexRel()}`, { cwd: ws });
  return {
    async save(nodes) {
      const t = await target();
      const body = (nodes || []).map((n) => JSON.stringify(n)).join("\n");
      await fs.writeText(t, body ? body + "\n" : "");
    },
    async load() {
      try {
        const t = await target();
        const txt = await fs.readText(t);
        if (!txt) return null;
        const nodes: ShadowNode[] = [];
        for (const line of String(txt).split("\n")) {
          const s = line.trim();
          if (!s) continue;
          try { nodes.push(JSON.parse(s)); } catch { return null; /* 单行坏 → 触发 rebuild */ }
        }
        return nodes;
      } catch { return null; }
    },
    async invalidate() {
      try { const t = await target(); await fs.writeText(t, ""); } catch { /* best-effort */ }
    },
    async rebuild(derive, failures = []) {
      const nodes = await derive();
      await this.save(nodes);
      // ADR-0048⑧：重建后写 manifest（可观测：节点数/来源数/构建时间/失败项）。
      // v1.15.57：`failures` 必须**真的传进来** —— 此前该参数从不被传，`renderManifest` 恒报「失败项 0」。
      await writeManifest(fs, ws, buildManifest("1", nodes, failures));
      return nodes;
    },
    async invalidateFor(set) {
      try {
        const nodes = await this.load();
        if (!nodes || nodes.length === 0) return;
        const kept = nodes.filter((n) => !set.affects(String(n.source || "")));
        if (kept.length !== nodes.length) await this.save(kept);
      } catch { /* best-effort */ }
    },
  };
};

/** 工厂：取本项目 store（当前仅 JsonlProjectionStore；将来加 sqlite/embedded 在此路由）。 */
export const getProjectionStore = (fs: any, ws: string): ShadowProjectionStore => createJsonlProjectionStore(fs, ws);

/**
 * 让投影缓存失效（best-effort）。**这是 `invalidate()` 的生产调用点**。
 *
 * 修复的缺陷（v1.15.12）：`invalidate` / `invalidateFor` 此前**零调用点** —— 接口与实现都在，
 * 但没人调，于是「开了 `projectionStore` 之后，记忆变了、`shadow_query` 仍读陈旧投影」，
 * 实际只能靠手动删 `.shadow/shadow-index/nodes.jsonl` 才能刷新。
 *
 * 触发时机：**写侧索引重建后**（`writer-materialize.ts` 的 `ensureIndex`）——那是「记忆集已变」的
 * 权威信号（记忆是插件自己写的）。资源卡是人/agent 手写的，不在插件写路径上，
 * 由 `loadOrBuildProjection` 的**源指纹**覆盖（见下）。
 * 仅当 `projectionStore.enabled === true` 时调用（默认关，保证默认路径零额外 I/O）。
 */
export const invalidateProjection = async (fs: any, ws: string): Promise<void> => {
  if (!fs || !ws) return;
  try { await getProjectionStore(fs, ws).invalidate(); } catch { /* best-effort：缓存不是真相，重建即可 */ }
};

/** 源指纹落盘位置（与缓存同目录，同属可重建派生）。 */
export const fingerprintRel = () => `${SHADOW_ROOT}/shadow-index/sources.fingerprint`;

/** 记忆日期目录（`.shadow/<YYYY-MM-DD>/`）。 */
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 计算投影**权威源**的指纹：`.shadow/<date>/*.md`（记忆原子）+ `.shadow/resources/*.md`（资源卡）。
 *
 * 两条纪律：
 *   1. **只覆盖权威源**：刻意**不**纳入 `_meta.json` / `_index.md` / `query-log/` / `shadow-index/` ——
 *      读操作会写 meta（hits）与 query-log，纳入它们会让「读一次就失效」自激，缓存永不命中。
 *   2. **用 FsDirEntry 的官方字段**：`target` 是 resolve 产出的子 target（用它 listDir），
 *      `size` / `version` 是后端给的廉价元数据（`version` 是 freshness token，可能不提供 → 记 `?`）。
 *      同尺寸内容修改若后端不给 `version`，则指纹相同、缓存不失效 —— 这是**已知降级**，
 *      与「缓存是性能特性不是真相」一致（需要绝对新鲜时删 `nodes.jsonl` 或关 `projectionStore`）。
 * 返回 undefined = 源目录不可读（调用方据此保守重建）。
 */
export const shadowSourcesFingerprint = async (fs: any, ws: string): Promise<string | undefined> => {
  if (!fs || !ws) return undefined;
  try {
    const root = await fs.resolve(`${ws}/${SHADOW_ROOT}`, { cwd: ws });
    const entries = (await fs.listDir(root)) || [];
    const parts: string[] = [];
    for (const e of entries) {
      const isDate = e.type === "directory" && DATE_DIR.test(e.name);
      const isResources = e.type === "directory" && e.name === "resources";
      if (!isDate && !isResources) continue;
      const sub = (await fs.listDir(e.target)) || [];
      for (const f of sub) {
        if (f.type !== "file") continue;
        parts.push(`${e.name}/${f.name}:${f.size ?? "?"}:${f.version ?? "?"}`);
      }
    }
    return parts.sort().join("\n");
  } catch { return undefined; }
};

const writeFingerprint = async (fs: any, ws: string, fp: string): Promise<void> => {
  try { const t = await fs.resolve(`${ws}/${fingerprintRel()}`, { cwd: ws }); await fs.writeText(t, fp); } catch { /* best-effort */ }
};
const readFingerprint = async (fs: any, ws: string): Promise<string | undefined> => {
  try { const t = await fs.resolve(`${ws}/${fingerprintRel()}`, { cwd: ws }); const txt = await fs.readText(t); return txt ? String(txt).trim() : undefined; } catch { return undefined; }
};

/**
 * 取「加载或派生」：store 命中直接回缓存，未命中/坏则派生并回写；配置关闭则恒直接派生（行为不变）。
 *
 * v1.15.12 修一缺陷：此前**命中缓存后不检查源是否变化**，于是「新增/修改资源卡（`.shadow/resources/`）
 * 或新记忆落盘后，`shadow_query` 仍读陈旧投影」，只能手动删 `nodes.jsonl`。
 * 现在由调用方提供 `sourceFingerprint`（读一次 `listDir` 级成本）：
 *   - **未提供指纹** → 保持**旧行为**（命中即用）——不能因为不传指纹就永不命中；
 *   - 提供了且两侧**都可判定且一致** → 用缓存；
 *   - 提供了但不一致 / 任一侧不可判定（旧缓存无指纹、后端不报 size/version） → **保守重建**。
 *   理由：缓存是**性能特性不是真相**（ADR-0046），宁可重建也不返回陈旧投影。
 */
export const loadOrBuildProjection = async (
  fs: any,
  ws: string,
  cfg: any,
  derive: () => Promise<ShadowNode[]>,
  sourceFingerprint?: () => Promise<string | undefined>,
  /**
   * **被拒收的原子**（只在真正 rebuild 时求值 ⇒ 命中缓存时不会多付一次物化代价）。
   * v1.15.57：不传就还是旧行为（`failures = []`），但生产调用点必须传 —— 否则 manifest 会谎报 0。
   */
  failures?: () => { path: string; reason: string }[],
): Promise<{ nodes: ShadowNode[]; cached: boolean }> => {
  if (!cfg?.projectionStore?.enabled) return { nodes: await derive(), cached: false };
  const store = getProjectionStore(fs, ws);
  let fpNow: string | undefined;
  if (sourceFingerprint) { try { fpNow = await sourceFingerprint(); } catch { fpNow = undefined; } }
  const cached = await store.load();
  if (cached && cached.length) {
    // 未提供指纹 → 无新鲜度信息，保持旧行为（命中即用）。
    if (!sourceFingerprint) return { nodes: cached, cached: true };
    const fpSaved = await readFingerprint(fs, ws);
    if (fpNow !== undefined && fpSaved !== undefined && fpNow === fpSaved) return { nodes: cached, cached: true };
  }
  const nodes = await store.rebuild(derive, failures ? failures() : undefined);
  if (fpNow !== undefined) await writeFingerprint(fs, ws, fpNow);
  return { nodes, cached: false };
};
