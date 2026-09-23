// dsh-shadow —— simulation/types/state.ts：CounterfactualState（必须保留 derivedFrom，否则模拟变凭空世界）。
export interface CounterfactualState {
  scenarioId: string;
  derivedFrom: string[];      // Representation ids（lineage）
  assumptions: string[];
  stateVariables: string[];
  uncertainty: number;
}
