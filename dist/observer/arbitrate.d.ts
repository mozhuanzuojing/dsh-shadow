import type { GatewayEvidenceRef, EvidenceResult } from "../core/types.js";
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
    confidence: import("../retrieval/rank.js").ConfidenceDims;
};
export declare const provenanceText: (ev: any) => string;
export declare const newestByEntryOf: (list: any[]) => Record<string, string>;
export declare const verdictOf: (conflictCount: number, entry: string, date: string, time: string, newest: Record<string, string>) => {
    superseded: boolean;
    verdict: string;
    outcome: string;
    reflection: string;
};
export declare const lessonOf: (v: {
    superseded: boolean;
    outcome: string;
}) => "同入口已被更新，引用前先查最新记忆" | "结论仍有效" | "证据路径缺失，需重新验证后再引用";
export declare const lineageOf: (list: {
    date: string;
    time: string;
    decision?: string;
}[]) => {
    date: string;
    time: string;
    decision: string;
}[];
export declare const conflictOf: (fs: any, ws: string, text: string, verifyEvidence: (ref: GatewayEvidenceRef, ctx: any) => Promise<EvidenceResult>) => Promise<{
    missing: string[];
}>;
