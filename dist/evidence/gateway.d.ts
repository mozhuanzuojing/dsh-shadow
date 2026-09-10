import type { EvidenceProvider, GatewayEvidenceRef, EvidenceResult } from "../core/types.js";
export declare const builtinEvidenceProviders: Record<string, EvidenceProvider>;
export declare const routeVerify: (ref: GatewayEvidenceRef, ctx: any, providerName: string, extraProviders?: Record<string, EvidenceProvider>) => Promise<EvidenceResult>;
