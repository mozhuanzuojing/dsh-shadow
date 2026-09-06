import type { EvidenceResult, Identity, Judgment } from "../core/types.js";
export declare const claimOf: (text: string) => string;
export declare const judgmentOfClaim: (fs: any, ws: string, mm: any, observer: {
    observerId: string;
    lens?: string;
    identity?: Identity | null;
}, verifyEvidence: (ref: any, ctx: any) => Promise<EvidenceResult>) => Promise<Judgment | null>;
export declare const renderJudgments: (js: Judgment[]) => string;
