import type { EvidenceResult } from "./types.js";
import type { ParsedMemory } from "./episode.js";
export interface ContextMapping {
    from: string;
    to: string;
    rule?: string;
}
export type ContextStatus = "validated" | "stale" | "unknown";
export interface ContextRef {
    subject: string;
    value: string;
    transformed?: string;
    rule?: string;
    source: string[];
    status: ContextStatus;
}
export declare const deriveContextReferences: (parsed: ParsedMemory[], verifyEvidence: (ref: {
    path: string;
    kind: "path" | "query" | "symbol";
}, ctx: any) => Promise<EvidenceResult>, fsCtx: any, mappings?: ContextMapping[]) => Promise<ContextRef[]>;
export declare const renderContextRefs: (refs: ContextRef[], topic?: string) => string;
