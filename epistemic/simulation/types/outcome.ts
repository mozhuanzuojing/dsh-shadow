// dsh-shadow —— simulation/types/outcome.ts：SimulationOutcome（不叫 Prediction）。
// status 只允许 hypothetical/explored/compared；**禁 predicted/confirmed/expected**（这些词污染）。
// ⚠ v1.21.23（T25 实测）：**当前引擎只生产 `hypothetical`**（`engine/simulator.ts` 明写「只 hypothetical」）⇒
//   `explored` / `compared` 是**声明的状态面 > 生产的状态面**（预留登记，**不是断线**）：
//   类型与 `outcomeIsHypothetical` 的白名单都**允许**它们，但没有任何地方**要求**它们被生产。
//   若将来真有人生产它们，应当**同时**补上产生路径与断言 —— 而不是让它们继续悬着。
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
