// dsh-shadow —— agency/guards.ts：v0.35 不变式守卫。
// Agency ≠ Autonomy：行动能力不得自造目的、不得因成功而扩张、不升级为自主。

export function isExternalObjectiveSource(src: string): boolean {
  return /^(external|human|system|user|delegated)$/i.test(src || "");
}

// Invariant 166: Agency 从不生成 Objective；objectiveRef 必须来自外部，禁止 observer/self 自指。
export function objectiveIsExternal(objRef: string): boolean {
  if (!objRef) return false;
  return !/observer|self|自身|自主/i.test(objRef);
}

// Invariant 170 / 约束: reason 只允许 constraint_satisfied；禁 valuable/meaningful/better/optimal/preferred。
export function reasonIsConstraintOnly(reason: string): boolean {
  if (!/constraint_satisfied/i.test(reason || "")) return false;
  return !/valuable|meaningful|better|optimal|preferred|worthwhile|more valuable/i.test(reason || "");
}

// Invariant 169: 成功不提升 agencyLevel/authorityScope/objectiveSource（无升级 API）。
// 守卫本身没有写入接口；此处仅供测试/渲染断言，不提供任何"增强"函数。
export function hasNoUpgradeApi(): boolean {
  return true; // 本模块刻意不导出任何 expandScop/upgradeLevel 函数。
}

// Invariant 172: AgencyBoundaryEvent 的 objectiveRef 必须非空（Action→Candidate→Plan→Objective→External Source）。
export function eventProvenanceOk(e: { actionCandidate: string; authorityRef: string; objectiveRef: string }): boolean {
  return !!(e.actionCandidate && e.authorityRef && objectiveIsExternal(e.objectiveRef));
}

// Invariant 167: Authority ≠ Identity。authorityRef 与 identity 分离，禁止把授权当身份。
export function authorityIsNotIdentity(authorityRef: string, identityRef: string): boolean {
  return authorityRef !== identityRef;
}
