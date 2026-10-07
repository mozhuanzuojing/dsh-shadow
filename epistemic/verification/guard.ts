// dsh-shadow —— verification/guard.ts：验证器自身守边界（237–240）。
// Verification≠Optimization / Cannot Change Authority / Cannot Change Identity / DriftReport≠RealityClaim。
// A27：三个 `assert*` 一律**先求值一次**再组结果 —— 旧写法在同一个对象字面量里把谓词求值两次，
// 而本文件的谓词是 `JSON.stringify(run)` / `JSON.stringify(report)` 级别的重活（每个 boundary 都跑一遍）。
// 结果形态 = 守卫族统一形态 `{ ok, reason? }`（同 `epistemic/world/guard/claim-admission.ts` 的 `AdmissionResult`）。
const FORBIDDEN_FIELDS = /"(adaptationRef|permissionChange|identityChange|optimize|score|quality|health|trust|confidence)"\s*:/;
export const runHasNoEvaluationField = (run: any) => !FORBIDDEN_FIELDS.test(JSON.stringify(run || {}));
export const assertRunHasNoEvaluationField = (run: any) => {
  const v = runHasNoEvaluationField(run);
  return { ok: v, reason: v ? undefined : "Verification 只读只报：禁 confidence/trust/score/quality/health/adaptationRef/permissionChange/identityChange（237/238/239）" };
};

const MUTATE = /self.?optim|optimiz|adapt.*(permission|authority|identity)|permission (change|expand)|authority (change|increase)|identity (change|evolve)|权限.*改变|身份.*改变|扩权|more authority|become.*autonomous|调整.*自己|自我优化/i;
export const evidenceNoOptimization = (evidence: string[]) => !evidence.some((e) => MUTATE.test(e));
export const assertEvidenceNoOptimization = (evidence: string[]) => {
  const v = evidenceNoOptimization(evidence);
  return { ok: v, reason: v ? undefined : "Verification ≠ Optimization（Verification→Adaptation/Permission/Identity 禁；禁自我优化/调整自己）" };
};

const REALITY_CLAIM = /drift report.*proves|reality claim|成为现实断言|验证.*证明.*是事实/i;
export const reportNoRealityClaim = (report: any) => !REALITY_CLAIM.test(JSON.stringify(report || {}));
export const assertReportNoRealityClaim = (report: any) => {
  const v = reportNoRealityClaim(report);
  return { ok: v, reason: v ? undefined : "Drift Report ≠ Reality Claim（验证报告不得成为 RealityClaim/知识断言；只答有无违反边界）" };
};
