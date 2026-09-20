/**
 * 判据：可追溯 = 有来源 + 有时间 + **证据非空**。
 *
 * 为什么在这里就判：`core/lineage-validator.ts:31` 会把**无 evidence 的 decision**
 * 挡在 context 之外（Atom 仍保留）。与其让它**静默**被拒，不如在这里**显式**说清缺什么
 * （ADR-0049「缺件不静默」；同族先例：resource 卡片无 evidence 也不进 context）。
 */
export const producedDecisionIsTraceable = (input) => typeof input?.source === "string" &&
    input.source.trim().length > 0 &&
    typeof input?.createdAt === "string" &&
    input.createdAt.trim().length > 0 &&
    Array.isArray(input?.evidence) &&
    input.evidence.length > 0;
/** 与 decision/guard.ts 的 `assertX` 同形：`{ok, reason?}`。 */
export const assertTraceable = (input) => {
    const ok = producedDecisionIsTraceable(input);
    return { ok, reason: ok ? undefined : "lineage 不可追溯：source / createdAt / evidence（非空）三者缺一不可" };
};
/**
 * 投影：**只搬运，不补写**。evidence 原样带上，`createdAt` / `source` 原样透传。
 *
 * ⚠ `createdBy` 只有 `user | agent | tool` 三个值（`core/lineage.ts:11`），**没有「引擎」这一档**。
 * T1 **不**为它加第四个值 —— 那会动既有 Atom 的落盘契约（受保护契约面 `memory-file-v1`，README 表 B）。
 * 引擎身份记在 `source` 与声明本体里；将来若确需一档，那是**另一个** ADR 的契约变更，不是本切片的顺带改动。
 *
 * 不可追溯时返回**显式** `unavailable`，而不是产出一个会被下游静默拒掉的坏 lineage。
 */
export const producedToLineage = (input) => {
    if (!producedDecisionIsTraceable(input)) {
        return { status: "unavailable", reason: "lineage_untraceable:source/createdAt/evidence 缺件" };
    }
    return {
        source: input.source,
        createdBy: "tool",
        evidence: [...input.evidence],
        createdAt: input.createdAt,
    };
};
