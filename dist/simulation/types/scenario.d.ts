export interface SimulationScenario {
    id: string;
    basedOnRepresentationIds: string[];
    initialState: string[];
    changedConditions: string[];
    assumptions: string[];
    uncertainty: number;
}
