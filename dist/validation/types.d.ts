import type { Hypothesis } from "../dream/types.js";
export interface FutureEvidence {
    id: string;
    hypothesisId: string;
    observedAt: string;
    sourceTraceIds: string[];
    observationType: string;
    actualOutcome: string;
    createdAt: string;
}
export interface ValidationConfidence {
    evidenceStrength: number;
    repetition: number;
    contradiction: number;
    alternativeSurvival: number;
}
export type ValidationOutcome = "validated" | "observed" | "rejected" | "expired";
export interface AlternativeEvaluation {
    alternative: string;
    supported: boolean;
    weakened: boolean;
}
export interface ValidationArtifact {
    id: string;
    hypothesisId: string;
    evaluatedAt: string;
    evidenceIds: string[];
    alternativeResults: AlternativeEvaluation[];
    confidence: ValidationConfidence;
    outcome: ValidationOutcome;
    context: {
        hypothesisProjectionSnapshot: Hypothesis | null;
        currentRealitySnapshot: {
            support: number;
            contradiction: number;
            applied: number;
        } | null;
        perceptionDelta: string;
    };
}
export interface ValidationResult {
    hypothesisId: string;
    outcome: ValidationOutcome;
    confidence: ValidationConfidence;
    alternativeEvaluation: AlternativeEvaluation[];
    applied: {
        support: number;
        contradiction: number;
    };
    conclusion: string;
}
export declare const MAX_EVIDENCE_N = 10;
