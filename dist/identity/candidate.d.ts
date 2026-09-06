import type { Reflection } from "../reflection/types.js";
import { type CandidateIdentityChange, type IdentityConfidence } from "./types.js";
export declare const identityConfidenceOf: (opts: {
    traceCount: number;
    successRate: number;
    contradiction: number;
    recency: number;
}) => IdentityConfidence;
export declare const candidateOf: (r: Reflection, fromVersion: string) => CandidateIdentityChange | null;
export declare const renderCandidate: (c: CandidateIdentityChange) => string;
