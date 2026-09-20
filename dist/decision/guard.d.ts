import type { EngineDeclaration, EngineUnavailable } from "./types.js";
/**
 * 类型守卫：把 `声明 | 不可用` 收窄成「不可用」。
 *
 * 收在判据文件里，避免 choice.ts / engine.ts 各自写一遍 `status === "unavailable"`
 * （本仓纪律：「判据收一处」——同一个比较点散在多处是已发生过代价的形态）。
 */
export declare const isUnavailable: (v: EngineDeclaration | EngineUnavailable) => v is EngineUnavailable;
/** 判据 ①：候选集非空（空候选集上的「选择」没有意义）。 */
export declare const candidatesPresent: (d: EngineDeclaration) => boolean;
/** 判据 ②：`selected` ∈ `candidates`。 */
export declare const selectedIsCandidate: (d: EngineDeclaration) => boolean;
/** 判据 ③：`rawOutput` 非空 —— 没有原始声明就不叫「声明」（ADR-0096 §5）。 */
export declare const rawOutputPresent: (d: EngineDeclaration) => boolean;
/** 判据 ④：引擎名非空（`unavailable` 的理由要能指回是哪个引擎）。 */
export declare const engineNamed: (d: EngineDeclaration) => boolean;
/**
 * **刻意不判**（原样保留自 v1.16.0，理由在 v1.17.0 变得更强）：
 *
 * 早先协议里有一个**引擎自报的分布**字段时，这里明确**不要求** `argmax(分布) === selected` ——
 * 一旦要求，**选择就由那组数字决定**，那组数字就成了 shadow 的优化目标，
 * 正好落回 planning/guard.ts:11 的 `score → optimization → preference → value → identity` 链。
 *
 * v1.17.0 把那个字段**整个删掉**之后，这条「不判」变成了**结构性的**：
 * shadow 侧根本没有可据以排序的数字（引擎原始输出里的数字只作为 `rawOutput` 逐字留存）。
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
 * 渲染成给人看的多行。**只读**：不改写任何值、不做归一化、不补默认。
 * 与 action/guard.ts 的 `renderCandidate` 一样，把「这不是执行 / 不是结论」写进正文。
 */
export declare const renderDeclaration: (d: EngineDeclaration) => string;
