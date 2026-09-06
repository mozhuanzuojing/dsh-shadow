export const isAdmissibleClaim = (c) => c?.status === "supported";
export const createRepresentationFromClaims = (claims) => {
    if (!claims.length)
        return { ok: false, reasons: ["无 RealityClaim"] };
    const inadmissible = claims.filter((c) => !isAdmissibleClaim(c));
    if (inadmissible.length)
        return { ok: false, reasons: inadmissible.map((c) => `${c.id} 状态=${c.status}（仅 supported 可进 Representation）`) };
    const avgAlt = claims.reduce((s, c) => s + (c.confidence?.alternativeSurvival ?? 0), 0) / claims.length;
    const object = {
        id: `rep-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        basedOnClaims: claims.map((c) => c.id),
        temporalScope: claims[0].temporalContext || "",
        uncertainty: Math.round((1 - Math.min(0.95, avgAlt)) * 100) / 100,
        status: "represented",
    };
    return { ok: true, reasons: [], object };
};
export const renderAdmission = (r) => {
    if (r.ok && r.object) {
        return ["[Representation]"].concat([
            `object ${r.object.id} · status ${r.object.status} · uncertainty ${r.object.uncertainty.toFixed(2)}`,
            `basedOnClaims ${r.object.basedOnClaims.join("、")}（仅 supported）`,
            `temporalScope ${r.object.temporalScope}`,
        ]).join("\n");
    }
    return `[Representation Rejected] reason: ${r.reasons.join("；")}`;
};
