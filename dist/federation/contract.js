import { EXCHANGEABLE_KINDS } from "./types.js";
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
//
// **v1.15.33 收敛（T4）**：本行原为**再手写一遍**同一数组
//   `["ObservationClaim", "ValidationResult", "AlternativePerspective"].includes(kind)`
// 而 `federation/types.ts:13` 的 `EXCHANGEABLE_KINDS` 早就是这份清单的**唯一源**。
// 危险在于**类型系统只保证 `EXCHANGEABLE_KINDS` 覆盖 `ExchangeableKind`，管不到这个内联字面量**：
// 将来往联合类型里加第四个可交换种类并同步 `EXCHANGEABLE_KINDS` 时，这里会**静默漏掉它**
// （测试也只会测前三个）。与 ADR-0063/D5、以及同轮 `c.status=supported` 属同一族：
// 「唯一判据源存在，却各处重写」。故改为引用唯一源。
export const isExchangeable = (kind) => EXCHANGEABLE_KINDS.includes(kind);
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
