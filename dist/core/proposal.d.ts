import type { ObservationTrace } from "./types.js";
/** 提议的五类（用户指定；本原语不为任何一类开直通口）。 */
export type ProposalKind = "subject" | "relation" | "outcome" | "pattern" | "knowledge";
/** 提议的来源。**事实层不接受 `model-proposal`**（它可以提议，不能断言）。 */
export type ProposalSource = "model-proposal" | "user" | "tool" | "ci";
/** 提议「基于什么」的输入引用（**必填非空** —— 否则候选连被复核的资格都没有）。 */
export interface ProposalInputRef {
    readonly file: string;
    readonly line: number;
}
/** 候选（CANDIDATE）：可以海量产生，**不得参与任何事实统计**。 */
export interface Proposal {
    readonly type: "proposal";
    readonly id: string;
    readonly kind: ProposalKind;
    readonly source: ProposalSource;
    readonly model?: string;
    readonly promptVersion?: string;
    readonly inputRefs: readonly ProposalInputRef[];
    readonly proposedRelation: string;
    readonly subject?: string;
    readonly createdAt: string;
}
/** 确认动作。**Confirmation 是授权事件，不是事实状态**（用户 2026-09-12 冻结）。 */
export type ConfirmationAction = "confirm" | "reject" | "revoke";
/** 谁能确认。**没有 `model`** —— 模型不能确认自己提出的东西。 */
export type ConfirmationActor = "human" | "tool" | "ci";
/** 授权事件：谁、在何时、对哪个 proposal、做了什么动作。 */
export interface Confirmation {
    readonly type: "confirmation";
    readonly id: string;
    readonly proposal: string;
    readonly actor: ConfirmationActor;
    readonly action: ConfirmationAction;
    readonly timestamp: string;
    readonly reason?: string;
}
/** 事实（FACT）：**投影**，不是可写入的记录；`id` 确定性派生（同输入同结果）。 */
export interface Fact {
    readonly type: "fact";
    readonly id: string;
    readonly proposal: string;
    readonly confirmation: string;
    readonly kind: ProposalKind;
    readonly statement: string;
}
/** 一条记录的拒收理由（空数组 = 收下）。**`type:"fact"` 在此被拒**。 */
export declare const validateRecord: (record: unknown) => string[];
/**
 * 投影：由 `(proposals, confirmations)` 派生出**事实**。
 *
 * 判定（逐字对应 ADR-0082 的不变量）：
 *   ① 该 proposal 必须**通过校验**且 `inputRefs` 非空（「基于什么提议」在场）；
 *   ② 必须存在指向它的 confirmation；
 *   ③ 该 confirmation 的**有效动作**必须是 `confirm`（见 `effectiveConfirmations`）；
 *      出现 `reject` / `revoke` ⇒ **不产生事实**（撤销即事实消失，且**历史保留**）。
 *
 * 不变量：**只有 FACT 能改变认知统计；CANDIDATE 只能改变「待确认候选」的统计。**
 * 故任何统计入口都应消费本函数的 `facts`，而不是原始 records —— `factualOnly()` 是那条唯一入口。
 */
export declare const projectFacts: (records: readonly unknown[]) => {
    facts: Fact[];
    violations: string[];
};
/** **唯一**允许认知统计消费的入口（Pattern / M5 / 棘轮都必须走这里，不得直接吃 records）。 */
export declare const factualOnly: (records: readonly unknown[]) => Fact[];
/**
 * 单个 actor 的裁决分布。
 * **为什么要分层**（M1-A′ dry run 的 F8）：确定性规则会用 `actor:"tool"` 自动确认大量候选，
 * 若与人的裁决混在一个比率里，**工具自确认就能把「接受率」刷成满分** —— 那个数字不衡量任何东西。
 */
export interface CandidateActorStats {
    readonly actor: ConfirmationActor;
    readonly confirmed: number;
    readonly rejected: number;
    readonly revoked: number;
    /** 该 actor 的 `confirmed / (confirmed + rejected)`；该 actor 分母 0 ⇒ `null`。 */
    readonly acceptanceRate: number | null;
    readonly rejectionRate: number | null;
}
/** 候选层的可见性读数（防「Silent Candidate Graveyard」：不污染主认知，**但必须可见**）。 */
export interface CandidateStats {
    readonly candidates: number;
    readonly confirmed: number;
    readonly rejected: number;
    /** 曾经确认、后被撤销（**不是「被拒」** —— 与 `reject` 是不同语义，不得合并）。 */
    readonly revoked: number;
    readonly pendingConfirmation: number;
    /** 最老**待确认**候选的年龄（只看 pending —— 已裁决的候选再老也不是「没人看」）。 */
    readonly oldestPendingDays: number | null;
    /** `createdAt` 无法解析 ⇒ 年龄**不可测**的条数（**缺件不静默**，ADR-0049）。 */
    readonly unmeasuredAges: number;
    /**
     * 总体接受率 = **仅 `human`** 的 `confirmed / (confirmed + rejected)`。
     * **无任何 `human` 裁决 ⇒ `null`（不可测，不报 0）** —— 见 F8：否则工具自确认会报出一个满分假象。
     * 需要工具/CI 的比率时读 `byActor`。
     */
    readonly acceptanceRate: number | null;
    readonly rejectionRate: number | null;
    /** 按 `human → tool → ci` 顺序，**只列出实际有裁决的 actor**。 */
    readonly byActor: readonly CandidateActorStats[];
}
/**
 * 候选可见性。`now` **由调用方传入**（本层不读时钟 ⇒ 可复现）。
 *
 * 口径：每个 proposal 按 `effectiveConfirmations` 的判定落入
 * `confirmed / rejected / revoked / pending` 之一 ⇒ **`candidates = 四者之和`**（可机械断言）。
 * 比率的分母为 0 ⇒ `null`（**不可测不报 0**）；**待确认不计入分母**（否则「还没人看」会被算成「被拒」）。
 */
export declare const candidateStats: (records: readonly unknown[], now: string) => CandidateStats;
/** 供类型检查引用的占位（本层不消费 trace；此处只为让 `ObservationTrace` 的纯类型依赖显式化）。 */
export type ProposalTraceRef = Pick<ObservationTrace, "id">;
