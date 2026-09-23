// dsh-shadow —— simulation/types/outcome.ts：SimulationOutcome（不叫 Prediction）。
// status 只允许 hypothetical/explored/compared；**禁 predicted/confirmed/expected**（这些词污染）。
export type SimulationStatus = "hypothetical" | "explored" | "compared";
export interface SimulationOutcome {
  id: string;
  scenarioId: string;
  status: SimulationStatus;
  derivedFrom: string[];      // Representation ids（lineage，必须保留）
  assumptions: string[];      // "Assume X"
  rules: string[];            // SimulationRule ids
  stateAfter: string[];       // 推演后状态（"suggests X may occur"，非 "X will"）
  uncertainty: number;
}
