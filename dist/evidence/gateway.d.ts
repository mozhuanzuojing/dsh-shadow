import type { EvidenceProvider, EvidenceRef, EvidenceResult } from "../core/types.js";
export declare const builtinEvidenceProviders: Record<string, EvidenceProvider>;
export declare const routeVerify: (ref: EvidenceRef, ctx: any, providerName: string, extraProviders?: Record<string, EvidenceProvider>) => Promise<EvidenceResult>;
