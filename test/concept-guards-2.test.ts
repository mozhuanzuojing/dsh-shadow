// dsh-shadow —— candidate 3：概念核 guard 不变式（第二簇：Federation/Reality/World/Simulation/Planning/Continuity）。
// 纯谓词直测 dist；正例 ok=true、反例被拦截。延续 concept-guards.test.ts 的"深模块可测"路线。
import assert from "node:assert/strict";

// —— Federation（v0.28.1–v0.29：Federation = Projection Contract，非 Access 权限）——
import { isExchangeable, assertPacketBarrier, packetOf } from "../dist/federation/contract.js";
import { compareProjections } from "../dist/federation/guard.js";
import type { ExchangeableKind, FederatedObservationPacket } from "../dist/federation/types.js";

// —— Reality（v0.30：RealityClaim ≠ EvaluationClaim；predicate 必须属 observable set）——
import { isObservablePredicate, claimOf } from "../dist/reality/claim/engine.js";
import type { RealityClaim } from "../dist/reality/types.js";

// —— World（v0.31：Representation 只接受 supported；RelationHypothesis 恒 hypothesis）——
import { isAdmissibleClaim, createRepresentationFromClaims } from "../dist/world/guard/claim-admission.js";
import { isRelationHypothesis } from "../dist/world/guard/relation-guard.js";
import type { RelationHypothesis } from "../dist/world/types.js";

// —— Simulation（v0.32：Assumption ≠ Fact；Simulation ≠ Reality）——
import { assertAssumptionAndNotFact } from "../dist/simulation/guard/assumption-guard.js";
import { outcomeIsHypothetical, outcomeHasLineage, assertNoRealityFabrication } from "../dist/simulation/guard/reality-boundary.js";
import type { SimulationOutcome } from "../dist/simulation/types/outcome.js";

// —— Planning（v0.34：objective 外部来源、无 score、comparison 非 winner、criteria≠value）——
import { objectiveIsExternal, candidateHasNoScore, evaluationIsComparison, criteriaNotValue } from "../dist/planning/guard.js";
import type { PlanCandidate, PlanEvaluation } from "../dist/planning/types.js";

// —— Continuity（v0.39/1.0.1：Global=observer 层；workspace 隔离；recall-index=导航）——
import { observerLayerClean, observerLayerNoWorkspaceFact, configNotPreference, recallIndexIsNav, workspaceIsolated } from "../dist/continuity/guard.js";
import type { ObserverConfig } from "../dist/continuity/types.js";

// ══════ Federation ══════
assert.equal(isExchangeable("ObservationClaim"), true, "ObservationClaim 可交换");
assert.equal(isExchangeable("ValidationResult"), true, "ValidationResult 可交换");
// 后两条**故意传不属于 ExchangeableKind 的字符串**：测的是「不可交换的种类一律 false」这条判据，
// 不是「TS 联合类型里声明了哪些成员」。
assert.equal(isExchangeable("Memory" as unknown as ExchangeableKind), false, "Memory 不可交换");
assert.equal(isExchangeable("Identity" as unknown as ExchangeableKind), false, "Identity 不可交换");

const pkt = packetOf({ sourceObserverId: "A", observationClaim: "svc exposes api" });
assert.equal(pkt.boundary.identityExcluded, true, "packet 默认 identity 排除");
assert.equal(pkt.boundary.memoryExcluded, true, "packet 默认 memory 排除");
assert.equal(assertPacketBarrier(pkt).ok, true, "默认 packet 过 barrier");
// 夹具**故意把 `identityExcluded` 给成 false**（类型里它是字面量 `true`）：测的是「泄漏时 barrier 必须 FAIL」。
const pktLeak = { ...pkt, boundary: { identityExcluded: false, memoryExcluded: true, dreamExcluded: true } } as unknown as FederatedObservationPacket;
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

const obs1 = { id: "o1", observedAt: "2026-01-01", subjectRef: "svc", sourcePerspectives: ["A"], observation: "svc exposes api", temporalContext: "2026", validationRefs: [] };
assert.equal(claimOf({ observations: [] }), null, "无 observation 不产 claim");
const cand = claimOf({ observations: [obs1] });
assert.equal(cand.status, "candidate", "单观察=候选");
const sup = claimOf({ observations: [obs1, { ...obs1, id: "o2" }], validations: [{ id: "v1", outcome: "validated" }] });
assert.equal(sup.status, "supported", "多观察+validated=supported");
const unst = claimOf({ observations: [obs1, { ...obs1, id: "o2" }], validations: [{ id: "v1", outcome: "rejected" }] });
assert.equal(unst.status, "unstable", "含 rejected=unstable");

// ══════ World ══════
// 本组夹具**故意只给判据真正读到的字段**：`isAdmissibleClaim`/`createRepresentationFromClaims` 只读
// id/status/temporalContext/confidence.alternativeSurvival。测的是「哪些 status 可入 Representation」，
// 不是「字段齐全的 RealityClaim 能否构造」。
assert.equal(isAdmissibleClaim({ status: "supported" } as unknown as RealityClaim), true, "supported 可入 Representation");
assert.equal(isAdmissibleClaim({ status: "candidate" } as unknown as RealityClaim), false, "candidate 不可入 Representation");
assert.equal(createRepresentationFromClaims([]).ok, false, "无 claim 拒绝");
const rep = createRepresentationFromClaims([{ id: "rc1", status: "supported", temporalContext: "2026" } as unknown as RealityClaim]);
assert.equal(rep.ok, true, "supported 全通过");
assert.ok(rep.object.status === "represented", "object status=represented");
assert.equal(createRepresentationFromClaims([{ id: "rc1", status: "candidate" } as unknown as RealityClaim]).ok, false, "含非 supported 拒绝");

