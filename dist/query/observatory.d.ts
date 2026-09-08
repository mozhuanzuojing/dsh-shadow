import type { ParsedMemory } from "../core/episode.js";
/** 一条查询观测记录（旁路、可重建）。
 * candidateNodes = 本次派生的全部 ShadowNode；returnedNodes = scope+query 过滤后返回条数。
 * relationCount = 返回节点携带的 relations 数（回答「relations 是否够」）；
 * nodeTypes = 返回节点的类型分布（回答「Node 类型是否够」）；
 * nodeTitles = 返回节点 title 列表（回答「同一查询的 Node 是否稳定」）。
 */
export interface QueryObservation {
    date: string;
    ts: string;
    query: string;
    scope: string[];
    limit: number;
    candidateNodes: number;
    returnedNodes: number;
    evidenceCount: number;
    evidenceNodes: number;
    relationCount: number;
    relationNodes: number;
    nodeTypes: Record<string, number>;
    nodeTitles: string[];
    latencyMs: number;
    evidenceByType?: Record<string, {
        total: number;
        ev: number;
    }>;
    evidenceByKind?: Record<string, {
        total: number;
        ev: number;
    }>;
    evidenceByCreatedBy?: Record<string, {
        total: number;
        ev: number;
    }>;
}
export declare const evidenceBreakdownOf: (nodes: any[]) => {
    byType: Record<string, {
        total: number;
        ev: number;
    }>;
    byKind: Record<string, {
        total: number;
        ev: number;
    }>;
    byCreatedBy: Record<string, {
        total: number;
        ev: number;
    }>;
};
export declare const recordQueryObservation: (fs: any, ws: string, cfg: any, obs: QueryObservation) => Promise<void>;
/** 汇总所有 query-log（跨日期），供 read_shadow({mode:"query-log"}) 展示。 */
export declare const summarizeQueryLog: (fs: any, ws: string) => Promise<any>;
export declare const renderQueryLogSummary: (s: any, topic: string) => string;
/** Evidence Density 健康阈值：dsh-shadow 坚持「宁可少回答，不要无证据上下文」。 */
export declare const EVIDENCE_HEALTHY = 90;
/** 从记忆原子扫描「约束型/任务型」内容，推测可能缺失的 Node 类型（如 constraint/task）。 */
export declare const missingTypesOf: (parsed: ParsedMemory[]) => {
    type: string;
    count: number;
    currentTypes: Record<string, number>;
}[];
/** 从 query-log 聚合 + 记忆扫描，构造健身报告数据。 */
export declare const buildFitnessReport: (agg: any, parsed: ParsedMemory[]) => {
    date: string;
    agg: any;
    evidenceDensity: any;
    missing: {
        type: string;
        count: number;
        currentTypes: Record<string, number>;
    }[];
    observations: string[];
    evByType: any;
    evByKind: any;
    evByCreatedBy: any;
};
export declare const renderFitnessReport: (r: any) => string;
/** 把报告写成 .shadow/shadow-report.md（系统派生记录，rm -rf 可重建）。 */
export declare const writeShadowReport: (fs: any, ws: string, text: string) => Promise<void>;
