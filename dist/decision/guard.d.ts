import type { EngineDeclaration, EngineUnavailable } from "./types.js";
/**
 * 类型守卫：把 `声明 | 不可用` 收窄成「不可用」。
 *
 * 收在判据文件里，避免 choice.ts / engine.ts 各自写一遍 `status === "unavailable"`
 * （本仓纪律：「判据收一处」——同一个比较点散在多处是已发生过代价的形态）。
 */
export declare const isUnavailable: (v: EngineDeclaration | EngineUnavailable) => v is EngineUnavailable;
/**
 * 分布求和的容差，**显式写出**。
 *
 * 为什么不隐式归一化：把「和 != 1」悄悄改成「归一化一下就合法」，等于**替引擎改它的声明**，
 * 那正是本层禁止的「静默纠正」。要么原样合法，要么显式 invalid。
 */
export declare const DISTRIBUTION_SUM_TOLERANCE = 0.000001;
/** 判据 ①：候选集非空（空候选集上的「选择」没有意义）。 */
export declare const candidatesPresent: (d: EngineDeclaration) => boolean;
/** 判据 ②：`selected` ∈ `candidates`。 */
export declare const selectedIsCandidate: (d: EngineDeclaration) => boolean;
/** 判据 ③：`rawOutput` 非空 —— 没有原始声明就不叫「声明」（ADR-0096 §5）。 */
export declare const rawOutputPresent: (d: EngineDeclaration) => boolean;
/**
 * 判据 ④：分布的键**恰好等于**候选集 —— **多一个少一个都非法**。
 *
 * 口径取自 jev 的 `validate_choice`（`jev_ultrafast/model.py:30-45`：`probabilities` 的键必须覆盖
 * 且只覆盖候选集）。它挡的是「报了一个没在候选里的东西」与「漏报某个候选」这两种含糊。
 */
export declare const distributionMatchesCandidates: (d: EngineDeclaration) => boolean;
/** 判据 ⑤：分布里每个值都是**有限数**且 ∈ [0,1]。 */
export declare const distributionInRange: (d: EngineDeclaration) => boolean;
/** 判据 ⑥：分布求和 ≈ 1（容差见 `DISTRIBUTION_SUM_TOLERANCE`）。 */
export declare const distributionSumsToOne: (d: EngineDeclaration) => boolean;
/** 引擎名非空（`unavailable` 的理由要能指回是哪个引擎）。 */
export declare const engineNamed: (d: EngineDeclaration) => boolean;
/**
 * **刻意不判**：`argmax(reportedDistribution) === selected`。
 *
 * 这与 jev 的 `validate_choice` **不同，是有意的**：jev 要求 argmax 与 choice 一致；
 * 本层**不要求**。理由 —— 一旦要求，**选择就由那组数字决定**，那组数字于是成了 shadow 的优化目标，
 * 正好落回 planning/guard.ts:11 那条 `score → optimization → preference → value → identity` 链。
 * 本层要的是：**「引擎选了什么」与「引擎自报了什么分布」是两条独立的事实**，不是一条被另一条推出来。
 */
/** 全部判据的**逐条**违规清单（空数组 = 合法）。顺序即上面的判据序号，便于对照。 */
export declare const declarationViolations: (d: EngineDeclaration) => string[];
/** 判据合取。 */
export declare const declarationIsClean: (d: EngineDeclaration) => boolean;
/** 与 action/guard.ts 的 `assertX` 同形：`{ok, reason?}`，reason **必须非空**才有意义。 */
export declare const assertDeclarationValid: (d: EngineDeclaration) => {
    ok: boolean;
    reason: string;
};
/**
 * 渲染成给人看的一行/多行。**只读**：不改写任何值、不做归一化、不补默认。
 * 与 action/guard.ts 的 `renderCandidate` 一样，把「这不是执行/不是结论」写进正文。
 */
export declare const renderDeclaration: (d: EngineDeclaration) => string;
