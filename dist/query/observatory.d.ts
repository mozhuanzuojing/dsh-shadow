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
}
export declare const recordQueryObservation: (fs: any, ws: string, cfg: any, obs: QueryObservation) => Promise<void>;
/** 汇总所有 query-log（跨日期），供 read_shadow({mode:"query-log"}) 展示。 */
export declare const summarizeQueryLog: (fs: any, ws: string) => Promise<any>;
export declare const renderQueryLogSummary: (s: any, topic: string) => string;
