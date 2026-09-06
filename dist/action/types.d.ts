export interface ActionCandidate {
    id: string;
    basedOnSimulation: string[];
    assumedConditions: string[];
    proposedChange: string;
    uncertainty: number;
}
export interface ActionExecution {
    id: string;
    candidateId: string;
    executedAt: string;
    environmentChange: string;
    result: string;
}
export interface ActionFeedback {
    executionId: string;
    observedChanges: string[];
    successIndicator: string;
    unexpectedEffects: string[];
    validationRefs: string[];
}
