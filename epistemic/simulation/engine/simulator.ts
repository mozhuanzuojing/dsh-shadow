// dsh-shadow —— simulation/engine/simulator.ts：Simulation Engine（确定性迷你模拟器）。
// Simulation 是 Representation 的函数 + 显式假设 + 规则，不是 Reality 的函数。只产 hypothetical 推演。
import type { SimulationScenario } from "../types/scenario.js";
import type { SimulationOutcome } from "../types/outcome.js";
import type { SimulationRule } from "../types/rule.js";
import { newId } from "../../../core/util.js";

const RULES: SimulationRule[] = [
  { id: "r-latency", inputPattern: "latency", transformation: "latency increase -> timeout risk increase", confidence: 0.6, source: "heuristic" },
  { id: "r-dep", inputPattern: "removed", transformation: "remove dependency target -> possible unavailability of dependents", confidence: 0.5, source: "relation hypothesis" },
  { id: "r-capacity", inputPattern: "capacity", transformation: "capacity decrease -> possible degradation", confidence: 0.6, source: "heuristic" },
];

export const applyRule = (condition: string): SimulationRule => RULES.find((r) => condition.toLowerCase().includes(r.inputPattern.toLowerCase())) || RULES[0];

export const simulate = (scenario: SimulationScenario): SimulationOutcome => {
  const condition = scenario.changedConditions[0] || "Assume unknown change";
  const rule = applyRule(condition);
  const stateAfter = [
    `Given ${scenario.changedConditions.join(", ")}`,
    `representation suggests ${rule.transformation.split("->")[1]?.trim() || "possible impact"} (may occur)`,
  ];
  return {
    id: newId("sim"),   // A12：id 生成**收一处**到 `core/util.ts`（4 位 base36 ⇒ 6 位，同一毫秒内碰撞后是**静默覆盖**）
    scenarioId: scenario.id,
    status: "hypothetical",          // 只 hypothetical，禁 predicted/confirmed/expected
    derivedFrom: scenario.basedOnRepresentationIds,   // lineage（必须保留）
    assumptions: scenario.assumptions,
    rules: [rule.id],
    stateAfter,                       // "suggests ... may occur"，非 "will cause"
    uncertainty: scenario.uncertainty,
  };
};
