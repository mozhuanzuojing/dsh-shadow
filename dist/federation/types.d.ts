import type { ValidationOutcome } from "../validation/types.js";
export interface FederatedObservationPacket {
    sourceObserverId: string;
    observationClaim: string;
    projectionSnapshot: {
        lens?: string;
        visible: string[];
        hidden: string[];
        distortion: string[];
    };
    validationReference: {
        hypothesisId?: string;
        validationId?: string;
        outcome?: ValidationOutcome;
    };
    boundary: {
        identityExcluded: true;
        memoryExcluded: true;
        dreamExcluded: true;
    };
}
export type ExchangeableKind = "ObservationClaim" | "ValidationResult" | "AlternativePerspective";
export declare const EXCHANGEABLE_KINDS: ExchangeableKind[];
export interface FederatedPerspectiveConfidence {
    observationConfidence: number;
    validationConfidence: number;
}
export interface FederatedPerspective {
    observerId: string;
    temporalReference: string;
    observationClaim: string;
    projectionSnapshot: {
        lens?: string;
        visible: string[];
        hidden: string[];
        distortion: string[];
    };
    validationHistoryRef: string[];
    confidence: FederatedPerspectiveConfidence;
    boundary: {
        identityExcluded: true;
        memoryExcluded: true;
        dreamExcluded: true;
    };
}
export interface RealityEvidence {
    id: string;
    observedAt: string;
    source: string;
    observation: string;
    linkedHypothesis: string[];
    referencedBy: string[];
    status: string;
}
export type PerspectiveState = "isolated" | "corroborated" | "validated";
export interface ObserverDifference {
    realEvidenceRef: string;
    observerA: string;
    observerB: string;
    projectionDelta: {
        visibleDifference: string[];
        hiddenDifference: string[];
        lensDifference: string[];
    };
    possibleBlindSpot: string[];
    unresolvedQuestion: string[];
}
