// dsh-shadow —— verification/types.ts：Verification Harness 类型（v1.0.2 Observer Runtime Verification Foundation）。
// Verification 只读只报：无 confidence/trust/score/quality/health；InvariantCheck 只答 satisfied|violated；DriftReport 只答有无漂移。
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
