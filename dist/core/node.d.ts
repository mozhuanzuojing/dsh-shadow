import type { ParsedMemory } from "./episode.js";
import type { AtomKind, CreatedBy, NodeType } from "./lineage.js";
export type { NodeType } from "./lineage.js";
export interface ShadowRel {
    type: string;
    target: string;
    source: string;
}
export interface ShadowNode {
    id: string;
    type: NodeType;
    source: string;
    title: string;
    content: string[];
    evidence: string[];
    relations: ShadowRel[];
    kind?: AtomKind;
    createdBy?: CreatedBy;
}
/**
 * 被 Evidence Gate 拒收的原子（**可观测**：manifest 的「失败项」必须反映它）。
 *
 * 为什么需要它（v1.15.57 修）：`deriveShadowNodes` 里 `if (!gate.allowed) continue` 把拒收
 * **只丢不记**，而 manifest 的唯一诊断通道是 `buildManifest("1", nodes)` —— 第三个参数
 * （`failures`）**从来没被传过**，于是 `renderManifest` 恒报「失败项 0」，
 * 而实际有一批原子被挡在投影之外（ADR-0066 校准后仍有约 1.3% 的库）。
 * 「报告 0 失败而实际有失败」比不报告更坏 —— 它让人以为这条路径没有问题。
 *
 * 判据与 `deriveShadowNodes` **同源**（同一个 `validateAtomProjection` 调用），不另写一套。
 */
export declare const deriveShadowNodeFailures: (parsed: ParsedMemory[]) => {
    path: string;
    reason: string;
}[];
export declare const nodeTypeOf: (p: ParsedMemory) => NodeType;
export declare const deriveShadowNodes: (parsed: ParsedMemory[]) => ShadowNode[];
export declare const matchShadowNodes: (nodes: ShadowNode[], query: string, scope: NodeType[]) => ShadowNode[];
export interface QueryContextItem {
    type: NodeType;
    title: string;
    content: string[];
    evidence: string[];
    source: string;
}
export declare const queryShadow: (nodes: ShadowNode[], query: string, scope: NodeType[], limit?: number) => QueryContextItem[];
export declare const renderContext: (query: string, items: QueryContextItem[]) => string;
