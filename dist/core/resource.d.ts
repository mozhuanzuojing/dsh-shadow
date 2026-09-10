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
/** 节点 id：以**文件名**（同一目录内天然唯一）为准，不用标题——两张卡可以同名，但不会有同名文件。 */
export declare const resourceIdOf: (relOrName: string) => string;
/**
 * 解析一张资源卡。返回 null = 不上投影（无标题 / 无 source）。
 * 状态机：一级标题 = 名字；`## …投影…` = 开一段按问题的投影；**其它标题一律回到固有层**（否则后面的固有层字段会被投影段吞掉）。
 * 投影段里写了固有层字段（如 `source`）时回落到固有层，不静默丢。
 */
export declare const parseResourceCard: (text: string, rel: string) => ResourceCard | null;
/** 读 `.shadow/resources/*.md`（目录不存在 / 读失败 = 没有资源卡：这是「无数据」，不是「缺件」）。 */
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
 * content 顺序：**按问题的投影段在前**（分数 / 引用证据 / 结论 —— 这是收卡的用处所在），固有层在后；
 * 读侧 `queryShadow` 只取前 6 行，倒过来会让结论/引用证据永远看不见。
 * 过 validateAtomProjection：解析层已挡「无 source」，这里仍走同一道门（口径单一 + 兜底）。
 */
export declare const deriveResourceNodes: (cards: ResourceCard[]) => ShadowNode[];
