// dsh-shadow —— candidate 3：概念核 guard 不变式（Agency/Delegation/Recall/Adaptation/Long-Horizon）。
// 这些 guard 是各概念核的"深逻辑"（纯谓词，无 fs/无 LLM），此前无测试。本文件把其不变式契约转为可验证单元。
// import 全部走 dist 纯函数；断言：正例返回 ok/true，反例被 guard 拦截。
import assert from "node:assert/strict";

// —— Agency（v0.35：Agency ≠ Autonomy）——
import {
  isExternalObjectiveSource, objectiveIsExternal, reasonIsConstraintOnly, eventProvenanceOk,
  authorityIsNotIdentity, isNotInternalReason, isNotAgencyExpansion, hasNoOwnership,
  hasNoIdentityClaim, hasNoAutonomousTransition,
} from "../dist/agency/guards.js";

// —— Delegation（v0.36：Delegation ≠ Ownership ≠ Authority Expansion；权源外部/生命周期）——
import {
  contextHasNoExpansionField, resultNoPermissionUpgrade, resultNoLongRunAuthority, resultNoOwnership, resultNoIdentityClaim,
} from "../dist/delegation/guard/expansion-guard.js";
import { lifecycleOf } from "../dist/delegation/guard/lifecycle-guard.js";
import { notRevoked, notExpired } from "../dist/delegation/guard/revocation-guard.js";
import { actionWithinScope, permissionNotOwnership } from "../dist/delegation/guard/scope-guard.js";

// —— Recall（v0.37：Recall = Access Transition，非 Reality Reconstruction）——
import {
  forgottenHasNoDeletion, triggerIsExternal, recallLineageComplete, recallNotObservation, recallDoesNotIncreaseCertainty,
} from "../dist/recall/guard/recall-guard.js";

// —— Adaptation（v0.38：Adaptation ≠ Identity/Authority/Objective/Preference change）——
import { resultNoEpistemicIncrease, resultNotKnowledge, validationNoCorrectness } from "../dist/adaptation/guard/epistemic-guard.js";
import { targetNotIdentity, resultNoBetterSelf, resultNoAuthorityIncrease, resultNoAgencyUpgrade } from "../dist/adaptation/guard/identity-guard.js";
import { targetInScope, resultNoObjectiveChange, resultNoPreference as adaptResultNoPreference } from "../dist/adaptation/guard/scope-guard.js";

// —— Long-Horizon（v0.39：时间累积 ≠ 权威/偏好/身份/目标）——
import { resultNoAuthorityGrowth, resultNoSelfConfidence, resultNoPreference, resultNoInferredObjective } from "../dist/long-horizon/guard/authority-guard.js";
import { summaryNoRealityField } from "../dist/long-horizon/guard/compression-guard.js";
import { resultNoIdentityChain } from "../dist/long-horizon/guard/identity-guard.js";

// ══════ Agency ══════
assert.equal(isExternalObjectiveSource("human"), true, "human=外部 authoritySource");
assert.equal(isExternalObjectiveSource("delegated"), true, "delegated=外部 authoritySource");
assert.equal(isExternalObjectiveSource("observer"), false, "observer≠外部授权");
assert.equal(isExternalObjectiveSource(""), false, "空=非外部授权");

assert.equal(objectiveIsExternal("goal/u8-gateway"), true, "外部 goalRef 允许");
assert.equal(objectiveIsExternal("self"), false, "self 自指禁止");
assert.equal(objectiveIsExternal(""), false, "空 objectiveRef 禁止");

assert.equal(reasonIsConstraintOnly("constraint_satisfied"), true, "reason=constraint_satisfied 允许");
assert.equal(reasonIsConstraintOnly("constraint_satisfied because it is more valuable"), false, "含 valuable 禁止");
assert.equal(reasonIsConstraintOnly("better"), false, "含 better 禁止");

assert.equal(eventProvenanceOk({ actionCandidate: "ac-1", authorityRef: "human", objectiveRef: "goal/u8" }), true, "lineage 完整");
assert.equal(eventProvenanceOk({ actionCandidate: "ac-1", authorityRef: "human", objectiveRef: "observer" }), false, "objectiveRef 自指断 lineage");
assert.equal(eventProvenanceOk({ actionCandidate: "ac-1", authorityRef: "", objectiveRef: "goal/u8" }), false, "缺 authorityRef");

