export interface PlanningObjective {
    source: "external";
    description: string;
    constraints: string[];
}
export interface PlanningContext {
    id: string;
    realitySnapshot: string[];
    representationSnapshot: string[];
    simulationReferences: string[];
    objective: PlanningObjective;
}
export interface PlanCandidate {
    id: string;
    basedOnSimulation: string[];
    actionSequence: string[];
    assumptions: string[];
    constraints: string[];
    uncertainty: number;
}
export interface PlanTradeoff {
    condition: string;
    consequence: string;
    uncertainty: number;
}
export interface PlanEvaluation {
    candidates: PlanCandidate[];
    tradeoffs: PlanTradeoff[];
    unresolvedQuestions: string[];
}
