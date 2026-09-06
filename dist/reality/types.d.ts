export interface RealityObservation {
    id: string;
    observedAt: string;
    subjectRef?: string;
    sourcePerspectives: string[];
    observation: string;
    temporalContext: string;
    validationRefs: string[];
}
export type RealityClaimStatus = "candidate" | "supported" | "unstable" | "rejected";
export interface RealityConfidence {
    evidenceStrength: number;
    repetition: number;
    temporalConsistency: number;
    alternativeSurvival: number;
}
export interface RealityClaim {
    id: string;
    subjectRef?: string;
    subject: string;
    predicate: string;
    object: string;
    supportingObservations: string[];
    validationHistory: string[];
    perspectiveRefs: string[];
    temporalContext: string;
    confidence: RealityConfidence;
    status: RealityClaimStatus;
    lineage: {
        observations: string[];
        validations: string[];
        perspectives: string[];
    };
}
export interface ObservedEntityCandidate {
    entity: string;
    observation: {
        exposedApi?: boolean;
        version?: string;
        changedVersions?: string[];
    };
}
export declare const parseTriple: (text: string) => {
    subject: string;
    predicate: string;
    object: string;
};
