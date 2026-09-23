// dsh-shadow —— planning/types.ts：v0.34 Adaptive Planning 类型。
// Planning = constrained comparison（不是 autonomous desire formation）。objective 必须外部来源；无 score/winner。
export interface PlanningObjective { source: "external"; description: string; constraints: string[]; }
export interface PlanningContext {
  id: string;
  realitySnapshot: string[];
  representationSnapshot: string[];
  simulationReferences: string[];
  objective: PlanningObjective;   // 禁 observer.generateObjective()
}
export interface PlanCandidate {
  id: string;
  basedOnSimulation: string[];
  actionSequence: string[];
  assumptions: string[];
  constraints: string[];
  uncertainty: number;
  // 禁 score（score→optimization→preference→value→identity 的入口）
}
export interface PlanTradeoff { condition: string; consequence: string; uncertainty: number; }
export interface PlanEvaluation {
  candidates: PlanCandidate[];
  tradeoffs: PlanTradeoff[];
  unresolvedQuestions: string[];
  // comparison result，禁 winner/bestPlan/optimal
}
// PlanningComparison：非 "谁最好"，而是"哪些约束被满足/违反"。
export interface PlanningComparison {
  candidates: { id: string; satisfiedConstraints: string[]; violatedConstraints: string[]; uncertainty: number }[];
}
