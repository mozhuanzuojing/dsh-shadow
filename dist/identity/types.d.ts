import type { ReflectionLearningType } from "../reflection/types.js";
export interface IdentityCore {
    observerId: string;
    values: string[];
}
export interface IdentityLearned {
    text: string;
    confidence: number;
    source: string;
}
export interface IdentityCurrentModel {
    decisionStyle: string[];
    antiPatterns: string[];
}
export interface IdentityModel {
    version: string;
    at: string;
    core: IdentityCore;
    learned: IdentityLearned[];
    currentModel: IdentityCurrentModel;
}
export type IdentityChangeType = "add_principle" | "remove_principle" | "change_decision_style" | "add_boundary";
export interface CandidateProposal {
    type: IdentityChangeType;
    content: string;
}
export interface IdentityConfidence {
    frequency: number;
    recency: number;
    consistency: number;
    contradiction: number;
    overall: number;
}
export type CandidateIdentityStatus = "candidate" | "accepted" | "rejected";
export interface CandidateIdentityChange {
    id: string;
    observerId: string;
    fromVersion: string;
    proposal: CandidateProposal;
    evidence: {
        reflections: string[];
        traceCount: number;
    };
    confidence: IdentityConfidence;
    status: CandidateIdentityStatus;
    createdAt: string;
}
export type EvaluatorStatus = "accepted" | "candidate" | "rejected";
export interface IdentityChangeDecision {
    status: EvaluatorStatus;
    reasons: string[];
    chosen: CandidateIdentityChange | null;
}
export declare const proposalTypeOfLearning: (type: ReflectionLearningType) => IdentityChangeType | null;
