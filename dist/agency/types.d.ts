export interface AgencyContext {
    id: string;
    objectiveRef: string;
    authoritySource: "external";
    authorityScope: string;
    constraints: string[];
    createdAt: string;
}
export interface AgencySelection {
    selectedCandidateId: string;
    reason: string;
}
export interface AgencyBoundaryEvent {
    actionCandidate: string;
    authorityRef: string;
    objectiveRef: string;
    constraintCheck: string[];
    executionResult: string;
}
