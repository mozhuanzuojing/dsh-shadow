// dsh-shadow —— candidate 3：概念核 guard 不变式（第二簇：Federation/Reality/World/Simulation/Planning/Continuity）。
// 纯谓词直测 dist；正例 ok=true、反例被拦截。延续 concept-guards.test.ts 的"深模块可测"路线。
import assert from "node:assert/strict";

// —— Federation（v0.28.1–v0.29：Federation = Projection Contract，非 Access 权限）——
import { isExchangeable, assertPacketBarrier, packetOf } from "../dist/federation/contract.js";
import { compareProjections } from "../dist/federation/guard.js";

// —— Reality（v0.30：RealityClaim ≠ EvaluationClaim；predicate 必须属 observable set）——
import { isObservablePredicate, claimOf } from "../dist/reality/claim/engine.js";

// —— World（v0.31：Representation 只接受 supported；RelationHypothesis 恒 hypothesis）——
import { isAdmissibleClaim, createRepresentationFromClaims } from "../dist/world/guard/claim-admission.js";
import { isRelationHypothesis } from "../dist/world/guard/relation-guard.js";

// —— Simulation（v0.32：Assumption ≠ Fact；Simulation ≠ Reality）——
import { assertAssumptionAndNotFact } from "../dist/simulation/guard/assumption-guard.js";
import { outcomeIsHypothetical, outcomeHasLineage, assertNoRealityFabrication } from "../dist/simulation/guard/reality-boundary.js";

// —— Planning（v0.34：objective 外部来源、无 score、comparison 非 winner、criteria≠value）——
import { objectiveIsExternal, candidateHasNoScore, evaluationIsComparison, criteriaNotValue } from "../dist/planning/guard.js";

// —— Continuity（v0.39/1.0.1：Global=observer 层；workspace 隔离；recall-index=导航）——
import { observerLayerClean, observerLayerNoWorkspaceFact, configNotPreference, recallIndexIsNav, workspaceIsolated } from "../dist/continuity/guard.js";

// ══════ Federation ══════
assert.equal(isExchangeable("ObservationClaim"), true, "ObservationClaim 可交换");
assert.equal(isExchangeable("ValidationResult"), true, "ValidationResult 可交换");
assert.equal(isExchangeable("Memory"), false, "Memory 不可交换");
assert.equal(isExchangeable("Identity"), false, "Identity 不可交换");

const pkt = packetOf({ sourceObserverId: "A", observationClaim: "svc exposes api" });
assert.equal(pkt.boundary.identityExcluded, true, "packet 默认 identity 排除");
assert.equal(pkt.boundary.memoryExcluded, true, "packet 默认 memory 排除");
assert.equal(assertPacketBarrier(pkt).ok, true, "默认 packet 过 barrier");
const pktLeak = { ...pkt, boundary: { identityExcluded: false, memoryExcluded: true, dreamExcluded: true } };
assert.equal(assertPacketBarrier(pktLeak).ok, false, "Identity 泄漏 → barrier FAIL");
assert.ok(assertPacketBarrier(pktLeak).reasons.includes("Identity 泄漏"), "reason 指明泄漏");

const d = compareProjections({ observerId: "A", visible: ["x", "y"], hidden: [] }, { observerId: "B", visible: ["y", "z"], hidden: [] });
assert.deepEqual(d.sameReality.visibleUnion, ["x", "y", "z"], "可见并集");
assert.deepEqual(d.disagreement[0].misses, ["z"], "A misses z");
assert.deepEqual(d.disagreement[1].misses, ["x"], "B misses x");

// ══════ Reality ══════
assert.equal(isObservablePredicate("exists"), true, "exists∈observable set");
assert.equal(isObservablePredicate("exposed_api"), true, "exposed_api∈observable set");
assert.equal(isObservablePredicate("is_better"), false, "is_better∉observable set（RealityClaim≠EvaluationClaim）");

const obs1 = { id: "o1", subjectRef: "svc", sourcePerspectives: ["A"], temporalContext: "2026", observation: "svc exposes api" };
assert.equal(claimOf({ observations: [] }), null, "无 observation 不产 claim");
const cand = claimOf({ observations: [obs1] });
assert.equal(cand.status, "candidate", "单观察=候选");
const sup = claimOf({ observations: [obs1, { ...obs1, id: "o2" }], validations: [{ id: "v1", outcome: "validated" }] });
assert.equal(sup.status, "supported", "多观察+validated=supported");
const unst = claimOf({ observations: [obs1, { ...obs1, id: "o2" }], validations: [{ id: "v1", outcome: "rejected" }] });
assert.equal(unst.status, "unstable", "含 rejected=unstable");

