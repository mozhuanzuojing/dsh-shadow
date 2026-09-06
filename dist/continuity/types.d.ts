export interface ObserverConfig {
    interactionStyle: string;
    outputPreference: string;
    defaultProtocol: string;
}
export interface ObserverBoundary {
    planningCannotCreateObjective: boolean;
    recallCannotCreateKnowledge: boolean;
    adaptationCannotIncreaseAuthority: boolean;
    delegationCannotExpandAuthority: boolean;
    agencyCannotCreatePurpose: boolean;
}
export interface RecallIndexEntry {
    id: string;
    location: string;
}
export interface RecallIndex {
    workspace: string;
    records: RecallIndexEntry[];
}
export interface ContinuityRecord {
    observerId: string;
    continuityRef: string;
    createdAt: string;
}
export interface WorkspaceRecord {
    workspace: string;
    kind: string;
    content: string;
    createdAt: string;
}
