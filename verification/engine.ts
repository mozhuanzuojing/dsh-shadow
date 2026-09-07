// dsh-shadow —— verification/engine.ts：Verification Harness 引擎（build run + 六边界检查 + 守卫 237–240）。
import type { VerificationRun, DriftReport, InvariantCheck } from "./types.js";
import { checkBoundary } from "./checks.js";
import { assertRunHasNoEvaluationField, assertEvidenceNoOptimization, assertReportNoRealityClaim } from "./guard.js";
import { writeVerificationRun } from "./persist.js";
import { today } from "../core/util.js";

const BOUNDARIES = ["reality", "epistemic", "agency", "authority", "identity", "temporal"];
const rand = () => Math.random().toString(36).slice(2, 6);

export const runVerification = async (fs: any, root: string, args: any): Promise<{ ok: boolean; reason?: string; run?: VerificationRun; report?: DriftReport }> => {
  const evidenceRefs = (args?.evidenceRefs as string[]) || [];
  if (!evidenceRefs.length) return { ok: false, reason: "Verification 须 evidenceRefs（运行的观察事件，不可空）" };
  const g = assertEvidenceNoOptimization(evidenceRefs); if (!g.ok) return { ok: false, reason: g.reason };
  const checks: InvariantCheck[] = BOUNDARIES.map((b) => checkBoundary(b, evidenceRefs));
  const run: VerificationRun = { runId: String(args?.runId || `vr-${Date.now()}-${rand()}`), runtimeVersion: String(args?.runtimeVersion || "v1.0.2"), invariantRange: "1-240", observerRef: String(args?.observerRef || "observer"), startedAt: String(args?.startedAt || today()), completedAt: today(), checks };
  const rg = assertRunHasNoEvaluationField(run); if (!rg.ok) return { ok: false, reason: rg.reason };
  const report: DriftReport = { observedBoundaries: checks.map((c) => ({ boundary: c.boundary, drift: c.status === "violated", evidence: c.evidenceRefs })) };
  const rr = assertReportNoRealityClaim(report); if (!rr.ok) return { ok: false, reason: rr.reason };
  await writeVerificationRun(fs, root, run);
  return { ok: true, run, report };
};
