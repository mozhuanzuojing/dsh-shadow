/**
 * 「没传确信值」时的默认值 —— **唯一来源**（v1.15.61）。
 *
 * 此前同一个默认值写在两处（本文件 `?? 0.5` 与 `query/federation.ts:35` 的 `Number(x) || 0.5`），
 * 而两者对 **`0`** 给出**不同答案**：显式传 `0`（「零确信」）会被 `||` 静默改成 0.5。
 * 默认值只该在「**没传**」时生效 ⇒ 判定用 `undefined` 检查，不靠 falsy。
 */
export const CONFIDENCE_DEFAULT = 0.5;
/** 只认「没传 ⇒ 默认」；显式 `0` 原样保留；非法值归 0（**不伪装成 0.5**）。 */
export const confidenceOfInput = (v) => {
    if (v === undefined || v === null || v === "")
        return CONFIDENCE_DEFAULT;
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
export const perspectiveOf = (opts) => ({
    observerId: opts.observerId,
    temporalReference: opts.temporalReference || "",
    observationClaim: opts.observationClaim,
    projectionSnapshot: { lens: opts.lens, visible: opts.visible || [], hidden: opts.hidden || [], distortion: opts.distortion || [] },
    validationHistoryRef: opts.validationHistoryRef || [],
    confidence: { observationConfidence: opts.observationConfidence ?? CONFIDENCE_DEFAULT, validationConfidence: opts.validationConfidence ?? CONFIDENCE_DEFAULT }, // 拆开：看到确信 ≠ 解释确信
    boundary: { identityExcluded: true, memoryExcluded: true, dreamExcluded: true },
});
export const renderPerspective = (p) => {
    const lines = ["[Federated Perspective]"];
    lines.push(`observer ${p.observerId} · temporal ${p.temporalReference || "…"} · claim ${p.observationClaim}`);
    lines.push(`projection lens=${p.projectionSnapshot.lens || "default"} visible=${p.projectionSnapshot.visible.join("、") || "—"} hidden=${p.projectionSnapshot.hidden.join("、") || "—"}`);
    lines.push(`confidence observation=${p.confidence.observationConfidence.toFixed(2)} validation=${p.confidence.validationConfidence.toFixed(2)} (拆分) · validationRef ${p.validationHistoryRef.length}`);
    lines.push(`boundary identityExcluded=${p.boundary.identityExcluded} memoryExcluded=${p.boundary.memoryExcluded} dreamExcluded=${p.boundary.dreamExcluded}`);
    return lines.join("\n");
};
export const perspectiveIsClean = (p) => {
    const reasons = [];
    if (!p.boundary.identityExcluded)
        reasons.push("Identity 泄漏");
    if (!p.boundary.memoryExcluded)
        reasons.push("Memory 泄漏");
    if (!p.boundary.dreamExcluded)
        reasons.push("Dream 泄漏");
    if (p.confidence.validationConfidence > p.confidence.observationConfidence + 0.3)
        reasons.push("validationConfidence 不应超观察确信（携带推理结论）");
    return { ok: reasons.length === 0, reasons };
};
