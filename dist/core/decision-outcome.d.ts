import type { Proposal, ProposalInputRef, Confirmation } from "./proposal.js";
/** 归属键的**来源**。本模块只接受显式键；没有键的决策/观察一律不参与归属。 */
export declare const ATTRIBUTION_RULE = "same-key-window/v1";
/** 决策侧（由调用方从 `ObservationTrace.decision` 等来源**显式**整理出来；本模块不解析 trace）。 */
export interface DecisionRecord {
    readonly id: string;
    /** 归属键：**显式**给出的 entry/subject（本模块绝不从文本推断）。 */
    readonly key: string;
    readonly at: string;
    readonly action: string;
    readonly rationale?: string;
}
/** 观察侧：一条「实际发生了什么」的外部观察（来源必须是 user/tool/ci，**不得是模型**）。 */
export interface OutcomeObservation {
    readonly id: string;
    readonly key: string;
    readonly at: string;
    readonly actual: string;
    readonly source: "user" | "tool" | "ci";
    /** 可审计的输入引用（进 proposal 的 `inputRefs`，**必填非空**）。 */
    readonly inputRefs: readonly ProposalInputRef[];
}
/** 归属结果（**候选层**：还不是事实）。 */
export interface Attribution {
    readonly decision: string;
    readonly observation: string;
    readonly key: string;
    readonly rule: string;
    readonly windowDays: number;
    readonly lagDays: number;
}
export interface AttributionResult {
    readonly attributions: readonly Attribution[];
    /** 并列最晚前驱 ⇒ **不归属**，但要**可见**（ADR-0049：缺件不静默）。 */
    readonly ambiguous: readonly {
        observation: string;
        key: string;
        candidates: readonly string[];
    }[];
    /** 没有任何在窗内决策的观察（同样**可见**，不是静默丢弃）。 */
    readonly unattributed: readonly {
        observation: string;
        key: string;
    }[];
}
/**
 * 按 `same-key-window/v1` 归属。**纯函数、不看时钟、不读文件**。
 * @param windowDays - 时间窗（天）。由调用方给出（走 config，**不是这里的硬编码魔数**）。
 */
export declare const attributeOutcomes: (input: {
    readonly decisions: readonly DecisionRecord[];
    readonly observations: readonly OutcomeObservation[];
    readonly windowDays: number;
    /** 归属键缺失时的处理：`skip`（默认，保守）或 `include-as-unkeyed`（键为空串也参与比对）。 */
    readonly unkeyed?: "skip" | "include-as-unkeyed";
}) => AttributionResult;
/**
 * 把归属结果变成**原语记录**（Proposal + Confirmation）—— 这是「接线」的关键：
 * **M1 的结果事实必须经 `projectFacts` 产生，本模块不返回事实。**
 *
 * - `Proposal.source` = **观察的来源**（user/tool/ci；内容是他们给的）；
 * - `Confirmation.actor` = `"tool"`（**确定性规则**这条写入路径），`reason` 写明规则与数字 ⇒ **可审计**。
 */
export declare const toPrimitiveRecords: (result: AttributionResult, observations: readonly OutcomeObservation[]) => {
    proposals: Proposal[];
    confirmations: Confirmation[];
};
/** 结果结算读数（**`pending` 不设窗口**；年龄只暴露风险，**不写回状态**）。 */
export interface OutcomeReadout {
    readonly decisions: number;
    readonly settled: number;
    readonly pending: number;
    readonly ambiguous: number;
    readonly unattributed: number;
    readonly buckets: {
        readonly lt7: number;
        readonly d7to30: number;
        readonly d30to90: number;
        readonly ge90: number;
    };
    readonly oldest: {
        readonly id: string;
        readonly at: string;
        readonly ageDays: number;
    } | null;
    /** 派生指标：待结算年龄的 p90（nearest-rank）。无 pending ⇒ `null`（**不可测，不报 0**）。 */
    readonly pendingAgeP90: number | null;
}
/** nearest-rank p90（确定性；不插值 —— 插值会造出不存在的年龄）。 */
export declare const p90: (values: readonly number[]) => number | null;
/**
 * 结算读数。`now` **由调用方传入**（不读时钟 ⇒ 可复现）。
 * **注意**：本函数**不修改任何状态** —— 年龄只用于暴露「正常等待 / 长期积压 / 疑似永不结算」。
 */
export declare const outcomeReadout: (input: {
    readonly decisions: readonly DecisionRecord[];
    readonly result: AttributionResult;
}, now: string) => OutcomeReadout;
/** 渲染成一行（供读路径复用；**不含任何判断**，只有数字与「未观察到」）。 */
export declare const renderOutcomeReadout: (r: OutcomeReadout) => string;
