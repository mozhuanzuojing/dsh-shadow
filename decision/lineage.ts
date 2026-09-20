// dsh-shadow —— decision/lineage.ts：「引擎产出」→ **既有** AtomLineage（ADR-0096 §8）。
//
// §8 的纪律：**接线不重建** —— 血缘走既有 `AtomLineage` + `AtomEvidenceRef`（`core/lineage.ts`），
// **不新造血缘类型**，也不新建 DecisionStore / DB / Repository（ADR-0037 继续有效）。
//
// 本文件**绝不生成证据**。理由：`AtomEvidenceRef` 是**指针**抽象
// （`type ∈ file|conversation|document|commit|url` + `locator`），而引擎的 `rawOutput` 是**内联文本**。
// 把内联文本硬塞进某个 `type`，就是**编一个 locator** —— 那与 ADR-0037 的
// 「Reason = 原文明确存在的事实，绝不生成」是同一类禁令。故 locator 由**调用方**给真实位置
// （同 §5：候选与证据都来自**外部**）。
import type { AtomEvidenceRef, AtomLineage } from "../core/lineage.js";
import type { EngineDeclaration, EngineUnavailable } from "./types.js";

/** 投影的输入。三样都必须由**外部**给：声明、来源、时间、真实证据指针。 */
export interface ProducedLineageInput {
  readonly declaration: EngineDeclaration;
  /** 从哪产生，沿用既有口径 `session/<date>-<id>`。 */
  readonly source: string;
  /** `YYYY-MM-DD HH:MM:SS`（沿用既有口径）。 */
  readonly createdAt: string;
  /** 真实证据指针，**不得为空**。 */
  readonly evidence: readonly AtomEvidenceRef[];
}

/**
 * 判据：可追溯 = 有来源 + 有时间 + **证据非空**。
 *
 * 为什么在这里就判：`core/lineage-validator.ts:31` 会把**无 evidence 的 decision**
 * 挡在 context 之外（Atom 仍保留）。与其让它**静默**被拒，不如在这里**显式**说清缺什么
 * （ADR-0049「缺件不静默」；同族先例：resource 卡片无 evidence 也不进 context）。
 */
export const producedDecisionIsTraceable = (input: ProducedLineageInput): boolean =>
  typeof input?.source === "string" &&
  input.source.trim().length > 0 &&
  typeof input?.createdAt === "string" &&
  input.createdAt.trim().length > 0 &&
  Array.isArray(input?.evidence) &&
  input.evidence.length > 0;

/** 与 decision/guard.ts 的 `assertX` 同形：`{ok, reason?}`。 */
export const assertTraceable = (input: ProducedLineageInput) => {
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
export const producedToLineage = (input: ProducedLineageInput): AtomLineage | EngineUnavailable => {
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
