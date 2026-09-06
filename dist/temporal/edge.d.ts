import type { TemporalEdge, TemporalNode } from "./types.js";
import type { ObservationTrace } from "../core/types.js";
export declare const buildEdges: (nodes: TemporalNode[], traces: Partial<ObservationTrace>[]) => TemporalEdge[];
export declare const relationForProposal: (_n: any) => TemporalEdge["relation"];
