// dsh-shadow —— world/guard/relation-guard.ts：RelationHypothesis 独立生命周期（恒 hypothesis，绝不 fact/reality）。
// 不挂在 RealityClaim 上（`RealityClaim{subject:A, predicate:depends_on}` 会绕过 v0.30.1 Relation≠Causality）。
import type { RelationHypothesis } from "../types.js";
import { newId } from "../../../core/util.js";

export const FORBIDDEN_RELATION_STATUS = new Set(["fact", "reality", "confirmed_causal", "truth"]);

export const relationHypothesisOf = (opts: { from: string; to: string; relation: string; evidence?: string[] }): RelationHypothesis => ({
  id: newId("rh"),   // A12：id 生成**收一处**到 `core/util.ts`
  from: opts.from,
  to: opts.to,
  relation: opts.relation,
  status: "hypothesis",      // 恒 hypothesis
  evidence: opts.evidence || [],
  uncertainty: 0.5,
});

export const isRelationHypothesis = (r: RelationHypothesis): boolean =>
  !FORBIDDEN_RELATION_STATUS.has(r?.status) && (r?.status === "hypothesis" || r?.status === "validated" || r?.status === "rejected");

export const renderRelation = (r: RelationHypothesis) =>
  `[Relation Hypothesis] ${r.from} ${r.relation} ${r.to} · status ${r.status}·(恒 hypothesis，绝不 fact/reality) · evidence ${r.evidence.join("、") || "—"}`;
