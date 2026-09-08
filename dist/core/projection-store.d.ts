import type { ShadowNode } from "./node.js";
import type { ChangeSet } from "./change-set.js";
export interface ShadowProjectionStore {
    save(nodes: ShadowNode[]): Promise<void>;
    load(): Promise<ShadowNode[] | null>;
    invalidate(): Promise<void>;
    rebuild(derive: () => Promise<ShadowNode[]>): Promise<ShadowNode[]>;
    /** ADR-0048⑤：变革驱动——只移除变更 rel 的节点（保持其余缓存），回退到「无变更→不清」。 */
    invalidateFor?(set: ChangeSet): Promise<void>;
}
export declare const projectionIndexRel: () => string;
/** JsonlProjectionStore：把 ShadowNode 投影持久化到 `.shadow/shadow-index/nodes.jsonl`（逐行 JSON，可重建）。 */
export declare const createJsonlProjectionStore: (fs: any, ws: string) => ShadowProjectionStore;
/** 工厂：取本项目 store（当前仅 JsonlProjectionStore；将来加 sqlite/embedded 在此路由）。 */
export declare const getProjectionStore: (fs: any, ws: string) => ShadowProjectionStore;
/** 取「加载或派生」：store 命中直接回缓存，未命中/坏则派生并回写；配置关闭则恒直接派生（行为不变）。 */
export declare const loadOrBuildProjection: (fs: any, ws: string, cfg: any, derive: () => Promise<ShadowNode[]>) => Promise<{
    nodes: ShadowNode[];
    cached: boolean;
}>;
