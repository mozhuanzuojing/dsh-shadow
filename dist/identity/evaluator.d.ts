import type { CandidateIdentityChange, IdentityChangeDecision, IdentityModel } from "./types.js";
export interface EvalGates {
    minCount?: number;
    minRecency?: number;
    maxContradiction?: number;
    halfLifeDays?: number;
    lastSeen?: string;
}
export declare const evaluateCandidate: (c: CandidateIdentityChange, gates: EvalGates) => IdentityChangeDecision;
export declare const advanceIdentity: (fs: any, ws: string, current: IdentityModel, gates?: EvalGates) => Promise<{
    model: IdentityModel;
    decisions: IdentityChangeDecision[];
    applied: CandidateIdentityChange[];
}>;
export declare const renderEvaluator: (decisions: IdentityChangeDecision[], model: IdentityModel) => string;
