// dsh-shadow —— planning/guard.ts：Planning 边界守卫（objective 外部来源、无 score、comparison 非 winner、criteria≠value）。
import type { PlanCandidate, PlanEvaluation, PlanningObjective } from "./types.js";

export const objectiveIsExternal = (o: PlanningObjective | null | undefined) =>
  !!o && o.source === "external" && !/observer|generateObjective|observer objective/i.test(String(o.description || ""));
export const assertObjectiveExternal = (o: PlanningObjective | null | undefined) => ({
  ok: objectiveIsExternal(o), reason: objectiveIsExternal(o) ? undefined : "objective 必须外部来源（禁 observer.generateObjective()）",
});

export const candidateHasNoScore = (c: PlanCandidate) => (c as any)?.score === undefined && (c as any)?.best === undefined && (c as any)?.optimal === undefined;
export const assertCandidateNoScore = (c: PlanCandidate) => ({ ok: candidateHasNoScore(c), reason: candidateHasNoScore(c) ? undefined : "PlanCandidate 禁 score/optimal（score→optimization→preference→value→identity 入口）" });

export const evaluationIsComparison = (e: PlanEvaluation) => !/winner|bestPlan|best plan|optimal.\s*true|ranking/i.test(JSON.stringify(e || {}));
export const assertEvaluationComparison = (e: PlanEvaluation) => ({ ok: evaluationIsComparison(e), reason: evaluationIsComparison(e) ? undefined : "PlanEvaluation 是 comparison（comparison/list），禁 winner/bestPlan/optimal/ranking" });

export const criteriaNotValue = (c: string) => !/better|optimal|best|preferred/i.test(String(c || ""));
export const assertCriteriaNotValue = (c: string) => ({ ok: criteriaNotValue(c), reason: criteriaNotValue(c) ? undefined : "Evaluation criteria 禁 better/optimal/best/preferred（除非外部约束导向，如 lower latency under constraint X）" });
