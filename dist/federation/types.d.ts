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
