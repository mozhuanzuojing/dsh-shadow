// dsh-shadow —— query/sim-action.ts：Counterfactual Simulation + Action Boundary seam（v0.32–v0.33）。
// 从 query/query.ts 迁出：simulate（Simulation=Representation 函数，不改 Identity）、candidate/execute/feedback
// （Action Boundary：Simulation≠Action / Action≠Reality / Result≠Knowledge / Success≠Truth / Failure≠Ignore）。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runSimAction(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { simulate } from "../simulation/engine/simulator.js";
import { assertAssumptionAndNotFact } from "../simulation/guard/assumption-guard.js";
import { assertNoRealityFabrication, outcomeHasLineage } from "../simulation/guard/reality-boundary.js";
import { renderOutcome } from "../simulation/explain/explain.js";
import { renderCandidate, renderExecution, renderFeedback, assertCandidateClean, assertExecutionEvent, feedbackIsNeutral } from "../action/guard.js";
import { writeExecution, writeFeedback } from "../action/persistence.js";
import type { ShadowQueryDeps } from "./types.js";

export interface SimActionCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["simulate", "candidate", "execute", "feedback"]);

/** Returns the rendered body for a simulation/action mode, or undefined if not one of this family. */
export async function runSimAction(deps: ShadowQueryDeps, args: any, ctx: SimActionCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "simulate") {
    const condition = String(args?.condition || "");
    const a = assertAssumptionAndNotFact(condition);
    if (!a.ok) return scrubFinal(RECALL_PREFIX + "[Simulation Rejected] " + a.reason + "（Assumption ≠ Fact：须 'Assume X'，禁 'X will cause'）" + flushWarn);
    const basedOn = (args?.basedOn as string[]) || [String(args?.subject || "")].filter(Boolean);
    const scenario = { id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, basedOnRepresentationIds: basedOn, initialState: [], changedConditions: [condition], assumptions: [condition], uncertainty: 0.5 };
    const outcome = simulate(scenario);
    const b = assertNoRealityFabrication(outcome);
    if (!b.ok) return scrubFinal(RECALL_PREFIX + `[Simulation Rejected] ${b.reason}` + flushWarn);
    if (!outcomeHasLineage(outcome)) return scrubFinal(RECALL_PREFIX + "[Simulation Rejected] 无 derivedFrom（lineage 不完整）" + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderOutcome(outcome) + flushWarn);
  }
  if (mode === "candidate") {
    const conds = (args?.assumptions as string[]) || [String(args?.condition || "Assume change")].filter(Boolean);
    const candidate = { id: `ac-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, basedOnSimulation: (args?.basedOnSimulation as string[]) || [], assumedConditions: conds, proposedChange: String(args?.proposedChange || ""), uncertainty: Number(args?.uncertainty) || 0.5 };
    const g = assertCandidateClean(candidate as any);
    return scrubFinal(RECALL_PREFIX + renderCandidate(candidate) + (g.ok ? "" : `\n（${g.reason}）`) + flushWarn);
  }
  if (mode === "execute") {
    const exec = { id: `ax-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, candidateId: String(args?.candidateId || ""), executedAt: today(), environmentChange: String(args?.environmentChange || ""), result: String(args?.result || "") };
    const g = assertExecutionEvent(exec as any);
    if (!g.ok) return scrubFinal(RECALL_PREFIX + "[Action Rejected] " + g.reason + flushWarn);
    if (!exec.candidateId) return scrubFinal(RECALL_PREFIX + "[Action Rejected] 无 candidateId（需先 mode:candidate + 批准，SimulationOutcome 不直接执行 Action）" + flushWarn);
    await writeExecution(fs, ws, exec);
    return scrubFinal(RECALL_PREFIX + renderExecution(exec) + flushWarn);
  }
  // feedback
  const fb = { executionId: String(args?.executionId || ""), observedChanges: args?.observedChanges || [], successIndicator: String(args?.successIndicator || ""), unexpectedEffects: args?.unexpectedEffects || [], validationRefs: args?.validationRefs || [] };
  if (!feedbackIsNeutral(fb)) return scrubFinal(RECALL_PREFIX + "[Feedback Rejected] Success ≠ Capability/Identity（只记观察结果，断言『我预测正确』禁）" + flushWarn);
  await writeFeedback(fs, ws, fb);
  return scrubFinal(RECALL_PREFIX + renderFeedback(fb) + flushWarn);
}
