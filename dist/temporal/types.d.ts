import type { Intent, ObserverState } from "../core/types.js";
export type TemporalRelation = "followed_by" | "learned_from" | "evolved_into" | "contradicted_by" | "possible_causal_link";
export interface TemporalStateSnapshot {
    identityVersion: string;
    observerState?: ObserverState;
    intent: Intent;
}
export interface TemporalPerceptionSnapshot {
    lens?: string;
    visible: string[];
    hidden: string[];
    distortion: string[];
}
export interface TemporalNode {
    id: string;
    observerId: string;
    timestamp: string;
    stateSnapshot: TemporalStateSnapshot;
    perceptionSnapshot: TemporalPerceptionSnapshot;
    evidenceLinks: string[];
    sourceTraceIds: string[];
    observerContextHash?: string;
}
export interface TemporalEdge {
    from: string;
    to: string;
    relation: TemporalRelation;
    confidence: number;
    derivation: {
        rule: string;
        sourceIds: string[];
    };
}
export interface TemporalGraph {
    graphVersion: string;
    generatedAt: string;
    sourceRange: {
        from: string;
        to: string;
    };
    sourceTraceIds: string[];
    nodes: TemporalNode[];
    edges: TemporalEdge[];
}
export type TemporalQuery = {
    type: "replay";
    at: string;
} | {
    type: "compare";
    from: string;
    to: string;
};
export declare const GRAPH_VERSION = "0.26";