assert.equal(authorityIsNotIdentity("human", "agent-x"), true, "Authority≠Identity");
assert.equal(authorityIsNotIdentity("agent-x", "agent-x"), false, "Authority=Identity 禁止");

assert.equal(isNotInternalReason("因为外部约束"), true, "外部理由允许");
assert.equal(isNotInternalReason("我认为应该这样"), false, "内部理由禁止");
assert.equal(isNotAgencyExpansion("执行完成，观察到结果"), true, "非扩权允许");
assert.equal(isNotAgencyExpansion("agencyLevel 提升至 2"), false, "agencyLevel 扩权禁止");
assert.equal(hasNoOwnership("完成 update config"), true, "非所有权允许");
assert.equal(hasNoOwnership("我拥有该 service"), false, "所有权禁止");
assert.equal(hasNoIdentityClaim("任务已执行"), true, "非身份声称允许");
assert.equal(hasNoIdentityClaim("我负责整个平台"), false, "身份声称禁止");
assert.equal(hasNoAutonomousTransition("任务完成"), true, "非自主转换允许");
assert.equal(hasNoAutonomousTransition("become autonomous"), false, "自主转换禁止");

// ══════ Delegation ══════
assert.equal(contextHasNoExpansionField({ delegationId: "d" }), true, "无限权字段允许");
assert.equal(contextHasNoExpansionField({ delegationId: "d", trust: 0.9 }), false, "trust 字段禁止");
assert.equal(contextHasNoExpansionField({ delegationId: "d", capabilityLevel: 3 }), false, "capabilityLevel 字段禁止");

assert.equal(resultNoPermissionUpgrade("执行了更新"), true, "非权限升级允许");
assert.equal(resultNoPermissionUpgrade("授权后获得 more authority"), false, "权限升级禁止");
assert.equal(resultNoLongRunAuthority("运行了较长时间"), true, "非长期授权允许");
assert.equal(resultNoLongRunAuthority("运行更久→更受信任→权限扩大"), false, "长期执行=自授权禁止");
assert.equal(resultNoOwnership("完成委派任务"), true, "非所有权允许");
assert.equal(resultNoOwnership("我现在 owns 该服务"), false, "所有权禁止");
assert.equal(resultNoIdentityClaim("被委派做 X"), true, "委派身份允许");
assert.equal(resultNoIdentityClaim("i am an agent capable of X"), false, "agent 身份声称禁止");

// 生命周期（active/expired/revoked）
assert.equal(lifecycleOf({ delegationId: "d" }, "2026-01-01"), "active", "无撤销/未过期=active");
assert.equal(lifecycleOf({ delegationId: "d", revocation: true }, "2026-01-01"), "revoked", "撤销=revoked");
assert.equal(lifecycleOf({ delegationId: "d", expiration: "2020-01-01" }, "2026-01-01"), "expired", "过期=expired");

assert.equal(notRevoked({ delegationId: "d" }), true, "未撤销允许");
assert.equal(notRevoked({ delegationId: "d", revocation: true }), false, "已撤销禁止");
assert.equal(notExpired({ delegationId: "d" }, "2026-01-01"), true, "无过期允许");
assert.equal(notExpired({ delegationId: "d", expiration: "2020-01-01" }, "2026-01-01"), false, "已过期禁止");

assert.equal(actionWithinScope(["update config"], "update config"), true, "action in scope");
assert.equal(actionWithinScope(["update config"], "redesign architecture"), false, "action out of scope");
assert.equal(permissionNotOwnership({ permission: "update config" }), true, "permission≠ownership");
assert.equal(permissionNotOwnership({ scope: "owns the service" }), false, "scope 含 ownership 禁止");

// ══════ Recall ══════
assert.equal(forgottenHasNoDeletion({ reason: "长期未访问" }), true, "遗忘≠删除允许");
assert.equal(forgottenHasNoDeletion({ reason: "已失效" }), false, "「已失效」=删除语义禁止");

assert.equal(triggerIsExternal({ type: "conversation", sourceRef: "msg-1" }), true, "外部 trigger 允许");
assert.equal(triggerIsExternal({ type: "certainty", sourceRef: "" }), false, "内部确定 trigger 禁止");

