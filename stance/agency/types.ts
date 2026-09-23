// dsh-shadow —— agency/types.ts：v0.35 Agency Boundary Kernel 类型。
// Agency = 可解释、可约束、不可自我扩张的"行动能力"；不是 Autonomous Agent。Agency ≠ Autonomy。
export interface AgencyContext {
  id: string;
  objectiveRef: string;           // 外部目标引用（objective 谁给的）
  authoritySource: "external";    // Human/System/User；禁 observer/self
  authorityScope: string;         // 授权范围（what I am allowed）
  constraints: string[];
  createdAt: string;
}

export interface AgencySelection {
  selectedCandidateId: string;
  reason: string;                 // 只允许 constraint_satisfied；禁 more valuable/meaningful/better future
}

export interface AgencyBoundaryEvent {
  actionCandidate: string;
  authorityRef: string;
  objectiveRef: string;           // 必须非空（External Objective Lineage）
  constraintCheck: string[];      // 已过约束
  executionResult: string;
}
