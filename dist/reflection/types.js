export const completenessOf = (t) => {
    const hasProjection = !!(t.projection && (t.projection.visible?.length || t.projection.hidden?.length));
    const hasDecision = !!t.decision?.action;
    const hasOutcome = !!t.outcome?.actual;
    return { hasProjection, hasDecision, hasOutcome, reflectionEligible: hasDecision && hasOutcome };
};
