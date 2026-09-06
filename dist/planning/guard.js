export const objectiveIsExternal = (o) => !!o && o.source === "external" && !/observer|generateObjective|observer objective/i.test(String(o.description || ""));
export const assertObjectiveExternal = (o) => ({
    ok: objectiveIsExternal(o), reason: objectiveIsExternal(o) ? undefined : "objective 必须外部来源（禁 observer.generateObjective()）",
});
export const candidateHasNoScore = (c) => c?.score === undefined && c?.best === undefined && c?.optimal === undefined;
export const assertCandidateNoScore = (c) => ({ ok: candidateHasNoScore(c), reason: candidateHasNoScore(c) ? undefined : "PlanCandidate 禁 score/optimal（score→optimization→preference→value→identity 入口）" });
export const evaluationIsComparison = (e) => !/winner|bestPlan|best plan|optimal.\s*true|ranking/i.test(JSON.stringify(e || {}));
export const assertEvaluationComparison = (e) => ({ ok: evaluationIsComparison(e), reason: evaluationIsComparison(e) ? undefined : "PlanEvaluation 是 comparison（comparison/list），禁 winner/bestPlan/optimal/ranking" });
export const criteriaNotValue = (c) => !/better|optimal|best|preferred/i.test(String(c || ""));
export const assertCriteriaNotValue = (c) => ({ ok: criteriaNotValue(c), reason: criteriaNotValue(c) ? undefined : "Evaluation criteria 禁 better/optimal/best/preferred（除非外部约束导向，如 lower latency under constraint X）" });
