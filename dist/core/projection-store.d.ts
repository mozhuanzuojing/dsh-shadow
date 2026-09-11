import type { ShadowNode } from "./node.js";
import type { ChangeSet } from "./change-set.js";
export interface ShadowProjectionStore {
    save(nodes: ShadowNode[]): Promise<void>;
    load(): Promise<ShadowNode[] | null>;
    invalidate(): Promise<void>;
    rebuild(derive: () => Promise<ShadowNode[]>): Promise<ShadowNode[]>;
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
export declare const projectionIndexRel: () => string;
/** JsonlProjectionStore：把 ShadowNode 投影持久化到 `.shadow/shadow-index/nodes.jsonl`（逐行 JSON，可重建）。 */
export declare const createJsonlProjectionStore: (fs: any, ws: string) => ShadowProjectionStore;
/** 工厂：取本项目 store（当前仅 JsonlProjectionStore；将来加 sqlite/embedded 在此路由）。 */
export declare const getProjectionStore: (fs: any, ws: string) => ShadowProjectionStore;
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
export declare const invalidateProjection: (fs: any, ws: string) => Promise<void>;
/** 源指纹落盘位置（与缓存同目录，同属可重建派生）。 */
export declare const fingerprintRel: () => string;
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
export declare const shadowSourcesFingerprint: (fs: any, ws: string) => Promise<string | undefined>;
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
export declare const loadOrBuildProjection: (fs: any, ws: string, cfg: any, derive: () => Promise<ShadowNode[]>, sourceFingerprint?: () => Promise<string | undefined>) => Promise<{
    nodes: ShadowNode[];
    cached: boolean;
}>;
