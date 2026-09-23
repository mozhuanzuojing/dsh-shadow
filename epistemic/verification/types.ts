// dsh-shadow —— verification/types.ts：Verification Harness 类型（v1.0.2 Observer Runtime Verification Foundation）。
// Verification 只读只报：无 confidence/trust/score/quality/health；InvariantCheck 只答 satisfied|violated；DriftReport 只答有无漂移。
// InvariantCheck：Verification 对某个 Runtime Boundary 的一次检查结果。
// invariantId = 被检查的 Runtime Boundary「自身」的原始 Constitution invariant（1–231 段，如 Reality=102 / Epistemic=209 /
//               Agency=166 / Authority=216 / Identity=208 / Temporal=231）。
// 注意：它不是「本次 Verification 自己检查的 invariant」。Verification 自身的 Constitution 是 237–240
// （Verification≠Optimization / Cannot Change Authority / Cannot Change Identity / DriftReport≠RealityClaim），
// 这一层不在 invariantId 上体现，由 verification/guard.ts 在「验证不越界」层面单独守卫。
export interface InvariantCheck {
  invariantId: number;
  boundary: string;
  status: "satisfied" | "violated";
  evidenceRefs: string[];
}
export interface VerificationRun {
  runId: string;
  runtimeVersion: string;
  invariantRange: string;
  observerRef: string;
  startedAt: string;
  completedAt: string;
  checks: InvariantCheck[];
}
export interface DriftReport {
  observedBoundaries: { boundary: string; drift: boolean; evidence: string[] }[];
}
