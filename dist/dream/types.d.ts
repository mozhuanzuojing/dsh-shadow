export type DreamTrigger = "scheduled" | "resource_idle" | "manual";
export type HypothesisStatus = "pending" | "observed" | "validated" | "rejected";
export type DreamResultStatus = "generated" | "no_pattern";
export interface SleepWindow {
    id: string;
    observerId: string;
    startTime: string;
    endTime: string;
    trigger: DreamTrigger;
    includedTimelineRange: {
        from: string;
        to: string;
    };
    excluded: {
        currentConversation: true;
        externalInput: true;
    };
}
export interface AlternativeExplanation {
    hypothesisId: string;
    alternatives: {
        description: string;
        supportingEvidence: string[];
    }[];
}
export interface Hypothesis {
    id: string;
    observerId: string;
    claimCandidate: string;
    supportingPatterns: string[];
    alternativeExplanation: AlternativeExplanation[];
    falsification: {
        whatWouldDisprove: string;
    };
    verification: {
        required: true;
        status: HypothesisStatus;
    };
    createdAt: string;
}
export interface DreamPattern {
    id: string;
    type: "recurrence" | "expectation_gap" | "cross_domain";
    observation: string;
    frequency: number;
    nodes: string[];
}
export interface DreamArtifact {
    id: string;
    observerId: string;
    sleepWindowId: string;
    sourceTemporalGraphVersion: string;
    sourceNodeIds: string[];
    sourceEdgeIds: string[];
    compressionMethod: string;
    patterns: DreamPattern[];
    generatedHypothesisIds: string[];
    createdAt: string;
}
export interface DreamResult {
    status: DreamResultStatus;
    patterns: DreamPattern[];
    hypotheses: Hypothesis[];
}
export declare const GRAPH_VERSION_HINT = "0.26";
