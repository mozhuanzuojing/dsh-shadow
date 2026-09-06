// dsh-shadow —— evidence/gateway.ts：Evidence Gateway（Provider 注册 + verifyEvidence 路由）。从 index.ts 迁出。
// Shadow 只问 verifyEvidence(EvidenceRef)，不碰底层 fs/zg/git/...；provider 可选 fs/zg/额外注入。
import type { EvidenceProvider, EvidenceRef, EvidenceResult } from "../core/types.js";
import { fsEvidenceProvider } from "./filesystem.js";
import { zgEvidenceProvider } from "./zg.js";

export const builtinEvidenceProviders: Record<string, EvidenceProvider> = { fs: fsEvidenceProvider, zg: zgEvidenceProvider };

export const routeVerify = (ref: EvidenceRef, ctx: any, providerName: string, extraProviders: Record<string, EvidenceProvider> = {}): Promise<EvidenceResult> => {
  const p = extraProviders[providerName] || builtinEvidenceProviders[providerName] || builtinEvidenceProviders.fs;
  return p.verify(ref, ctx);
};
