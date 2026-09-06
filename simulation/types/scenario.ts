// dsh-shadow —— simulation/types/scenario.ts：SimulationScenario（"如果改变某个条件"，HypotheticalChange 非 RealityChange）。
export interface SimulationScenario {
  id: string;
  basedOnRepresentationIds: string[];
  initialState: string[];
  changedConditions: string[];   // 必须 "Assume X"（假设，非 X will）
  assumptions: string[];
  uncertainty: number;
}