// 同上：谓词只读 `r.status`，故夹具**故意只给 status**（含类型外的 "fact"）：
// 测的是「fact/reality 这类词一律拒绝」，而不是「RelationHypothesis 的字段齐不齐」。
assert.equal(isRelationHypothesis({ status: "hypothesis" } as unknown as RelationHypothesis), true, "hypothesis 允许");
assert.equal(isRelationHypothesis({ status: "validated" } as unknown as RelationHypothesis), true, "validated 允许");
assert.equal(isRelationHypothesis({ status: "fact" } as unknown as RelationHypothesis), false, "fact 禁止（恒 hypothesis）");

// ══════ Simulation ══════
assert.equal(assertAssumptionAndNotFact("Assume X").ok, true, "Assume X 允许");
assert.equal(assertAssumptionAndNotFact("X will cause Y").ok, false, "will cause 禁止");
assert.equal(assertAssumptionAndNotFact("发生事实").ok, false, "非假设措辞禁止");
// 同上：这两个谓词只读 status / derivedFrom，夹具**故意只给被读的那一个字段**
// （含类型外的 "predicted"/"confirmed"）：测的是「哪些状态算假设 / 有没有 lineage」。
assert.equal(outcomeIsHypothetical({ status: "hypothetical" } as unknown as SimulationOutcome), true, "hypothetical 允许");
assert.equal(outcomeIsHypothetical({ status: "predicted" } as unknown as SimulationOutcome), false, "predicted 禁止");
assert.equal(outcomeHasLineage({ derivedFrom: ["rep-1"] } as unknown as SimulationOutcome), true, "有 lineage 允许");
assert.equal(outcomeHasLineage({ derivedFrom: [] } as unknown as SimulationOutcome), false, "无 lineage 禁止");
assert.equal(assertNoRealityFabrication({ status: "hypothetical" } as unknown as SimulationOutcome).ok, true, "hypothetical 过现实边界");
assert.equal(assertNoRealityFabrication({ status: "confirmed" } as unknown as SimulationOutcome).ok, false, "confirmed 造现实禁止");

// ══════ Planning ══════
assert.equal(objectiveIsExternal({ source: "external", description: "减少延迟", constraints: [] }), true, "外部 objective 允许");
assert.equal(objectiveIsExternal({ source: "external", description: "observer.generateObjective()", constraints: [] }), false, "自生成 objective 禁止");
assert.equal(objectiveIsExternal(null), false, "null objective 禁止");
// 同上：这两个谓词**按键名**判（score/best/optimal；winner/ranking），夹具**故意只给 id + 一个（或禁或不禁的）键**，
// 测的是这些键名会不会被抓到，而不是 PlanCandidate / PlanEvaluation 的字段齐不齐。
assert.equal(candidateHasNoScore({ id: "c" } as unknown as PlanCandidate), true, "无 score 允许");
assert.equal(candidateHasNoScore({ id: "c", score: 0.9 } as unknown as PlanCandidate), false, "含 score 禁止");
assert.equal(evaluationIsComparison({ candidates: ["a", "b"] } as unknown as PlanEvaluation), true, "comparison 允许");
assert.equal(evaluationIsComparison({ winner: "a" } as unknown as PlanEvaluation), false, "winner 禁止");
assert.equal(criteriaNotValue("减少延迟"), true, "criteria 非 value 允许");
assert.equal(criteriaNotValue("better"), false, "better 禁止");

// ══════ Continuity ══════
assert.equal(observerLayerClean({ planningCannotCreateObjective: true }), true, "boundary 字段名不误伤（精确键）");
assert.equal(observerLayerClean({ goal: "减少延迟" }), false, "goal 内容禁入全局层");
assert.equal(observerLayerClean({ knowledge: "bank 用 Oracle" }), false, "knowledge 禁入全局层");
assert.equal(observerLayerNoWorkspaceFact({ interactionStyle: "boundary-first" }), true, "无项目事实允许");
assert.equal(observerLayerNoWorkspaceFact({ description: "bank-service 使用 Oracle" }), false, "项目代码事实禁止入 observer 层");
assert.equal(configNotPreference({ interactionStyle: "boundary-first", outputPreference: "adr", defaultProtocol: "boundary-first" }), true, "config 非偏好允许");
// 这一条**故意给一个不属于 ObserverConfig 的键**（`description`）：测的是「含偏好措辞的对象一律拒绝」，
// 而不是「只扫 ObserverConfig 声明的那些键」。
assert.equal(configNotPreference({ description: "我更喜欢 A 方案" } as unknown as ObserverConfig), false, "偏好声称禁止");
assert.equal(recallIndexIsNav({ workspace: "ws1", records: [{ id: "a", location: "b" }] }), true, "recall-index=导航允许");
assert.equal(recallIndexIsNav({ workspace: "ws1", records: [{ id: "a", location: "b", extra: 1 }] }), false, "record 多键禁止（导航只存 id+location）");
assert.equal(workspaceIsolated({ workspace: "ws1" }), true, "声明 workspace 允许");
assert.equal(workspaceIsolated({ workspace: "" }), false, "空 workspace 禁止");

console.log("✔ 场景 Concept-Guard-2：Federation/Reality/World/Simulation/Planning/Continuity 边界核 guard 不变式（candidate 3 深模块可测）");
console.log("ALL PASS ✅");
