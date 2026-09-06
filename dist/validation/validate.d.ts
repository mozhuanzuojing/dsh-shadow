import type { FutureEvidence, ValidationArtifact, ValidationResult } from "./types.js";
import type { Hypothesis } from "../dream/types.js";
export declare const validateHypothesis: (h: Hypothesis, evidences: FutureEvidence[]) => ValidationResult;
export declare const expiredByAge: (h: Hypothesis) => boolean;
export declare const toArtifact: (h: Hypothesis, result: ValidationResult, evidenceIds: string[], evaluatedAt: string) => ValidationArtifact;
export declare const renderValidation: (result: ValidationResult) => string;
