export interface AutonomyBoundaryEvent {
    id: string;
    delegationRef: string;
    authorityRef: string;
    objectiveRef: string;
    candidateAction: string;
    constraintCheck: {
        passed: string[];
        violated: string[];
    };
    scopeCheck: boolean;
    executionResult: string;
    boundaryTriggered: boolean;
    executedAt: string;
}
