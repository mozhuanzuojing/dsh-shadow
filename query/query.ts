// dsh-shadow —— query/query.ts：read_shadow 执行主体（多模式分派 + 召回管线）。从 index.ts 迁出。
// 依赖经 ShadowQueryDeps 注入（闭包型 verifyEvidence/expandTerms + 服务/配置/状态）；领域模块函数直接 import。
import type { AgentLike } from "../core/types.js";
import { resolveWorkspace } from "../core/scope.js";
import { readRel, listMemories } from "../persistence/files.js";
import { readMeta, writeMeta } from "../persistence/meta.js";
import { readLedger, writeLedger } from "../retrieval/ledger.js";
import { tokenize, today, ageDaysOf, RECALL_PREFIX, parseAsOf } from "../core/util.js";
import { scoreMemory, breakdownOf, tierFor } from "../retrieval/rank.js";
import { renderByTier, noMatchText } from "../retrieval/render.js";
import { evidenceOf, provenanceText, newestByEntryOf, verdictOf, conflictOf, lessonOf, lineageOf } from "../observer/arbitrate.js";
import { evidencePathsOf, isPathLike } from "../evidence/paths.js";
import { lifecycleOf, hotnessOf } from "../core/lifecycle.js";
import { kgTrace } from "../observer/observer.js";
import { readSoul, soulText } from "../soul/soul.js";
import { readIdentity, renderIdentity } from "../soul/identity.js";
import { observerContextOf, renderObserverContext } from "../observer/core.js";
import { readObserverState } from "../observer/state.js";
import { recordObservationTrace } from "../observer/trace.js";
import { tasteOf, renderTaste } from "../soul/taste.js";
import { experienceOf, renderExperience } from "../core/experience.js";
import { judgmentOf, renderJudgment } from "../core/judgment.js";
import { projectContext, renderProjection } from "../observer/projection.js";
import { judgmentOfClaim, renderJudgments, claimOf } from "../observer/judgment.js";
import { reflectOf, renderReflection } from "../reflection/engine.js";
import { readCurrentIdentity } from "../identity/timeline.js";
import { advanceIdentity, renderEvaluator } from "../identity/evaluator.js";
import { buildTemporalGraph } from "../temporal/builder.js";
import { writeTemporalGraph } from "../temporal/persistence.js";
import { queryTemporal, renderTemporalGraph, renderReplay, renderCompare } from "../temporal/query.js";
import { buildSleepWindow, renderSleepWindow } from "../dream/sleep.js";
import { offlineCompression, buildDreamArtifact, renderDreamResult } from "../dream/compress.js";
import { writeDream } from "../dream/persist.js";
import { writeHypothesis, readHypothesis, registerFutureEvidence, readFutureEvidence } from "../validation/evidence.js";
import { validateHypothesis, toArtifact, renderValidation } from "../validation/validate.js";
import { writeValidation } from "../validation/persist.js";
import { appendValidationEvent, readTimeline, renderTimeline } from "../validation/history.js";
import { packetOf, renderPacket, assertPacketBarrier } from "../federation/contract.js";
import { compareProjections, renderDistortion } from "../federation/guard.js";
import { perspectiveOf, renderPerspective, perspectiveIsClean } from "../federation/perspective.js";
import { registerRealityEvidence, referenceEvidence, readRealityEvidence, renderRealityEvidence } from "../federation/reality.js";
import { differenceOf, renderDifference } from "../federation/difference.js";
import { perspectiveStateOf, renderStability } from "../federation/stability.js";
import { observationOf, renderObservation } from "../reality/observation.js";
import { registerObservation, readObservations } from "../reality/registry.js";
import { claimOf as claimOfReality, renderClaim, isObservablePredicate } from "../reality/claim/engine.js";
import { writeClaim, readClaims } from "../reality/claim/persist.js";
import { buildRepresentationGraph } from "../world/builder/representation-builder.js";
import { writeGraph } from "../world/persistence/persist.js";
import { createRepresentationFromClaims, renderAdmission } from "../world/guard/claim-admission.js";
import { relationHypothesisOf, isRelationHypothesis, renderRelation } from "../world/guard/relation-guard.js";
import { explain } from "../world/explain/explain.js";
import { simulate, applyRule } from "../simulation/engine/simulator.js";
import { assertAssumptionAndNotFact } from "../simulation/guard/assumption-guard.js";
import { assertNoRealityFabrication, outcomeHasLineage } from "../simulation/guard/reality-boundary.js";
import { renderOutcome } from "../simulation/explain/explain.js";
import { renderCandidate, renderExecution, renderFeedback, assertCandidateClean, assertExecutionEvent, feedbackIsNeutral } from "../action/guard.js";
import { writeExecution, writeFeedback } from "../action/persistence.js";
import { assertObjectiveExternal, assertCandidateNoScore, assertEvaluationComparison, assertCriteriaNotValue } from "../planning/guard.js";
import { renderContext, renderEvaluation } from "../planning/render.js";
import { renderContext as renderAgencyContext, renderSelection, renderEvent } from "../agency/render.js";
import { buildAgencyContext, pickAgencySelection, buildAgencyEvent } from "../agency/engine.js";
import { writeAgencyContext } from "../agency/persistence.js";
import { renderContext as renderDelegationContext, renderCheck, renderEvent as renderDelegationEvent } from "../delegation/render/render.js";
import { buildDelegationContext, checkDelegation, recordDelegationEvent } from "../delegation/engine/delegated-execution.js";
import { writeDelegationContext } from "../delegation/persistence/persist.js";
import { renderRecord, renderEvent as renderRecallEvent, renderValidation as renderRecallValidation } from "../recall/render/render.js";
import { buildForgottenRecord, buildRecallEvent, validateRecall } from "../recall/engine/recall-continuity.js";
import { writeForgottenRecord } from "../recall/persistence/persist.js";
import { renderContext as renderAdaptContext, renderChange, renderValidation as renderAdaptValidation } from "../adaptation/render/render.js";
import { buildAdaptationContext, buildAdaptationChange, validateAdaptation } from "../adaptation/engine/adaptation.js";
import { writeAdaptationContext } from "../adaptation/persistence/persist.js";
import { renderContext as renderHorizonContext, renderSummary, renderEvent as renderHorizonEvent, renderLink } from "../long-horizon/render/render.js";
import { buildInteractionContext, buildHistorySummary, buildContinuityEvent, buildInteractionAdaptationLink } from "../long-horizon/engine/interaction.js";
import { writeInteractionContext, writeHistorySummary } from "../long-horizon/persistence/persist.js";
import { renderNodePerception, renderNodeIdentityContext } from "../temporal/render.js";
import { scrubFinal, scrubUnsafe } from "../security/scrub.js";
import type { ShadowQueryDeps } from "./types.js";


