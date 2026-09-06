export const FORBIDDEN_RELATION_STATUS = new Set(["fact", "reality", "confirmed_causal", "truth"]);
export const relationHypothesisOf = (opts) => ({
    id: `rh-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    from: opts.from,
    to: opts.to,
    relation: opts.relation,
    status: "hypothesis", // 恒 hypothesis
    evidence: opts.evidence || [],
    uncertainty: 0.5,
});
export const isRelationHypothesis = (r) => !FORBIDDEN_RELATION_STATUS.has(r?.status) && (r?.status === "hypothesis" || r?.status === "validated" || r?.status === "rejected");
export const renderRelation = (r) => `[Relation Hypothesis] ${r.from} ${r.relation} ${r.to} · status ${r.status}·(恒 hypothesis，绝不 fact/reality) · evidence ${r.evidence.join("、") || "—"}`;
