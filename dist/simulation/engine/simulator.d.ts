import type { SimulationScenario } from "../types/scenario.js";
import type { SimulationOutcome } from "../types/outcome.js";
import type { SimulationRule } from "../types/rule.js";
export declare const applyRule: (condition: string) => SimulationRule;
export declare const simulate: (scenario: SimulationScenario) => SimulationOutcome;
