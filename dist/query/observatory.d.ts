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
 * 一次观测写入的**结果**（v1.15.94 从 `boolean` 收紧为对象）。
 *
 * 为什么不是 `boolean`：`false` 只说得清「没写成」，说不清**为什么** —— 而调用点必须把原因写进
 * 横幅（ADR-0049 的「可见」要能指向处置）。旧契约逼得横幅**猜**原因：
 * `query/reads.ts` 写死「`.shadow/query-log/` 不可写」，而真实首写失败的原因常常是
 * 「读既有文件时不存在」那一步（见 `recordQueryObservation`），把排障引向错误方向。
 */
export interface QueryObservationOutcome {
    ok: boolean;
    /** **仅在真失败时**给：真实的异常信息（含失败发生在哪一步）。`ok:false` 且无 `reason` = 未启用/无 fs。 */
    reason?: string;
}
/**
 * 记录一次查询观测。返回**是否真的写入成功 + 失败原因**（T8-A / ADR-0049，v1.15.65；原因 v1.15.94）。
 *
 * 旧契约是 `Promise<void>` + `catch { /* best-effort *\/ }` —— 写失败时调用方**无从知道**，
 * 于是 `.shadow/query-log/` 丢的记录与「从没查过」不可区分（读侧只会显示「尚无记录」）。
 * 这条是**默认开启**的能力，所以它的静默在 T8 的 7 条里优先级最高。
 *
 * 现在返回 `{ ok:false, reason }` 时，唯一的租户（`query/reads.ts` 的观测写入点）会经
 * `deps.noteDegrade` 记一条**带真实原因**的降级留痕 ⇒ 读者在横幅上看到「queryLog 写失败（为什么）」。
 *
 * **v1.15.94 修首写永久失败（缺陷 A）**：这是「先读后写」的追加式写入，而旧版把
 * `readText` 那一步也当成**必成功** —— 真实 fs 对**不存在的路径**是**抛错**的
 * ⇒ 全新工作区（`query-log/` 目录都还不存在）上读必然抛 ⇒ `catch` ⇒ `false`
 * ⇒ **首写永远失败、目录永远建不出来、默认开启的观测层从未落盘过**。
 * 现在「读不到（不存在）」当空串处理（照 `persistence/meta.ts#readMetaVersioned` 的写法，
 * 判据复用 `core/util.ts` 的 `isNotFound`），**写失败仍然返回失败**。
 * 目录由宿主 `writeText` 的 `mkdir -p` 建出来（`dsh-fs-local`），本函数不必自己建。
 *
 * `fs`/`ws` 缺失与 `enabled === false` 仍返回 `{ ok:false }`（**不带 reason**）——
 * 前者是调用环境问题（调用点本来就有 fs 守卫），后者是用户**显式**关闭，都不是「坏了」。
 */
export declare const recordQueryObservation: (fs: any, ws: string, cfg: any, obs: QueryObservation) => Promise<QueryObservationOutcome>;
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
