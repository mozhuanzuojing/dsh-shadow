export const packetOf = (opts) => ({
    sourceObserverId: opts.sourceObserverId,
    observationClaim: opts.observationClaim,
    projectionSnapshot: { lens: opts.lens, visible: opts.visible || [], hidden: opts.hidden || [], distortion: opts.distortion || [] },
    validationReference: { hypothesisId: opts.hypothesisId, validationId: opts.validationId, outcome: opts.outcome },
    boundary: { identityExcluded: true, memoryExcluded: true, dreamExcluded: true },
});
export const renderPacket = (p) => {
    const lines = ["[Federation Packet]"];
    lines.push(`sourceObserver ${p.sourceObserverId}`);
    lines.push(`observationClaim ${p.observationClaim}`);
    lines.push(`projection lens=${p.projectionSnapshot.lens || "default"} visible=${p.projectionSnapshot.visible.join("、") || "—"} hidden=${p.projectionSnapshot.hidden.join("、") || "—"}`);
    if (p.validationReference.hypothesisId || p.validationReference.outcome)
        lines.push(`validationRef ${p.validationReference.hypothesisId || ""} · ${p.validationReference.outcome || ""}`);
    lines.push(`boundary identityExcluded=${p.boundary.identityExcluded} memoryExcluded=${p.boundary.memoryExcluded} dreamExcluded=${p.boundary.dreamExcluded}`);
    return lines.join("\n");
};
// 认知边界 Enforcement：只允许交换三种类型；Identity/Memory/Dream 不可交换。
export const isExchangeable = (kind) => ["ObservationClaim", "ValidationResult", "AlternativePerspective"].includes(kind);
export const assertPacketBarrier = (p) => {
    const reasons = [];
    if (!p.boundary.identityExcluded)
        reasons.push("Identity 泄漏");
    if (!p.boundary.memoryExcluded)
        reasons.push("Memory 泄漏");
    if (!p.boundary.dreamExcluded)
        reasons.push("Dream 泄漏");
    return { ok: reasons.length === 0, reasons };
};
