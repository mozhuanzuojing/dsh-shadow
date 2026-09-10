import type { EvidenceMatch, EvidenceProvider, GatewayEvidenceRef, EvidenceResult } from "../core/types.js";
export declare const runZg: (args: string[], ctx: any, timeoutMs?: number) => Promise<any>;
export declare const parseZgMatches: (stdout: string, ref: GatewayEvidenceRef) => EvidenceMatch[];
export declare const zgVerify: (ref: GatewayEvidenceRef, ctx: any) => Promise<EvidenceResult>;
export declare const zgEvidenceProvider: EvidenceProvider;
