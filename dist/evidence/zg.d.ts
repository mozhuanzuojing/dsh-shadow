import type { EvidenceMatch, EvidenceProvider, EvidenceRef, EvidenceResult } from "../core/types.js";
export declare const runZg: (args: string[], ctx: any, timeoutMs?: number) => Promise<any>;
export declare const parseZgMatches: (stdout: string, ref: EvidenceRef) => EvidenceMatch[];
export declare const zgVerify: (ref: EvidenceRef, ctx: any) => Promise<EvidenceResult>;
export declare const zgEvidenceProvider: EvidenceProvider;
