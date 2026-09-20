// dsh-shadow —— decision/guard.ts：Decision 原语的**边界守卫**（ADR-0096 §4）。
//
// 与 action/guard.ts、planning/guard.ts **同形**：`xIsClean` 判 + `assertX` 带**非空 reason** + `renderX`。
// 判据在这里**收一处**（本仓纪律：「判据收一处 / 修一类而不是修一条」）——
// choice.ts 只调用 `declarationViolations`，不再自己判一遍。
//
// 违例一律**逐条点名**，且**不静默纠正**（不归一化、不补默认值、不丢掉多余键）——
// 见 ADR-0096 §4 第 6 条与 ADR-0049（缺件不静默）。
import type { EngineDeclaration, EngineUnavailable } from "./types.js";

/**
 * 类型守卫：把 `声明 | 不可用` 收窄成「不可用」。
 *
 * 收在判据文件里，避免 choice.ts / engine.ts 各自写一遍 `status === "unavailable"`
 * （本仓纪律：「判据收一处」——同一个比较点散在多处是已发生过代价的形态）。
 */
export const isUnavailable = (v: EngineDeclaration | EngineUnavailable): v is EngineUnavailable =>
  (v as EngineUnavailable)?.status === "unavailable";


/**
 * 分布求和的容差，**显式写出**。
 *
 * 为什么不隐式归一化：把「和 != 1」悄悄改成「归一化一下就合法」，等于**替引擎改它的声明**，
 * 那正是本层禁止的「静默纠正」。要么原样合法，要么显式 invalid。
 */
export const DISTRIBUTION_SUM_TOLERANCE = 1e-6;

/** 判据 ①：候选集非空（空候选集上的「选择」没有意义）。 */
export const candidatesPresent = (d: EngineDeclaration): boolean =>
  Array.isArray(d?.candidates) && d.candidates.length > 0;

/** 判据 ②：`selected` ∈ `candidates`。 */
export const selectedIsCandidate = (d: EngineDeclaration): boolean =>
  candidatesPresent(d) && d.candidates.includes(d.selected);

/** 判据 ③：`rawOutput` 非空 —— 没有原始声明就不叫「声明」（ADR-0096 §5）。 */
export const rawOutputPresent = (d: EngineDeclaration): boolean =>
  typeof d?.rawOutput === "string" && d.rawOutput.trim().length > 0;

/**
 * 判据 ④：分布的键**恰好等于**候选集 —— **多一个少一个都非法**。
 *
 * 口径取自 jev 的 `validate_choice`（`jev_ultrafast/model.py:30-45`：`probabilities` 的键必须覆盖
 * 且只覆盖候选集）。它挡的是「报了一个没在候选里的东西」与「漏报某个候选」这两种含糊。
 */
export const distributionMatchesCandidates = (d: EngineDeclaration): boolean => {
  if (d?.reportedDistribution === null) return true; // 显式「本引擎不产出分布」⇒ 本条不适用
  if (!d?.reportedDistribution) return false; // undefined = 没填，不是「没有分布」
  const keys = Object.keys(d.reportedDistribution);
  const unique = new Set(keys);
  if (unique.size !== keys.length) return false; // 同一个键出现两次（理论上不可达，仍显式挡）
  if (keys.length !== d.candidates.length) return false;
  const set = new Set(d.candidates);
  return keys.every((k) => set.has(k));
};

/** 判据 ⑤：分布里每个值都是**有限数**且 ∈ [0,1]。 */
export const distributionInRange = (d: EngineDeclaration): boolean => {
  if (d?.reportedDistribution === null) return true; // 同上：不适用
  if (!d?.reportedDistribution) return false;
  return Object.values(d.reportedDistribution).every(
    (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1,
  );
};

/** 判据 ⑥：分布求和 ≈ 1（容差见 `DISTRIBUTION_SUM_TOLERANCE`）。 */
export const distributionSumsToOne = (d: EngineDeclaration): boolean => {
  if (d?.reportedDistribution === null) return true; // 同上：不适用
  if (!d?.reportedDistribution) return false;
  const values = Object.values(d.reportedDistribution);
  if (values.length === 0) return false;
  const sum = values.reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1) <= DISTRIBUTION_SUM_TOLERANCE;
};

/** 引擎名非空（`unavailable` 的理由要能指回是哪个引擎）。 */
export const engineNamed = (d: EngineDeclaration): boolean =>
  typeof d?.engine === "string" && d.engine.trim().length > 0;

/**
 * **刻意不判**：`argmax(reportedDistribution) === selected`。
 *
 * 这与 jev 的 `validate_choice` **不同，是有意的**：jev 要求 argmax 与 choice 一致；
 * 本层**不要求**。理由 —— 一旦要求，**选择就由那组数字决定**，那组数字于是成了 shadow 的优化目标，
 * 正好落回 planning/guard.ts:11 那条 `score → optimization → preference → value → identity` 链。
 * 本层要的是：**「引擎选了什么」与「引擎自报了什么分布」是两条独立的事实**，不是一条被另一条推出来。
 */

/** 全部判据的**逐条**违规清单（空数组 = 合法）。顺序即上面的判据序号，便于对照。 */
export const declarationViolations = (d: EngineDeclaration): string[] => {
  const out: string[] = [];
  if (!engineNamed(d)) out.push("engine 为空");
  if (!candidatesPresent(d)) out.push("candidates 为空");
  if (!selectedIsCandidate(d)) out.push(`selected「${d?.selected}」不在 candidates 里`);
  if (!rawOutputPresent(d)) out.push("rawOutput 为空（没有原始声明就不叫声明）");
  if (!distributionMatchesCandidates(d))
    out.push("reportedDistribution 的键与 candidates 不逐字对齐（多一个/少一个都非法；不产出请显式写 null）");
  if (!distributionInRange(d)) out.push("reportedDistribution 里有非有限数或超出 [0,1] 的值");
  if (!distributionSumsToOne(d)) out.push(`reportedDistribution 求和偏离 1 超过容差 ${DISTRIBUTION_SUM_TOLERANCE}`);
  return out;
};

/** 判据合取。 */
export const declarationIsClean = (d: EngineDeclaration): boolean => declarationViolations(d).length === 0;

/** 与 action/guard.ts 的 `assertX` 同形：`{ok, reason?}`，reason **必须非空**才有意义。 */
export const assertDeclarationValid = (d: EngineDeclaration) => {
  const violations = declarationViolations(d);
  return { ok: violations.length === 0, reason: violations.length === 0 ? undefined : violations.join("；") };
};

/**
 * 渲染成给人看的一行/多行。**只读**：不改写任何值、不做归一化、不补默认。
 * 与 action/guard.ts 的 `renderCandidate` 一样，把「这不是执行/不是结论」写进正文。
 */
export const renderDeclaration = (d: EngineDeclaration): string =>
  [
    "[Decision Declaration]",
    `engine ${d?.engine ?? "—"}`,
    `selected ${d?.selected ?? "—"}（∈ candidates ${(d?.candidates ?? []).length} 个）`,
    `reportedDistribution ${d?.reportedDistribution === null ? "null（该引擎不产出分布）" : JSON.stringify(d?.reportedDistribution ?? null)}`,
    `rawOutput ${String(d?.rawOutput ?? "").trim().length} 字（逐字留存，即证据）`,
    "（引擎**产出的选择** ≠ 已发生的人事决策；后者归 DecisionEvent / adr/0037）",
  ].join("\n");
