/** 引擎标识：只是一个**名字**，不是等级（本仓不自造 stable/beta/experimental，D8）。 */
export type EngineName = string;
/**
 * 一次「引擎产出」的完整声明。
 *
 * 每个字段都是**必填**的（缺件不静默，ADR-0049）：引擎不能靠「少填一个」来含糊过去。
 * 真正**无**分布的情况要**显式写 `null`**，不是省略 —— 见 `reportedDistribution`。
 */
export interface EngineDeclaration {
    /** 哪个引擎产出的（`heuristic-v1`；将来的 llm / jev 后端也只是实现，ADR-0096 §7）。 */
    readonly engine: EngineName;
    /** 候选集：由**调用方**给。引擎只选不造（ADR-0096 §5；同 planning/guard.ts 的「objective 必须外部来源」）。 */
    readonly candidates: readonly string[];
    /** 选中的候选，必须 **∈** `candidates`。 */
    readonly selected: string;
    /**
     * **引擎自报**的分布（候选 → 该候选的相对权重/概率）。两种合法形态：
     *   · 对象 —— 键必须**恰好等于** `candidates`（多一个少一个都非法），每个值有限且 ∈ [0,1]，和 ≈ 1；
     *   · **`null`** —— 该引擎**不产出**分布（如纯规则引擎）。
     *
     * `null` 是**显式声明**，与「忘了填」在类型上就不一样。**T1 的 HeuristicDecisionEngine 报 `null`** ——
     * 一个规则引擎没有概率；**逼它编一组数，就等于让 shadow 自己打分**（踩 planning/guard.ts:11 的
     * `score → optimization → preference → value → identity` 链）。所以这里宁可空，不可编。
     */
    readonly reportedDistribution: Readonly<Record<string, number>> | null;
    /**
     * 引擎的**原始输出**逐字留存。**这就是证据**（ADR-0096 §5）。
     * 同族先例：jev 把 `raw_answers` 与 `request` 整个留下来（`jev_ultrafast/model.py:143,147`）。
     * 判据要求它非空 —— 没有原始声明，就不叫「声明」。
     */
    readonly rawOutput: string;
}
/** 引擎的输入。候选集由调用方给；**引擎不得增删改名候选**（ADR-0096 §5）。 */
export interface DecisionInput {
    readonly question: string;
    /** 只放**叶子字段**（字符串）。不得塞 Cordis / Session / Memory 等活对象。 */
    readonly context: Readonly<Record<string, string>>;
    /** 候选集（外部来源）。 */
    readonly candidates: readonly string[];
}
/** 可插拔后端：heuristic / llm / jev **都只是实现**，不是依赖（ADR-0096 §7）。 */
export interface DecisionEngine {
    readonly name: EngineName;
    /**
     * 产出：要么一份声明，要么**引擎自己声明不可用**。
     *
     * 允许后者是**必须**的：一个规则引擎完全可能「没有规则命中」，而那时它**只能不猜**。
     * 若签名只准返回声明，引擎就被**逼着编一个选择**出来 —— 那正是本层禁止的
     * （见 heuristic.ts 的 `heuristic_no_rule_matched`）。
     */
    decide(input: DecisionInput): EngineDeclaration | EngineUnavailable;
}
/**
 * 显式不可用（ADR-0049：缺件不静默；未知枚举**不得落回默认**）。
 * 未知引擎名 / 规则没命中 / 声明非法 —— 一律走这里，**绝不**静默 fallback 成某个默认引擎。
 */
export interface EngineUnavailable {
    readonly status: "unavailable";
    readonly reason: string;
}
/** 一次判定的结果：要么一份**合法**声明，要么**显式**不可用。**没有第三种**（没有「默认」）。 */
export type DecisionResult = {
    readonly status: "ok";
    readonly declaration: EngineDeclaration;
} | EngineUnavailable;
