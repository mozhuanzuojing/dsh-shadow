// dsh-shadow —— delegation/types/event.ts：AutonomyBoundaryEvent（纯审计事件）。
// 记录 delegation→candidate→constraint check→execution→feedback；不是 decision/learning/policy record。
export interface AutonomyBoundaryEvent {
  id: string;
  delegationRef: string;
  authorityRef: string;
  objectiveRef: string;      // 外部目标来源（lineage Action→Plan→Objective→Delegation→Authority）
  candidateAction: string;
  constraintCheck: { passed: string[]; violated: string[] };
  scopeCheck: boolean;       // 是否在 allowedScope 内
  executionResult: string;
  boundaryTriggered: boolean; // 是否触发边界（revocation/expiry/scope-exceed）
  executedAt: string;
}
