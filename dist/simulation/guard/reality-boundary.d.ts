import type { SimulationOutcome } from "../types/outcome.js";
export declare const FORBIDDEN_OUTCOME_STATUS: Set<string>;
export declare const outcomeIsHypothetical: (o: SimulationOutcome) => boolean;
export declare const outcomeHasLineage: (o: SimulationOutcome) => boolean;
export declare const assertNoRealityFabrication: (o: SimulationOutcome) => {
    ok: boolean;
    reason?: string;
};
