import { fsEvidenceProvider } from "./filesystem.js";
import { zgEvidenceProvider } from "./zg.js";
export const builtinEvidenceProviders = { fs: fsEvidenceProvider, zg: zgEvidenceProvider };
export const routeVerify = (ref, ctx, providerName, extraProviders = {}) => {
    const name = String(providerName || "fs");
    const p = extraProviders[name] || builtinEvidenceProviders[name];
    // 缺件不静默（ADR-0049）：provider 名不存在（拼错/未注册）时**明确 unavailable**，
    // 绝不静默退回 fs——那会把「查不到这个 provider」说成「证据已核实」。
    if (!p) {
        const missing = { status: "unavailable", source: name, matches: [], confidence: 0, freshness: "stale", provenance: { provider: name, at: new Date().toISOString(), reason: "provider_unknown" } };
        return Promise.resolve(missing);
    }
    return p.verify(ref, ctx);
};
