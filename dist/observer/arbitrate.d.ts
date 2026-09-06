import type { EvidenceRef, EvidenceResult } from "../core/types.js";
export declare const evidenceOf: (text: string, mm: any, meta: any, stale: boolean) => {
    kinds: string;
    date: any;
    session: string;
    project: string;
    goal: string;
    evidence: string;
    status: any;
    stale: boolean;
    hits: number;
    confidence: number;
};
export declare const provenanceText: (ev: any) => string;
export declare const newestByEntryOf: (list: any[]) => Record<string, string>;
export declare const verdictOf: (conflictCount: number, entry: string, date: string, time: string, newest: Record<string, string>) => {
    superseded: boolean;
    verdict: string;
    outcome: string;
    reflection: string;
};
export declare const conflictOf: (fs: any, ws: string, text: string, verifyEvidence: (ref: EvidenceRef, ctx: any) => Promise<EvidenceResult>) => Promise<{
    missing: string[];
}>;