assert.equal(recallLineageComplete({ trigger: { sourceRef: "msg-1" }, lineage: { originalRecord: "rec-1", observationRefs: ["o1"] } }), true, "lineage 完整");
assert.equal(recallLineageComplete({ trigger: {}, lineage: {} }), false, "缺源引用=lineage 断");

assert.equal(recallNotObservation({ trigger: { type: "conversation" } }), true, "忆起≠观察允许");
assert.equal(recallNotObservation({ trigger: { type: "conversation" }, lineage: { observationRefs: ["new observation"] } }), false, "忆起产新观察禁止");
assert.equal(recallDoesNotIncreaseCertainty("access restored"), true, "忆起≠验证允许");
assert.equal(recallDoesNotIncreaseCertainty("validated"), false, "忆起=提升证据等级禁止");

// ══════ Adaptation ══════
assert.equal(resultNoEpistemicIncrease("调整了调用策略"), true, "非认知提升允许");
assert.equal(resultNoEpistemicIncrease("confidence increase"), false, "confidence 提升禁止");
assert.equal(resultNotKnowledge("观察到结果"), true, "非知识化允许");
assert.equal(resultNotKnowledge("becomes knowledge"), false, "知识化声称禁止");
assert.equal(validationNoCorrectness({ changeObserved: true, sideEffectsObserved: ["ok"] }), true, "弱语义允许");
assert.equal(validationNoCorrectness({ changeObserved: true, sideEffectsObserved: ["this change was correct"] }), false, "changeWasCorrect 禁止");

assert.equal(targetNotIdentity("method"), true, "method=允许目标");
assert.equal(targetNotIdentity("identity"), false, "identity=禁止目标");
assert.equal(resultNoBetterSelf("改进了调用方式"), true, "非 better-self 允许");
assert.equal(resultNoBetterSelf("improved myself"), false, "better-self 声称禁止");
assert.equal(resultNoAuthorityIncrease("调整了执行顺序"), true, "非权限提升允许");
assert.equal(resultNoAuthorityIncrease("more authority"), false, "权限提升禁止");
assert.equal(resultNoAgencyUpgrade("改进了策略"), true, "非自主升级允许");
assert.equal(resultNoAgencyUpgrade("autonomy increase"), false, "自主等级升级禁止");

assert.equal(targetInScope("method"), true, "method in scope");
assert.equal(targetInScope("objective"), false, "objective 越界");
assert.equal(targetInScope("identity"), false, "identity 越界");
assert.equal(resultNoObjectiveChange("改了调用方式"), true, "非目标改变允许");
assert.equal(resultNoObjectiveChange("目标改变"), false, "目标改变禁止");
assert.equal(adaptResultNoPreference("调整了策略"), true, "非偏好允许");
assert.equal(adaptResultNoPreference("i prefer this"), false, "形成偏好禁止");

// ══════ Long-Horizon ══════
assert.equal(resultNoAuthorityGrowth("执行时间较长"), true, "时间累积≠权限允许");
assert.equal(resultNoAuthorityGrowth("longer trusted more authority"), false, "时间→权限禁止");
assert.equal(resultNoSelfConfidence("长期执行成功"), true, "非自我信任允许");
assert.equal(resultNoSelfConfidence("become more confident"), false, "自我信任禁止");
assert.equal(resultNoPreference("多次选了 A"), true, "非偏好允许");
assert.equal(resultNoPreference("形成偏好 A"), false, "长期选择→偏好禁止");
assert.equal(resultNoInferredObjective("完成了多次合作"), true, "非推断目标允许");
assert.equal(resultNoInferredObjective("从长期模式推断出目标"), false, "推断目标禁止");
assert.equal(summaryNoRealityField({ sourceRefs: ["a"], compressionMethod: "summary" }), true, "摘要辅助允许");
assert.equal(summaryNoRealityField({ sourceRefs: ["a"], compressionMethod: "summarizes reality" }), false, "摘要声称=事实源禁止");
assert.equal(resultNoIdentityChain("100 次调整后改进了方法"), true, "调整链≠身份允许");
assert.equal(resultNoIdentityChain("identity evolution"), false, "身份演变禁止");

console.log("✔ 场景 Concept-Guard-1：Agency/Delegation/Recall/Adaptation/Long-Horizon 边界核 guard 不变式（candidate 3 深模块可测）");
console.log("ALL PASS ✅");
