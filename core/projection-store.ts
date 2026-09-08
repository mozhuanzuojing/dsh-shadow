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
  rebuild(derive: () => Promise<ShadowNode[]>): Promise<ShadowNode[]>;
  /** ADR-0048⑤：变革驱动——只移除变更 rel 的节点（保持其余缓存），回退到「无变更→不清」。 */
  invalidateFor?(set: ChangeSet): Promise<void>;
}

export const projectionIndexRel = () => `${SHADOW_ROOT}/shadow-index/nodes.jsonl`;

/** JsonlProjectionStore：把 ShadowNode 投影持久化到 `.shadow/shadow-index/nodes.jsonl`（逐行 JSON，可重建）。 */
export const createJsonlProjectionStore = (fs: any, ws: string): ShadowProjectionStore => {
  const abs = async () => (await fs.resolve(`${ws}/${projectionIndexRel()}`, { cwd: ws })).displayPath;
  return {
    async save(nodes) {
      const t = await abs();
      const body = (nodes || []).map((n) => JSON.stringify(n)).join("\n");
      await fs.writeText(t, body ? body + "\n" : "");
    },
    async load() {
      try {
        const t = await abs();
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
      try { const t = await abs(); await fs.writeText(t, ""); } catch { /* best-effort */ }
    },
    async rebuild(derive) {
      const nodes = await derive();
      await this.save(nodes);
      // ADR-0048⑧：重建后写 manifest（可观测：节点数/来源数/构建时间）。
      await writeManifest(fs, ws, buildManifest("1", nodes));
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

/** 取「加载或派生」：store 命中直接回缓存，未命中/坏则派生并回写；配置关闭则恒直接派生（行为不变）。 */
export const loadOrBuildProjection = async (fs: any, ws: string, cfg: any, derive: () => Promise<ShadowNode[]>): Promise<{ nodes: ShadowNode[]; cached: boolean }> => {
  if (!cfg?.projectionStore?.enabled) return { nodes: await derive(), cached: false };
  const store = getProjectionStore(fs, ws);
  const cached = await store.load();
  if (cached && cached.length) return { nodes: cached, cached: true };
  const nodes = await store.rebuild(derive);
  return { nodes, cached: false };
};