export async function runReadShadow(deps: ShadowQueryDeps, args: any, exec: any): Promise<string> {
  const agent: AgentLike | undefined = exec?.agent;
  const ws = resolveWorkspace(agent, deps.cwdBySession, deps.config);
  if (!ws) return "（无法确定工作区，shadow 不可用）";
  const fs = deps.fs;
  if (!fs) return "（fs 服务不可用）";
  const flushWarn = deps.getFlushWarn();
  // v0.24 Reflection：旁支（不是 Memory 查询），用 mode:"reflection" 而非 reflect:true 布尔。
  if (String(args?.mode) === "reflection") {
    const r = await reflectOf(fs, ws, { observerId: agent?.id || "unknown", period: { from: String(args?.from || ""), to: String(args?.to || today()) } });
    return scrubFinal(RECALL_PREFIX + renderReflection(r) + flushWarn);
  }
  // v0.25 Identity Continuity：读反思→Candidate→三道闸门→接受者推进 timeline（不自动改 soul.json）。
  if (String(args?.mode) === "identity") {
    const current = await readCurrentIdentity(fs, ws, agent?.id);
    const { model, decisions } = await advanceIdentity(fs, ws, current, {
      minCount: Math.max(1, Number(args?.minCount) || 5),
      minRecency: Number(args?.minRecency) || 0.4,
      maxContradiction: Number(args?.maxContradiction) || 0.3,
      halfLifeDays: Math.max(1, Number(args?.halfLifeDays) || 90),
    });
    return scrubFinal(RECALL_PREFIX + renderEvaluator(decisions, model) + flushWarn);
  }
  // v0.26 Observer Temporal Kernel：建 Temporal Graph（时间坐标系，独立于 Dream）；at→replay / from+to→compare。
  if (String(args?.mode) === "temporal") {
    const graph = await buildTemporalGraph(fs, ws, { from: String(args?.from || ""), to: String(args?.to || "") });
    await writeTemporalGraph(fs, ws, graph);
    if (args?.perceptionOnly || args?.identityContext) {
      const node = graph.nodes.find((n) => !args?.at || String(n.timestamp).slice(0, 10) === String(args.at).slice(0, 10)) || graph.nodes[0];
      if (!node) return scrubFinal(RECALL_PREFIX + "（无 Temporal 节点）" + flushWarn);
      return scrubFinal(RECALL_PREFIX + (args?.identityContext ? renderNodeIdentityContext(node) : renderNodePerception(node)) + flushWarn);
    }
    if (args?.at) return scrubFinal(RECALL_PREFIX + renderReplay(queryTemporal(graph, { type: "replay", at: String(args.at) })) + flushWarn);
    if (args?.from && args?.to) return scrubFinal(RECALL_PREFIX + renderCompare(queryTemporal(graph, { type: "compare", from: String(args.from), to: String(args.to) })) + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderTemporalGraph(graph) + flushWarn);
  }
  // v0.27 Observer Sleep Kernel：SleepWindow → Offline Compression → DreamArtifact + Hypothesis(pending)。
  if (String(args?.mode) === "offline") {
    const sw = buildSleepWindow({ observerId: agent?.id || "unknown", from: String(args?.from || ""), to: String(args?.to || today()), trigger: (args?.trigger as any) || "scheduled" });
    const result = await offlineCompression(fs, ws, { observerId: sw.observerId, from: sw.includedTimelineRange.from, to: sw.includedTimelineRange.to });
    const artifact = await buildDreamArtifact(fs, ws, { id: sw.id, observerId: sw.observerId, from: sw.includedTimelineRange.from, to: sw.includedTimelineRange.to }, result);
    await writeDream(fs, ws, { artifact, result });
    for (const h of result.hypotheses) await writeHypothesis(fs, ws, h);
    return scrubFinal(RECALL_PREFIX + renderSleepWindow(sw) + "\n" + renderDreamResult(result) + flushWarn);
  }
  // v0.28 Hypothesis Validation：注册 FutureEvidence（未来事实，单向）；validate 与替代解释竞争 → Artifact（不覆盖 Hypothesis）。
  if (String(args?.mode) === "evidence") {
    const ev = await registerFutureEvidence(fs, ws, { hypothesisId: String(args?.hypothesisId || ""), observedAt: String(args?.observedAt || today()), actualOutcome: String(args?.actualOutcome || ""), observationType: String(args?.observationType || "observation") });
    return scrubFinal(RECALL_PREFIX + `[Evidence] registered ${ev.id} · hypothesis ${ev.hypothesisId} · outcome ${ev.actualOutcome}` + flushWarn);
  }
  if (String(args?.mode) === "validate") {
    const hid = String(args?.hypothesisId || "");
    const h = await readHypothesis(fs, ws, hid);
    if (!h) return scrubFinal(RECALL_PREFIX + `（无 hypothesis ${hid}：请先 mode:offline 生成假设）` + flushWarn);
    const evidences = await readFutureEvidence(fs, ws, hid);
    const result = validateHypothesis(h, evidences);
    await writeValidation(fs, ws, toArtifact(h, result, evidences.map((e) => e.id), today()));
    await appendValidationEvent(fs, ws, hid, { evidenceIds: evidences.map((e) => e.id), result: result.outcome, alternativeWinner: result.alternativeEvaluation.find((a) => a.supported)?.alternative || null, perceptionDelta: `支持${result.applied.support}/反例${result.applied.contradiction}` });
    return scrubFinal(RECALL_PREFIX + renderValidation(result) + flushWarn);
  }
  if (String(args?.mode) === "timeline") {
    const tl = await readTimeline(fs, ws, String(args?.hypothesisId || ""));
    return scrubFinal(RECALL_PREFIX + renderTimeline(tl) + flushWarn);
  }
  // v0.28.1 Epistemic Kernel：Federation 只交换 ObservationClaim（投影契约，非权限）。
  if (String(args?.mode) === "federation") {
    const p = packetOf({ sourceObserverId: String(args?.sourceObserverId || agent?.id || "unknown"), observationClaim: String(args?.obsClaim || ""), lens: args?.lens as string, visible: args?.visible || [], hidden: args?.hidden || [], distortion: args?.distortion || [] });
    const barrier = assertPacketBarrier(p);
    return scrubFinal(RECALL_PREFIX + renderPacket(p) + (barrier.ok ? "\n（boundary OK：Identity/Memory/Dream 不交换）" : `\n（boundary FAIL: ${barrier.reasons.join("、")}）`) + flushWarn);
  }
  if (String(args?.mode) === "distortion") {
    const d = compareProjections({ observerId: String(args?.sourceObserverId || "A"), visible: args?.visibleA || [], hidden: args?.hiddenA || [] }, { observerId: String(args?.targetObserverId || "B"), visible: args?.visibleB || [], hidden: args?.hiddenB || [] });
    return scrubFinal(RECALL_PREFIX + renderDistortion(d) + flushWarn);
  }
  // v0.29 Observer Federation Kernel：Perspective Exchange + Reality Evidence Registry + Difference + Stability。
  if (String(args?.mode) === "federation-perspective") {
    const p = perspectiveOf({ observerId: String(args?.sourceObserverId || agent?.id || "unknown"), temporalReference: String(args?.temporalReference || ""), observationClaim: String(args?.obsClaim || ""), lens: args?.lens as string, visible: args?.visible || [], hidden: args?.hidden || [], observationConfidence: Number(args?.obsConfidence) || 0.5, validationConfidence: Number(args?.valConfidence) || 0.5 });
    const clean = perspectiveIsClean(p);
    return scrubFinal(RECALL_PREFIX + renderPerspective(p) + (clean.ok ? "\n（perspective OK：不携带 Memory/Identity/Dream/Knowledge，confidence 已拆分）" : `\n（perspective FAIL: ${clean.reasons.join("、")}）`) + flushWarn);
  }
  if (String(args?.mode) === "reality") {
    const ev = await registerRealityEvidence(fs, ws, { observedAt: String(args?.observedAt || today()), source: String(args?.sourceObserverId || "unknown"), observation: String(args?.observation || ""), linkedHypothesis: args?.linkedHypothesis || [] });
    return scrubFinal(RECALL_PREFIX + renderRealityEvidence(ev) + flushWarn);
  }
  if (String(args?.mode) === "real-refer") {
    const ev = await referenceEvidence(fs, ws, String(args?.realityId || ""), String(args?.sourceObserverId || "unknown"));
    return scrubFinal(RECALL_PREFIX + (ev ? renderRealityEvidence(ev) : `（无 reality evidence ${args?.realityId}）`) + flushWarn);
  }
  if (String(args?.mode) === "federation-diff") {
    const pa = perspectiveOf({ observerId: String(args?.sourceObserverId || "A"), observationClaim: String(args?.obsClaim || "claim-A"), lens: args?.lensA as string, visible: args?.visibleA || [], hidden: args?.hiddenA || [] });
    const pb = perspectiveOf({ observerId: String(args?.targetObserverId || "B"), observationClaim: String(args?.obsClaimB || "claim-B"), lens: args?.lensB as string, visible: args?.visibleB || [], hidden: args?.hiddenB || [] });
    const d = differenceOf(pa, pb, String(args?.realityEvidenceRef || ""));
    return scrubFinal(RECALL_PREFIX + renderDifference(d) + flushWarn);
  }
  if (String(args?.mode) === "stability") {
    const evs = await readRealityEvidence(fs, ws);
    const ev = evs.find((e) => e.id === String(args?.realityId || "")) || null;
    const state = perspectiveStateOf(ev, Boolean(args?.hasValidation));
    return scrubFinal(RECALL_PREFIX + renderStability(state) + flushWarn);
  }
  // v0.30 Reality Model Kernel：RealityObservation（弱事实）→ RealityClaim（必须保留 lineage）→ mode:"model" 查询。
  if (String(args?.mode) === "model-observation") {
    const ro = observationOf({ observedAt: String(args?.observedAt || today()), subjectRef: String(args?.subject || ""), sourcePerspectives: args?.sourcePerspectives || [String(args?.sourceObserverId || "unknown")], observation: String(args?.observation || ""), temporalContext: String(args?.temporalContext || today()), validationRefs: args?.validationRefs || [] });
    await registerObservation(fs, ws, ro);
    return scrubFinal(RECALL_PREFIX + renderObservation(ro) + flushWarn);
  }
  if (String(args?.mode) === "model-claim") {
    const obs = await readObservations(fs, ws, String(args?.subject || ""));
    const validations = (args?.validations as any) || [];
    const c = claimOfReality({ observations: obs, validations });
    if (!c) return scrubFinal(RECALL_PREFIX + "（无 RealityObservation：仅 Temporal/Federation 不足以生成 RealityClaim）" + flushWarn);
    if (!isObservablePredicate(c.predicate)) return scrubFinal(RECALL_PREFIX + "[Rejected] predicate_not_observable（RealityClaim ≠ EvaluationClaim：predicate 必须属 observable set）" + flushWarn);
    await writeClaim(fs, ws, c);
    return scrubFinal(RECALL_PREFIX + renderClaim(c) + flushWarn);
  }
  if (String(args?.mode) === "model") {
    const claims = await readClaims(fs, ws);
    const subject = String(args?.subject || "");
    const claim = claims.find((c) => !subject || c.subjectRef === subject || c.subject === subject || c.id === String(args?.claimId || "")) || null;
    if (!claim) return scrubFinal(RECALL_PREFIX + "（无匹配 RealityClaim）" + flushWarn);
    const obss = await readObservations(fs, ws, claim.subjectRef || claim.subject);
    return scrubFinal(RECALL_PREFIX + renderClaim(claim) + `\n[Lineage] 为什么系统认为它存在：\n` + obss.map((o) => `  - ${o.observation} (perspectives: ${o.sourcePerspectives.join("、") || "—"})`).join("\n") + flushWarn);
  }
  // v0.31 World Representation Kernel：RepresentationObject（只接受 supported）+ RelationHypothesis（恒 hypothesis）+ Graph（可重建）。
  if (String(args?.mode) === "world-represent") {
    const claims = await readClaims(fs, ws);
    const subject = String(args?.subject || "");
    const target = claims.filter((c) => !subject || c.subjectRef === subject || c.subject === subject);
    const r = createRepresentationFromClaims(target);
    return scrubFinal(RECALL_PREFIX + renderAdmission(r) + flushWarn);
  }
  if (String(args?.mode) === "world-relation") {
    const rh = relationHypothesisOf({ from: String(args?.from || ""), to: String(args?.to || ""), relation: String(args?.relation || ""), evidence: args?.evidence || [] });
    return scrubFinal(RECALL_PREFIX + renderRelation(rh) + (isRelationHypothesis(rh) ? "" : "\n（relation guard FAIL）") + flushWarn);
  }
  if (String(args?.mode) === "world") {
    const claims = await readClaims(fs, ws);
    const validations = claims.flatMap((c) => c.validationHistory.map((id) => ({ id })));
    const graph = buildRepresentationGraph(claims, validations);
    await writeGraph(fs, ws, graph);
    const subject = String(args?.subject || "");
    const supportedSubject = claims.find((c) => c.status === "supported" && (!subject || c.subjectRef === subject || c.subject === subject));
    const obss = await readObservations(fs, ws, supportedSubject ? (supportedSubject.subjectRef || supportedSubject.subject) : subject);
    return scrubFinal(RECALL_PREFIX + explain(graph, subject, obss, claims) + flushWarn);
  }
  // v0.32 Counterfactual Simulation：Simulation 是 Representation 的函数（+显式假设+规则），不产 RealityClaim/不改 Identity。
  if (String(args?.mode) === "simulate") {
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
  // v0.33 Action Boundary：Simulation≠Action / Action≠Reality / Result≠Knowledge / Success≠Truth / Failure≠Ignore。
  if (String(args?.mode) === "candidate") {
    const conds = (args?.assumptions as string[]) || [String(args?.condition || "Assume change")].filter(Boolean);
    const candidate = { id: `ac-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, basedOnSimulation: (args?.basedOnSimulation as string[]) || [], assumedConditions: conds, proposedChange: String(args?.proposedChange || ""), uncertainty: Number(args?.uncertainty) || 0.5 };
    const g = assertCandidateClean(candidate as any);
    return scrubFinal(RECALL_PREFIX + renderCandidate(candidate) + (g.ok ? "" : `\n（${g.reason}）`) + flushWarn);
  }
  if (String(args?.mode) === "execute") {
    const exec = { id: `ax-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, candidateId: String(args?.candidateId || ""), executedAt: today(), environmentChange: String(args?.environmentChange || ""), result: String(args?.result || "") };
    const g = assertExecutionEvent(exec as any);
    if (!g.ok) return scrubFinal(RECALL_PREFIX + "[Action Rejected] " + g.reason + flushWarn);
    if (!exec.candidateId) return scrubFinal(RECALL_PREFIX + "[Action Rejected] 无 candidateId（需先 mode:candidate + 批准，SimulationOutcome 不直接执行 Action）" + flushWarn);
    await writeExecution(fs, ws, exec);
    return scrubFinal(RECALL_PREFIX + renderExecution(exec) + flushWarn);
  }
  if (String(args?.mode) === "feedback") {
    const fb = { executionId: String(args?.executionId || ""), observedChanges: args?.observedChanges || [], successIndicator: String(args?.successIndicator || ""), unexpectedEffects: args?.unexpectedEffects || [], validationRefs: args?.validationRefs || [] };
    if (!feedbackIsNeutral(fb)) return scrubFinal(RECALL_PREFIX + "[Feedback Rejected] Success ≠ Capability/Identity（只记观察结果，断言『我预测正确』禁）" + flushWarn);
    await writeFeedback(fs, ws, fb);
    return scrubFinal(RECALL_PREFIX + renderFeedback(fb) + flushWarn);
  }
  // v0.34 Adaptive Planning：constrained comparison，不是 autonomous desire formation；objective 外部来源；无 score/winner。
  if (String(args?.mode) === "plan") {
    const objective = { source: "external" as const, description: String(args?.objective || ""), constraints: args?.constraints || [] };
    const g = assertObjectiveExternal(objective);
    if (!g.ok) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + g.reason + flushWarn);
    if (String(args?.objectiveSource) === "observer") return scrubFinal(RECALL_PREFIX + "[Planning Rejected] objective 禁自生成（observer.generateObjective()）" + flushWarn);
    const criteria = String(args?.criteria || "");
    const gc = assertCriteriaNotValue(criteria);
    if (!gc.ok) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + gc.reason + flushWarn);
    const candidates = (args?.candidates as any[]) || [];
    const planCandidates = candidates.map((c: any, i: number) => ({ id: `pc-${Date.now()}-${i}`, basedOnSimulation: c.basedOnSimulation || [], actionSequence: c.actionSequence || [], assumptions: c.assumptions || [], constraints: c.constraints || [], uncertainty: Number(c.uncertainty) || 0.5 }));
    let badScore: string | null = null;
    for (const c of planCandidates) { const g2 = assertCandidateNoScore(c as any); if (!g2.ok) { badScore = g2.reason; break; } }
    if (badScore) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + badScore + flushWarn);
    const ctx = { id: `ctx-${Date.now()}`, realitySnapshot: [], representationSnapshot: [], simulationReferences: args?.simulationRefs || [], objective };
    const ev: any = { candidates: planCandidates, tradeoffs: String(criteria) ? [{ condition: criteria, consequence: "possible", uncertainty: 0.5 }] : [], unresolvedQuestions: ["只比较路径，非系统价值判断（需外部约束权衡）"] };
    const g3 = assertEvaluationComparison(ev); if (!g3.ok) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + g3.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderContext(ctx) + "\n" + renderEvaluation(ev) + flushWarn);
  }
  // v0.35 Agency Boundary Kernel：AgencyContext（immutable snapshot）/ AgencySelection（reason=constraint_satisfied）/ AgencyBoundaryEvent（audit + lineage）。
  // Agency ≠ Autonomy：行动能力不得自造目的、不因成功而扩张、不升级为自主。此层刻意不实现 Autonomous Agent。
  if (String(args?.mode) === "agency-context") {
    const c = buildAgencyContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[AgencyContext Rejected] " + c.reason + flushWarn);
    await writeAgencyContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderAgencyContext(c.ctx) + flushWarn);
  }
  if (String(args?.mode) === "agency-select") {
    const s = pickAgencySelection(args);
    if (!s.ok || !s.sel) return scrubFinal(RECALL_PREFIX + "[AgencySelection Rejected] " + (s.reject || "") + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderSelection(s.sel) + flushWarn);
  }
  if (String(args?.mode) === "agency-event") {
    const e = await buildAgencyEvent(fs, ws, args);
    if (!e.ok || !e.ev) return scrubFinal(RECALL_PREFIX + "[AgencyEvent Rejected] " + e.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderEvent(e.ev) + flushWarn);
  }
  // v0.36 Delegated Execution Boundary Kernel：DelegationContext / DelegationCheck / AutonomyBoundaryEvent。
  // 委派执行 + 有限适应；不新增 trust/reputation/capabilityLevel；AutonomyBoundaryEvent 是纯审计事件。
  if (String(args?.mode) === "delegation-context") {
    const c = buildDelegationContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[DelegationContext Rejected] " + c.reason + flushWarn);
    await writeDelegationContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderDelegationContext(c.ctx) + flushWarn);
  }
  if (String(args?.mode) === "delegation-check") {
    const r = await checkDelegation(fs, ws, args);
    if (r.notFound) return scrubFinal(RECALL_PREFIX + "[DelegationCheck Rejected] " + r.reason + flushWarn);
    if (!r.ok) return scrubFinal(RECALL_PREFIX + "[DelegationCheck Rejected] " + r.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderCheck(r.result) + flushWarn);
  }
  if (String(args?.mode) === "delegation-event") {
    const e = await recordDelegationEvent(fs, ws, args);
    if (!e.ok || !e.ev) return scrubFinal(RECALL_PREFIX + "[DelegationEvent Rejected] " + e.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderDelegationEvent(e.ev) + flushWarn);
  }
  // v0.37 Recall Continuity Kernel：ForgottenRecord / RecallEvent / RecallValidation。
  // Recall = Access Transition（恢复访问路径），不是 Reality Reconstruction；不为 Memory Kernel。
  if (String(args?.mode) === "recall-forget") {
    const r = buildForgottenRecord(args);
    if (!r.ok || !r.record) return scrubFinal(RECALL_PREFIX + "[Recall Rejected] " + r.reason + flushWarn);
    await writeForgottenRecord(fs, ws, r.record);
    return scrubFinal(RECALL_PREFIX + renderRecord(r.record) + flushWarn);
  }
  if (String(args?.mode) === "recall-event") {
    const e = await buildRecallEvent(fs, ws, args);
    if (!e.ok || !e.ev) return scrubFinal(RECALL_PREFIX + "[RecallEvent Rejected] " + e.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderRecallEvent(e.ev) + flushWarn);
  }
  if (String(args?.mode) === "recall-validation") {
    const v = await validateRecall(fs, ws, args);
    if (!v.ok || !v.result) return scrubFinal(RECALL_PREFIX + "[RecallValidation Rejected] " + v.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderRecallValidation(v.result) + flushWarn);
  }
  // v0.38 Controlled Adaptation Kernel：AdaptationContext / AdaptationChange / AdaptationValidation。
  // Adaptation = 行为策略调整（How I do），不是身份/目标/价值观演化（Who I am）；不提升 epistemic status / authority。
  if (String(args?.mode) === "adapt-context") {
    const c = buildAdaptationContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[Adaptation Rejected] " + c.reason + flushWarn);
    await writeAdaptationContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderAdaptContext(c.ctx) + flushWarn);
  }
  if (String(args?.mode) === "adapt-change") {
    const ch = await buildAdaptationChange(fs, ws, args);
    if (!ch.ok || !ch.change) return scrubFinal(RECALL_PREFIX + "[AdaptationChange Rejected] " + ch.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderChange(ch.change) + flushWarn);
  }
  if (String(args?.mode) === "adapt-validation") {
    const v = await validateAdaptation(fs, ws, args);
    if (!v.ok || !v.validation) return scrubFinal(RECALL_PREFIX + "[AdaptationValidation Rejected] " + v.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderAdaptValidation(v.validation) + flushWarn);
  }
  // v0.39 Long Horizon Interaction Kernel：InteractionContext / HistorySummary / HistoryContinuityEvent / InteractionAdaptationLink。
  // 时间可增加经验，但不能增加主体性：Longer≠MoreAuthority / History≠Purpose / Experience≠Identity / Adaptation≠Evolution / Continuity≠Autonomy。
  if (String(args?.mode) === "horizon-context") {
    const c = buildInteractionContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[Interaction Rejected] " + c.reason + flushWarn);
    await writeInteractionContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderHorizonContext(c.ctx) + flushWarn);
  }
  if (String(args?.mode) === "horizon-summary") {
    const s = buildHistorySummary(args);
    if (!s.ok || !s.summary) return scrubFinal(RECALL_PREFIX + "[HistorySummary Rejected] " + s.reason + flushWarn);
    await writeHistorySummary(fs, ws, s.summary);
    return scrubFinal(RECALL_PREFIX + renderSummary(s.summary) + flushWarn);
  }
  if (String(args?.mode) === "horizon-event") {
    const e = await buildContinuityEvent(fs, ws, args);
    if (!e.ok || !e.event) return scrubFinal(RECALL_PREFIX + "[ContinuityEvent Rejected] " + e.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderHorizonEvent(e.event) + flushWarn);
  }
  if (String(args?.mode) === "horizon-link") {
    const l = await buildInteractionAdaptationLink(fs, ws, args);
    if (!l.ok || !l.link) return scrubFinal(RECALL_PREFIX + "[InteractionLink Rejected] " + l.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderLink(l.link) + flushWarn);
  }
  const recallCfg = deps.config.recall ?? {};
  const retentionCfg = deps.config.retention ?? {};
  if (args?.soul) {
    const soul = await readSoul(fs, ws);
    if (!soul) return scrubFinal(RECALL_PREFIX + "（无 Soul 配置：可在 shadow/soul/soul.json 定义 身份/价值观/原则/品味/边界）" + flushWarn);
    return scrubFinal(RECALL_PREFIX + soulText(soul) + flushWarn);
  }
  if (args?.taste) {
    const soul = await readSoul(fs, ws);
    const t = await tasteOf(fs, ws, soul);
    return scrubFinal(RECALL_PREFIX + renderTaste(t) + flushWarn);
  }
  // v0.20 Observer Kernel：Identity 主体锚 + ObserverContext（谁在看/为什么看/从哪层看）。
  if (args?.identity) {
    const identity = await readIdentity(fs, ws, agent?.id);
    return scrubFinal(RECALL_PREFIX + renderIdentity(identity) + flushWarn);
  }
  if (args?.context) {
    const identity = await readIdentity(fs, ws, agent?.id);
    const soul = await readSoul(fs, ws);
    const state = await readObserverState(fs, ws, soul, args.state);
    const ctx = observerContextOf(args, String(args?.topic || "").trim(), identity, agent?.id, state);
    return scrubFinal(RECALL_PREFIX + renderObserverContext(ctx) + flushWarn);
  }
  const topic = String(args?.topic || "").trim();
  if (!topic) {
    const idx = await readRel(fs, ws, "shadow/_index.md");
    return scrubFinal(RECALL_PREFIX + (idx || "（暂无 shadow 索引）") + flushWarn);
  }
  const limit = Math.max(1, Math.min(30, Number(args?.limit) || 10));
  const maxTokens = Math.max(256, Math.min(8000, Number(args?.max_tokens) || 1600));
  const maxChars = maxTokens * 4;
  let memories = await listMemories(fs, ws);
  const debugMode = recallCfg.debug === true || Boolean(args?.debug);
  const diag: string[] = [];
  const asOf = parseAsOf(args?.asOf);
  const observerMode = Boolean(args?.observer);
  if (asOf) memories = memories.filter((m: any) => m.date <= asOf.date);
  if (debugMode) diag.push(`候选 ${memories.length}${asOf ? ` · asOf<=${asOf.date}` : ""}`);
  // v0.23 Observation Trace：旁路记录观察轨迹（不影响 recall/排序/答案）；ObserverState 只读取不自动推断。
  const obsSoul = await readSoul(fs, ws);
  const obsIdentity = await readIdentity(fs, ws, agent?.id);
  const obsState = await readObserverState(fs, ws, obsSoul, args.state);
  const obsCtx = observerContextOf(args, topic, obsIdentity, agent?.id, obsState);
  let tokens = tokenize(topic);
  if (!tokens.length) tokens = [String(topic).toLowerCase()];
  if (recallCfg.enabled === true && recallCfg.provider && recallCfg.model) {
    const extra = await deps.expandTerms(topic);
    if (extra.length) tokens = Array.from(new Set([...tokens, ...extra]));
  }
  if (args?.project) {
    const soul = await readSoul(fs, ws);
    const identity = await readIdentity(fs, ws, agent?.id);
    const state = await readObserverState(fs, ws, soul, args.state);
    const ctx = observerContextOf(args, topic, identity, agent?.id, state);
    const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
    const task = `${ctx.intent.goal} ${ctx.intent.question}`.trim() || topic;
    const p = await projectContext(fs, ws, memories, task, soul, deps.verifyEvidence, identity.observerLens || args.lens, identity, ctx.intent);
    await recordObservationTrace(fs, ws, {
      observerId: ctx.observerId,
      createdAt: today(),
      realityAnchor: ctx.realityAnchor,
      intent: ctx.intent,
      projection: { visible: p.visible || [], hidden: p.hidden || [], distortion: p.distortion?.reason ? [p.distortion.reason] : [] },
      uncertainty: { level: p.unc.length, reasons: p.unc.slice(0, 3) },
      metadata: { source: "projection" },
      state: ctx.state,
    });
    return scrubFinal(RECALL_PREFIX + renderProjection(p, topic, project, ctx) + flushWarn);
  }
  if (args?.judgment) {
    const js = await judgmentOf(fs, ws, memories, topic);
    return scrubFinal(RECALL_PREFIX + renderJudgment(js) + flushWarn);
  }
  if (args?.claim) {
    const identity = await readIdentity(fs, ws, agent?.id);
    const ctx = observerContextOf(args, topic, identity, agent?.id);
    const tokens = tokenize(topic);
    const js: any[] = [];
    for (const mm of memories) {
      let matched = !topic;
      if (!matched) {
        const text = await readRel(fs, ws, mm.rel);
        matched = !!text && tokens.some((t) => `${claimOf(text)} ${mm.rel}`.toLowerCase().includes(t));
      }
      if (!matched) continue;
      const j = await judgmentOfClaim(fs, ws, mm, { observerId: ctx.observerId, lens: ctx.lens, identity }, deps.verifyEvidence);
      if (j) js.push(j);
    }
    return scrubFinal(RECALL_PREFIX + renderJudgments(js) + flushWarn);
  }
  if (args?.verify) {
    const texts: any[] = [];
    for (const mm of memories) {
      const text = await readRel(fs, ws, mm.rel);
      if (!text) continue;
      const exp = experienceOf(text, mm);
      const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t))) texts.push(text);
    }
    const rows: string[] = [];
    const ctx = { fs, ws };
    for (const text of texts.slice(0, 3)) {
      for (const p of evidencePathsOf(text).filter(isPathLike).slice(0, 6)) {
        const r = await deps.verifyEvidence({ path: p, kind: "path" }, ctx);
        rows.push(`${r.status}  ${p}  (provider=${r.source} · freshness=${r.freshness} · conf=${r.confidence.toFixed(2)})`);
      }
    }
    return scrubFinal(RECALL_PREFIX + "[Evidence Verify]" + (rows.length ? "\n" + rows.join("\n") : "\n（无可验证证据路径）") + flushWarn);
  }
  if (args?.experience) {
    const matched: any[] = [];            const entryList: any[] = [];
    for (const mm of memories) {
      const text = await readRel(fs, ws, mm.rel);
      if (!text) continue;
      const exp = experienceOf(text, mm);
      entryList.push({ entry: exp.situation, date: mm.date, time: mm.time });
      const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
      if (tokens.some((t) => hay.includes(t))) matched.push({ exp, mm, text });
    }
    if (!matched.length) return noMatchText(topic, flushWarn);
    const newest = newestByEntryOf(entryList);
    const exps: any[] = [];
    for (const { exp, mm, text } of matched) {
      const conflict = await conflictOf(fs, ws, text, deps.verifyEvidence);
      const v = verdictOf(conflict.missing.length, exp.situation, mm.date, mm.time, newest);
      exp.verdict = v.verdict; exp.outcome = v.outcome; exp.reflection = v.reflection; exp.lesson = lessonOf(v);
      exps.push(exp);
    }
    return scrubFinal(RECALL_PREFIX + exps.map(renderExperience).join("\n\n") + flushWarn);
  }
  const scored: any[] = [];
  const entryList: any[] = [];
  const entryLineage = new Map<string, { date: string; time: string; decision: string }[]>();
  const meta = await readMeta(fs, ws);
  const halfLife = Math.max(0.01, Number(retentionCfg.halfLifeDays) || 7);
  for (const mm of memories) {
    const text = await readRel(fs, ws, mm.rel);
    if (!text) continue;
    const entry = (text.match(/^# (.+)$/m) || [])[1] || "";
    entryList.push({ entry, date: mm.date, time: mm.time });
    const decisionTxt = (text.match(/^> 用户提示\/决策：(.+)$/m) || [])[1] || "";
    if (!entryLineage.has(entry)) entryLineage.set(entry, []);
    entryLineage.get(entry)!.push({ date: mm.date, time: mm.time, decision: decisionTxt });
    const tier = tierFor(text);
    let score = scoreMemory(text, mm.rel, entry, tokens);
    const originM = text.match(/^> 来源会话：(.+)$/m);
    const origin = originM ? scrubUnsafe(originM[1]).trim() : "";
    const staleDays = Math.max(1, Number(retentionCfg.staleDays) || 7);
    let stale = ageDaysOf(mm.rel) >= staleDays;
    if (retentionCfg.enabled) {
      const rec = meta[mm.rel];
      if (rec && rec.status && rec.status !== "active" && !rec.pinned) continue;
      const h = hotnessOf(rec ? rec.hits : 0, ageDaysOf(mm.rel), halfLife);
      score = score * (0.5 + h * 2);
      if (rec && rec.status === "stale") stale = true;
      if (h < 0.15) stale = true;
    }
    if (score > 0) {
      const conflict = await conflictOf(fs, ws, text, deps.verifyEvidence);
      if (conflict.missing.length) { score = score * 0.5; stale = true; }
      const ev: any = evidenceOf(text, mm, meta, stale);
      ev.conflict = conflict.missing.length;
      ev.lifecycle = lifecycleOf(meta[mm.rel], ageDaysOf(mm.rel), conflict.missing.length, stale);
      scored.push({ mm, text, entry, tier, score, tokens, origin, stale, currentOrigin: agent?.id, provenance: provenanceText(ev), evidence: ev, breakdown: breakdownOf(text, mm.rel, entry, tokens), conflict: conflict.missing, observer: observerMode, asOf });
    }
  }
  const newest = newestByEntryOf(entryList);
  for (const s of scored) {
    const v = verdictOf(s.evidence.conflict || 0, s.entry, s.mm.date, s.mm.time, newest);
    s.superseded = v.superseded; s.verdict = v.verdict; s.outcome = v.outcome; s.reflection = v.reflection;
    if (v.superseded) s.score = s.score * 0.7;
    s.evidence.verdict = v.verdict; s.evidence.outcome = v.outcome; s.evidence.reflection = v.reflection;
    s.evidence.lineage = lineageOf(entryLineage.get(s.entry) || []);
    s.provenance = provenanceText(s.evidence);
  }
  scored.sort((a, b) => b.score - a.score || b.mm.date.localeCompare(a.mm.date));
  if (debugMode) diag.push(`命中（打分>0）${scored.length}`);
  if (!scored.length) return noMatchText(topic, flushWarn) + (debugMode ? "\n\n" + diag.join("\n") : "");
  const cooldownTurns = Math.max(0, Number(recallCfg.cooldownTurns) || 0);
  const ledger = await readLedger(fs, ws);
  const turn = (ledger.turn || 0) + 1;
  const available: any[] = [];
  let cooledCount = 0;
  for (const s of scored) {
    const rec = ledger.served && ledger.served[s.mm.rel];
    const cooled = cooldownTurns > 0 && rec && rec.detail && typeof rec.turn === "number" && turn - rec.turn <= cooldownTurns;
    if (cooled) { if (debugMode) diag.push(`降权·cooldown ${s.mm.rel}`); cooledCount++; continue; }
    available.push(s);
  }
  if (debugMode) diag.push(`可用（未冷却）${available.length}${cooledCount ? ` · 冷却 ${cooledCount}` : ""}`);
  if (!available.length) return noMatchText(topic, flushWarn) + (debugMode ? "\n\n" + diag.join("\n") : "");
  const n = available.length;
  const parts: string[] = [];
  let used = 0;
  const servedDetail: string[] = [];
  for (const s of available) {
    if (parts.length >= limit) break;
    const sharedPool = Math.max(0, Math.floor((maxChars - used) / Math.max(1, n)));
    const cap = Math.max(120, Math.floor((maxChars / n) * 2) + sharedPool);
    let render = renderByTier(s, cap, false, tokens);
    if (used + render.length > maxChars) {
      const degraded = renderByTier(s, cap, true, tokens);
      if (used + degraded.length > maxChars) break;
      render = degraded;
    }
    parts.push(render);
    used += render.length;
    if (debugMode) {
      const b = s.breakdown || {};
      diag.push(`返回 ${s.mm.rel} · 命中 ${s.score} · 入口${b.entry || 0} 主题${b.topic || 0} 路径${b.path || 0} 正文${b.body || 0}${s.evidence ? ` · 状态${s.evidence.status}` : ""}`);
    }
    if (s.tier !== "L0" && render.includes("…")) servedDetail.push(s.mm.rel);
  }
  if (debugMode) diag.push(`预算 ${maxChars} 字 · 返回 ${parts.length} 条`);
  if (cooldownTurns > 0 && servedDetail.length) {
    const nextServed = Object.assign({}, ledger.served || {});
    for (const p of servedDetail) nextServed[p] = { turn, detail: true };
    for (const k of Object.keys(nextServed)) {
      if (turn - nextServed[k].turn > cooldownTurns * 4) delete nextServed[k];
    }
    const keys = Object.keys(nextServed);
    if (keys.length > 500) {
      keys.sort((a, b) => (nextServed[a].turn || 0) - (nextServed[b].turn || 0)).slice(0, keys.length - 500).forEach((k) => delete nextServed[k]);
    }
    await writeLedger(fs, ws, { turn, served: nextServed });
  }
  if (servedDetail.length) {
    const next = await readMeta(fs, ws);
    const observer = agent?.id ? String(agent.id) : "";
    for (const p of servedDetail) {
      const rec = next[p] || { created: today(), hits: 0, status: "active", confidence: 0.5, pinned: false, createdBy: "", confirmedBy: [] };
      rec.hits = (rec.hits || 0) + 1;
      rec.lastSeen = turn;
      if (observer) {
        const cb = Array.isArray(rec.confirmedBy) ? rec.confirmedBy : [];
        if (observer !== (rec.createdBy || "") && !cb.includes(observer)) { cb.push(observer); rec.confirmedBy = cb.slice(-10); }
      }
      next[p] = rec;
    }
    await writeMeta(fs, ws, next);
  }
  const kgBlock = args?.kg ? await kgTrace(fs, ws, memories, topic) : "";
  const out = scrubFinal(RECALL_PREFIX + (kgBlock ? kgBlock + "\n\n" : "") + (debugMode ? diag.join("\n") + "\n\n" : "") + parts.join("\n\n") + flushWarn);
  await recordObservationTrace(fs, ws, {
    observerId: obsCtx.observerId,
    createdAt: today(),
    realityAnchor: obsCtx.realityAnchor,
    intent: obsCtx.intent,
    projection: { visible: available.slice(0, limit).map((s: any) => s.entry || s.mm?.name || ""), hidden: [], distortion: obsCtx.intent.goal ? [obsCtx.intent.goal] : [] },
    uncertainty: { level: available.length ? 0 : memories.length, reasons: [] },
    metadata: { source: "read_shadow" },
    state: obsCtx.state,
  });
  return out;
}
