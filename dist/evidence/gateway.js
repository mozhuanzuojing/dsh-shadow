import { fsEvidenceProvider } from "./filesystem.js";
import { zgEvidenceProvider } from "./zg.js";
export const builtinEvidenceProviders = { fs: fsEvidenceProvider, zg: zgEvidenceProvider };
export const routeVerify = (ref, ctx, providerName, extraProviders = {}) => {
    const p = extraProviders[providerName] || builtinEvidenceProviders[providerName] || builtinEvidenceProviders.fs;
    return p.verify(ref, ctx);
};
