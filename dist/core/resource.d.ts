import type { ShadowNode } from "./node.js";
import type { AtomEvidenceRef } from "./lineage.js";
/** 资源卡目录（相对工作区；位于 shadowRoot 内，写入受既有安全边界约束）。 */
export declare const RESOURCE_DIR = ".shadow/resources";
/** 解析出的一句投影（`## 投影 @ <问题>` 段）。 */
export interface ResourceProjection {
    forQuestion: string;
    date: string;
    scores: Record<string, string>;
    citation: string;
    conclusion: string;
}
/** 一张资源卡：固有层字段 + 若干「按问题」的投影。 */
export interface ResourceCard {
    rel: string;
    name: string;
    fields: Record<string, string>;
    projections: ResourceProjection[];
}
export declare const resourceIdOf: (name: string) => string;
/** 解析一张资源卡。失败（无标题 / 无 source）返回 null —— 不上投影，把卡片留在磁盘上。 */
export declare const parseResourceCard: (text: string, rel: string) => ResourceCard | null;
/** 读 `.shadow/resources/*.md`（目录不存在 / 读失败 = 没有资源卡，不是错误）。 */
export declare const listResourceCards: (fs: any, ws: string) => Promise<ResourceCard[]>;
/** 卡片 → 节点用的 lineage（event-sourced：只记录卡片里写着的事实，不推断）。 */
export declare const resourceLineage: (card: ResourceCard) => {
    source: string;
    createdBy: "tool";
    evidence: AtomEvidenceRef[];
    createdAt: string;
};
/**
 * 资源卡 → ShadowNode(type:"resource")。
 * 过 validateAtomProjection：无 source 证据的判定在 parseResourceCard 已挡一层，这里仍走同一道门（口径单一）。
 */
export declare const deriveResourceNodes: (cards: ResourceCard[]) => ShadowNode[];
/** 供调试/测试：把「目录 → 节点」一步走完（不做缓存）。 */
export declare const deriveResourceNodesFromDir: (fs: any, ws: string) => Promise<ShadowNode[]>;
/** 派生的投影时间戳（仅用于清单/调试，不写回卡片）。 */
export declare const resourceDerivedAt: () => string;
