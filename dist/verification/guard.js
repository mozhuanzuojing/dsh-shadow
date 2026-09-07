// dsh-shadow —— verification/guard.ts：验证器自身守边界（237–240）。
// Verification≠Optimization / Cannot Change Authority / Cannot Change Identity / DriftReport≠RealityClaim。
const FORBIDDEN_FIELDS = /"(adaptationRef|permissionChange|identityChange|optimize|score|quality|health|trust|confidence)"\s*:/;
export const runHasNoEvaluationField = (run) => !FORBIDDEN_FIELDS.test(JSON.stringify(run || {}));
export const assertRunHasNoEvaluationField = (run) => ({ ok: runHasNoEvaluationField(run), reason: runHasNoEvaluationField(run) ? undefined : "Verification 只读只报：禁 confidence/trust/score/quality/health/adaptationRef/permissionChange/identityChange（237/238/239）" });
const MUTATE = /self.?optim|optimiz|adapt.*(permission|authority|identity)|permission (change|expand)|authority (change|increase)|identity (change|evolve)|权限.*改变|身份.*改变|扩权|more authority|become.*autonomous|调整.*自己|自我优化/i;
export const evidenceNoOptimization = (evidence) => !evidence.some((e) => MUTATE.test(e));
export const assertEvidenceNoOptimization = (evidence) => ({ ok: evidenceNoOptimization(evidence), reason: evidenceNoOptimization(evidence) ? undefined : "Verification ≠ Optimization（Verification→Adaptation/Permission/Identity 禁；禁自我优化/调整自己）" });
const REALITY_CLAIM = /drift report.*proves|reality claim|成为现实断言|验证.*证明.*是事实/i;
export const reportNoRealityClaim = (report) => !REALITY_CLAIM.test(JSON.stringify(report || {}));
export const assertReportNoRealityClaim = (report) => ({ ok: reportNoRealityClaim(report), reason: reportNoRealityClaim(report) ? undefined : "Drift Report ≠ Reality Claim（验证报告不得成为 RealityClaim/知识断言；只答有无违反边界）" });
