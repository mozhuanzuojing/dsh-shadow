// dsh-shadow —— agency/guards.ts：v0.35 不变式守卫。
// Agency ≠ Autonomy：行动能力不得自造目的、不得因成功而扩张、不升级为自主。
export function isExternalObjectiveSource(src) {
    return /^(external|human|system|user|delegated)$/i.test(src || "");
}
// Invariant 166: Agency 从不生成 Objective；objectiveRef 必须来自外部，禁止 observer/self 自指。
export function objectiveIsExternal(objRef) {
    if (!objRef)
        return false;
    return !/observer|self|自身|自主/i.test(objRef);
}
// Invariant 170 / 约束: reason 只允许 constraint_satisfied；禁 valuable/meaningful/better/optimal/preferred。
export function reasonIsConstraintOnly(reason) {
    if (!/constraint_satisfied/i.test(reason || ""))
        return false;
    return !/valuable|meaningful|better|optimal|preferred|worthwhile|more valuable/i.test(reason || "");
}
// Invariant 169: 成功不提升 agencyLevel/authorityScope/objectiveSource（无升级 API）。
// 守卫本身没有写入接口；此处仅供测试/渲染断言，不提供任何"增强"函数。
export function hasNoUpgradeApi() {
    return true; // 本模块刻意不导出任何 expandScop/upgradeLevel 函数。
}
// Invariant 172: AgencyBoundaryEvent 的 objectiveRef 必须非空（Action→Candidate→Plan→Objective→External Source）。
export function eventProvenanceOk(e) {
    return !!(e.actionCandidate && e.authorityRef && objectiveIsExternal(e.objectiveRef));
}
// Invariant 167: Authority ≠ Identity。authorityRef 与 identity 分离，禁止把授权当身份。
export function authorityIsNotIdentity(authorityRef, identityRef) {
    return authorityRef !== identityRef;
}
// ── ADR-0029.1（v0.35.1 Agency Integrity Lock）─ 确定性守卫，保证 "Agency 只能解释行动来源，不能成为行动目的来源" ──
// Invariant 175: Authority Lineage — 禁 "internal reason"。系统不能答 "因为我认为应该这样"。
export const INTERNAL_REASON = /我认为应该|我觉得应该|because i think|internal reason|自认为|凭直觉/i;
export const isNotInternalReason = (r) => !INTERNAL_REASON.test(r || "");
// Invariant 176: Feedback Cannot Expand Agency — 禁 agencyLevel/allowedActions 扩张（Success→Authority）。
export const AGENCY_EXPAND = /agencyLevel|allowedActions|授权扩大|权限扩大|能力增长|扩权|expand scope/i;
export const isNotAgencyExpansion = (r) => !AGENCY_EXPAND.test(r || "");
// Invariant 178: Authority ≠ Ownership — 禁 ownership 声称（permission to modify ≠ ownership of）。
export const OWNERSHIP = /owns?\s(s|the|service)|\bown(s|ed)?\b.*(world|service|architect)|所有权|拥有|belong to/i;
export const hasNoOwnership = (r) => !OWNERSHIP.test(r || "");
// Invariant 179: Agency ≠ Identity — 禁 "我是更好规划者 / 我负责X"。
export const IDENTITY_CLAIM = /i am a good|i am better|我擅长|我是更好|responsible for|我负责|我承担/i;
export const hasNoIdentityClaim = (r) => !IDENTITY_CLAIM.test(r || "");
// Invariant 180: Autonomous Transition — 禁 Bounded→Autonomous（须外部权威+显式协议变更）。
export const AUTONOMOUS_TRANSITION = /autonomous agency|become autonomous|升级为自主|自主转换|自主化|autonomy increase/i;
export const hasNoAutonomousTransition = (r) => !AUTONOMOUS_TRANSITION.test(r || "");
