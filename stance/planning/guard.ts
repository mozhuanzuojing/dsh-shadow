// dsh-shadow —— planning/guard.ts：Planning 边界守卫（objective 外部来源、无 score、comparison 非 winner、criteria≠value）。
import type { PlanCandidate, PlanEvaluation, PlanningObjective } from "./types.js";

export const objectiveIsExternal = (o: PlanningObjective | null | undefined) =>
  !!o && o.source === "external" && !/observer|generateObjective|observer objective/i.test(String(o.description || ""));
export const assertObjectiveExternal = (o: PlanningObjective | null | undefined) => {
  const v = objectiveIsExternal(o);   // A27：谓词只求值一次（同族 4 处，见 `epistemic/action/guard.ts` 注释）
  return { ok: v, reason: v ? undefined : "objective 必须外部来源（禁 observer.generateObjective()）" };
};

export const candidateHasNoScore = (c: PlanCandidate) => (c as any)?.score === undefined && (c as any)?.best === undefined && (c as any)?.optimal === undefined;
export const assertCandidateNoScore = (c: PlanCandidate) => {
  const v = candidateHasNoScore(c);
  return { ok: v, reason: v ? undefined : "PlanCandidate 禁 score/optimal（score→optimization→preference→value→identity 入口）" };
};

export const evaluationIsComparison = (e: PlanEvaluation) => !/winner|bestPlan|best plan|optimal.\s*true|ranking/i.test(JSON.stringify(e || {}));
export const assertEvaluationComparison = (e: PlanEvaluation) => {
  const v = evaluationIsComparison(e);
  return { ok: v, reason: v ? undefined : "PlanEvaluation 是 comparison（comparison/list），禁 winner/bestPlan/optimal/ranking" };
};

export const criteriaNotValue = (c: string) => !/better|optimal|best|preferred/i.test(String(c || ""));
export const assertCriteriaNotValue = (c: string) => {
  const v = criteriaNotValue(c);
  return { ok: v, reason: v ? undefined : "Evaluation criteria 禁 better/optimal/best/preferred（除非外部约束导向，如 lower latency under constraint X）" };
};