// ══════ World ══════
assert.equal(isAdmissibleClaim({ status: "supported" }), true, "supported 可入 Representation");
assert.equal(isAdmissibleClaim({ status: "candidate" }), false, "candidate 不可入 Representation");
assert.equal(createRepresentationFromClaims([]).ok, false, "无 claim 拒绝");
const rep = createRepresentationFromClaims([{ id: "rc1", status: "supported", temporalContext: "2026" }]);
assert.equal(rep.ok, true, "supported 全通过");
assert.ok(rep.object.status === "represented", "object status=represented");
assert.equal(createRepresentationFromClaims([{ id: "rc1", status: "candidate" }]).ok, false, "含非 supported 拒绝");

assert.equal(isRelationHypothesis({ status: "hypothesis" }), true, "hypothesis 允许");
assert.equal(isRelationHypothesis({ status: "validated" }), true, "validated 允许");
assert.equal(isRelationHypothesis({ status: "fact" }), false, "fact 禁止（恒 hypothesis）");

// ══════ Simulation ══════
assert.equal(assertAssumptionAndNotFact("Assume X").ok, true, "Assume X 允许");
assert.equal(assertAssumptionAndNotFact("X will cause Y").ok, false, "will cause 禁止");
assert.equal(assertAssumptionAndNotFact("发生事实").ok, false, "非假设措辞禁止");
assert.equal(outcomeIsHypothetical({ status: "hypothetical" }), true, "hypothetical 允许");
assert.equal(outcomeIsHypothetical({ status: "predicted" }), false, "predicted 禁止");
assert.equal(outcomeHasLineage({ derivedFrom: ["rep-1"] }), true, "有 lineage 允许");
assert.equal(outcomeHasLineage({ derivedFrom: [] }), false, "无 lineage 禁止");
assert.equal(assertNoRealityFabrication({ status: "hypothetical" }).ok, true, "hypothetical 过现实边界");
assert.equal(assertNoRealityFabrication({ status: "confirmed" }).ok, false, "confirmed 造现实禁止");

// ══════ Planning ══════
assert.equal(objectiveIsExternal({ source: "external", description: "减少延迟" }), true, "外部 objective 允许");
assert.equal(objectiveIsExternal({ source: "external", description: "observer.generateObjective()" }), false, "自生成 objective 禁止");
assert.equal(objectiveIsExternal(null), false, "null objective 禁止");
assert.equal(candidateHasNoScore({ id: "c" }), true, "无 score 允许");
assert.equal(candidateHasNoScore({ id: "c", score: 0.9 }), false, "含 score 禁止");
assert.equal(evaluationIsComparison({ candidates: ["a", "b"] }), true, "comparison 允许");
assert.equal(evaluationIsComparison({ winner: "a" }), false, "winner 禁止");
assert.equal(criteriaNotValue("减少延迟"), true, "criteria 非 value 允许");
assert.equal(criteriaNotValue("better"), false, "better 禁止");

// ══════ Continuity ══════
assert.equal(observerLayerClean({ planningCannotCreateObjective: true }), true, "boundary 字段名不误伤（精确键）");
assert.equal(observerLayerClean({ goal: "减少延迟" }), false, "goal 内容禁入全局层");
assert.equal(observerLayerClean({ knowledge: "bank 用 Oracle" }), false, "knowledge 禁入全局层");
assert.equal(observerLayerNoWorkspaceFact({ interactionStyle: "boundary-first" }), true, "无项目事实允许");
assert.equal(observerLayerNoWorkspaceFact({ description: "bank-service 使用 Oracle" }), false, "项目代码事实禁止入 observer 层");
assert.equal(configNotPreference({ interactionStyle: "boundary-first" }), true, "config 非偏好允许");
assert.equal(configNotPreference({ description: "我更喜欢 A 方案" }), false, "偏好声称禁止");
assert.equal(recallIndexIsNav({ workspace: "ws1", records: [{ id: "a", location: "b" }] }), true, "recall-index=导航允许");
assert.equal(recallIndexIsNav({ workspace: "ws1", records: [{ id: "a", location: "b", extra: 1 }] }), false, "record 多键禁止（导航只存 id+location）");
assert.equal(workspaceIsolated({ workspace: "ws1" }), true, "声明 workspace 允许");
assert.equal(workspaceIsolated({ workspace: "" }), false, "空 workspace 禁止");

console.log("✔ 场景 Concept-Guard-2：Federation/Reality/World/Simulation/Planning/Continuity 边界核 guard 不变式（candidate 3 深模块可测）");
console.log("ALL PASS ✅");
