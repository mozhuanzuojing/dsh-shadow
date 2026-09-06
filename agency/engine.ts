// dsh-shadow —— agency/engine.ts：Agency 三对象构建（context / selection / boundary event），并用 guard 锁死不变式。
// Agency ≠ Autonomy：行动能力不得自造目的、不因成功而扩张、不升级为自主。目标 "可以拥有行动能力，同时不把行动能力误认为自己的目的"。
import type { AgencyContext, AgencySelection, AgencyBoundaryEvent } from "./types.js";
import { isExternalObjectiveSource, objectiveIsExternal, reasonIsConstraintOnly, eventProvenanceOk, authorityIsNotIdentity, hasNoAutonomousTransition, isNotAgencyExpansion, hasNoOwnership, hasNoIdentityClaim, isNotInternalReason } from "./guards.js";
import { writeAgencyContext, writeAgencyEvent } from "./persistence.js";
import { today } from "../core/util.js";

// 构建 AgencyContext（immutable snapshot）。authoritySource 必须外部；objectiveRef 不得自指。
export const buildAgencyContext = (args: any): { ok: boolean; reason?: string; ctx?: AgencyContext } => {
  const authoritySource = String(args?.authoritySource || "");
  if (!isExternalObjectiveSource(authoritySource)) return { ok: false, reason: "authoritySource 须 external/human/system/user（禁 observer/self 授权）" };
  const objectiveRef = String(args?.objectiveRef || "");
  if (!objectiveIsExternal(objectiveRef)) return { ok: false, reason: "objectiveRef 禁自指（Agency 不生成 Objective；objective 只能来自外部）" };
  return {
    ok: true,
    ctx: { id: `agc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, objectiveRef, authoritySource: authoritySource as AgencyContext["authoritySource"], authorityScope: String(args?.authorityScope || ""), constraints: (args?.constraints as string[]) || [], createdAt: today() },
  };
};

// AgencySelection：选中候选（不是目的），reason 只允许 constraint_satisfied。
export const pickAgencySelection = (args: any): { ok: boolean; reject?: string; sel?: AgencySelection } => {
  const reason = String(args?.reason || "");
  if (reason && !/constraint_satisfied/i.test(reason)) return { ok: false, reject: "reason 须为 constraint_satisfied（非 more valuable/meaningful/better）" };
  if (!reasonIsConstraintOnly(reason)) return { ok: false, reject: "reason 禁 valuable/meaningful/better/preferred（选择≠价值判断）" };
  const candidates = (args?.candidates as any[]) || [];
  const selectedId = String(args?.selectedCandidateId || "");
  const chosen = candidates.find((c) => !(c?.violatedConstraints || []).length || ((c?.satisfiedConstraints || []).length >= (c?.violatedConstraints || []).length));
  const id = selectedId || chosen?.id || candidates[0]?.id || "";
  if (!id) return { ok: false, reject: "无候选可选中（需候选 + 约束满足）" };
  return { ok: true, sel: { selectedCandidateId: id, reason: "constraint_satisfied" } };
};

// AgencyBoundaryEvent（audit node）。lineage 不可断；Authority ≠ Identity；执行结果禁 Autonomy/所有权。
export const buildAgencyEvent = async (fs: any, ws: string, args: any): Promise<{ ok: boolean; reason?: string; ev?: AgencyBoundaryEvent }> => {
  const ev: AgencyBoundaryEvent = { actionCandidate: String(args?.actionCandidate || ""), authorityRef: String(args?.authorityRef || ""), objectiveRef: String(args?.objectiveRef || ""), constraintCheck: (args?.constraintCheck as string[]) || [], executionResult: String(args?.executionResult || "") };
  if (!eventProvenanceOk(ev)) return { ok: false, reason: "objectiveRef 须外部来源（Action→Candidate→Plan→Objective→External Authority 的 lineage 不可断）" };
  if (!authorityIsNotIdentity(ev.authorityRef, String(args?.identityRef || ""))) return { ok: false, reason: "Authority ≠ Identity（授权引用与身份分离，禁把授权当身份）" };
  // ADR-0029.1（v0.35.1）：确定性守卫——Agency 只能解释行动来源，不能成为行动目的来源。
  const result = ev.executionResult;
  if (!hasNoAutonomousTransition(result)) return { ok: false, reason: "执行结果禁自主转换（Bounded→Autonomous 须外部权威+显式协议变更）" };
  if (/autonomous|自主|更多自由|expanded scope|self purpose|control the world|拥有世界|控制世界|become self|become autonomous|autonomous agency|自主转换/i.test(result)) return { ok: false, reason: "执行结果禁 Autonomy/所有权（Agency 有行动能力 ≠ 有自我目的）" };
  if (!isNotAgencyExpansion(result)) return { ok: false, reason: "执行结果禁扩权（Success→Observation/Validation，非 Success→Authority；禁 agencyLevel++/allowedActions.add）" };
  if (!hasNoOwnership(result)) return { ok: false, reason: "执行结果禁所有权声称（permission to modify ≠ ownership of）" };
  if (!hasNoIdentityClaim(result)) return { ok: false, reason: "执行结果禁身份声称（successful action ≠ 『我是更好规划者』；identity 只来自 Reflection→Candidate→Evaluator）" };
  if (!isNotInternalReason(result)) return { ok: false, reason: "执行结果禁内部理由（系统只答『因为外部目标X/授权Y/约束Z』，不能答『因为我认为应该这样』）" };
  await writeAgencyEvent(fs, ws, ev);
  return { ok: true, ev };
};
