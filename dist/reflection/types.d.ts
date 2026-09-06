import type { ObservationTrace } from "../core/types.js";
export type ReflectionStatus = "observed" | "candidate" | "confirmed";
export type ReflectionLearningType = "principle" | "anti_pattern" | "unknown";
export type ReflectionLearning = {
    statement: string;
    type: ReflectionLearningType;
    evidenceCount: number;
};
export type ReflectionDecisionOutcome = {
    decision: string;
    outcome: string;
    count: number;
    successRate: number;
};
export interface Reflection {
    id: string;
    observerId: string;
    sourceTraces: string[];
    period: {
        from: string;
        to: string;
    };
    observation: {
        repeatedDecisions: string[];
        repeatedOutcomes: string[];
        deviationPatterns: string[];
    };
    pattern: {
        decisionOutcomeCorrelation: ReflectionDecisionOutcome[];
    };
    learning: ReflectionLearning;
    confidence: {
        score: number;
        reasons: string[];
    };
    status: ReflectionStatus;
}
export interface TraceCompleteness {
    hasProjection: boolean;
    hasDecision: boolean;
    hasOutcome: boolean;
    reflectionEligible: boolean;
}
export declare const completenessOf: (t: Partial<ObservationTrace>) => TraceCompleteness;
