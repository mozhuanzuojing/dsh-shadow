// dsh-shadow —— verification/engine.ts：Verification Harness 引擎（build run + 六边界检查 + 守卫 237–240）。
import type { VerificationRun, DriftReport, InvariantCheck } from "./types.js";
import { checkBoundary } from "./checks.js";
import { assertRunHasNoEvaluationField, assertEvidenceNoOptimization, assertReportNoRealityClaim } from "./guard.js";
import { writeVerificationRun } from "./persist.js";
import { today, newId } from "../../core/util.js";

const BOUNDARIES = ["reality", "epistemic", "agency", "authority", "identity", "temporal"];

export const runVerification = async (fs: any, root: string, args: any): Promise<{ ok: boolean; reason?: string; run?: VerificationRun; report?: DriftReport }> => {
  const evidenceRefs = (args?.evidenceRefs as string[]) || [];
  if (!evidenceRefs.length) return { ok: false, reason: "Verification 须 evidenceRefs（运行的观察事件，不可空）" };
  const g = assertEvidenceNoOptimization(evidenceRefs); if (!g.ok) return { ok: false, reason: g.reason };
  const checks: InvariantCheck[] = BOUNDARIES.map((b) => checkBoundary(b, evidenceRefs));
  const run: VerificationRun = { runId: String(args?.runId || newId("vr")), runtimeVersion: String(args?.runtimeVersion || "v1.0.2"), invariantRange: "1-240", observerRef: String(args?.observerRef || "observer"), startedAt: String(args?.startedAt || today()), completedAt: today(), checks };
  const rg = assertRunHasNoEvaluationField(run); if (!rg.ok) return { ok: false, reason: rg.reason };
  const report: DriftReport = { observedBoundaries: checks.map((c) => ({ boundary: c.boundary, drift: c.status === "violated", evidence: c.evidenceRefs })) };
  const rr = assertReportNoRealityClaim(report); if (!rr.ok) return { ok: false, reason: rr.reason };
  // **B2 同类补扫（规格轴复审 (a)-1）**：写失败**不得**冒充成功（ADR-0049 规则 3）——`run`/`report` 只存在于内存，
  // 而 `mode:"verification"` 的输出当场就渲染它们。`query/contverify.ts:138` 的 `!v.ok` 分支会把 `reason`
  // 打进**同一段输出** ⇒ 这里返回 `ok:false`（仍带上 run/report，调用方在 `!ok` 时不会渲染它们）。
  // ⚠ 若将来要「保留报告正文 + 另附未落盘横幅」，需把三态透传成 `persist?` 并改 contverify 那一行（不在本轮写面）。
  const persist = await writeVerificationRun(fs, root, run);
  if (!persist.ok) return { ok: false, reason: `VerificationRun 未落盘：${persist.reason} ⇒ 本次 run/report 只是**内存里的对象**，后续读「${root}/verification/」读不到它。`, run, report };
  return { ok: true, run, report };
};
