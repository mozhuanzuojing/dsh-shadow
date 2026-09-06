export type SimulationStatus = "hypothetical" | "explored" | "compared";
export interface SimulationOutcome {
    id: string;
    scenarioId: string;
    status: SimulationStatus;
    derivedFrom: string[];
    assumptions: string[];
    rules: string[];
    stateAfter: string[];
    uncertainty: number;
}
