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
    projectionCached?: boolean;
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
/**
 * 记录一次查询观测。返回**是否真的写入成功**（T8-A / ADR-0049，v1.15.65）。
 *
 * 旧契约是 `Promise<void>` + `catch { /* best-effort *\/ }` —— 写失败时调用方**无从知道**，
 * 于是 `.shadow/query-log/` 丢的记录与「从没查过」不可区分（读侧只会显示「尚无记录」）。
 * 这条是**默认开启**的能力，所以它的静默在 T8 的 7 条里优先级最高。
 *
 * 现在返回 `false` 时，唯一的租户（`query/reads.ts` 的观测写入点）会经 `deps.noteDegrade`
 * 记一条降级留痕 ⇒ 读者在横幅上看到「queryLog 写失败」。
 *
 * `fs`/`ws` 缺失与 `enabled === false` 仍返回 `false`，但**不算降级** —— 前者是调用环境问题
 * （调用点本来就有 fs 守卫），后者是用户**显式**关闭，都不是「坏了」。
 */
export declare const recordQueryObservation: (fs: any, ws: string, cfg: any, obs: QueryObservation) => Promise<boolean>;
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
/**
 * 把报告写成 .shadow/shadow-report.md（系统派生记录，rm -rf 可重建）。
 *
 * **裁定：这里的静默是正当的**（判据见 `core/projection-store.ts` 的「正当静默类判据」）——
 * 报告**正文**由调用方 `query/reads.ts:259` **原样返回给读者**，落盘只是留一份副本
 * ⇒ 写失败时**读者拿到的内容逐字节不变**。
 * 这正是它与 sidecar 写失败的区别（后者会让 `_index.md` 少一行 ⇒ 必须有信号）。
 *
 * **残留风险（写给后来者）**：本函数的**调用点**在 `mode:"shadow-report"` 的输出里说
 * 「生成 `.shadow/shadow-report.md`」，而这句话在写失败时**不成立**且无处可知。
 * 若将来有人依赖「跑过就一定有这个文件」，这条裁定要重新审 —— 那时它就不再是「冗余副本」了。
 */
export declare const writeShadowReport: (fs: any, ws: string, text: string) => Promise<void>;
