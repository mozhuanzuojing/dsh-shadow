const RULES = [
    { id: "r-latency", inputPattern: "latency", transformation: "latency increase -> timeout risk increase", confidence: 0.6, source: "heuristic" },
    { id: "r-dep", inputPattern: "removed", transformation: "remove dependency target -> possible unavailability of dependents", confidence: 0.5, source: "relation hypothesis" },
    { id: "r-capacity", inputPattern: "capacity", transformation: "capacity decrease -> possible degradation", confidence: 0.6, source: "heuristic" },
];
export const applyRule = (condition) => RULES.find((r) => condition.toLowerCase().includes(r.inputPattern.toLowerCase())) || RULES[0];
export const simulate = (scenario) => {
    const condition = scenario.changedConditions[0] || "Assume unknown change";
    const rule = applyRule(condition);
    const stateAfter = [
        `Given ${scenario.changedConditions.join(", ")}`,
        `representation suggests ${rule.transformation.split("->")[1]?.trim() || "possible impact"} (may occur)`,
    ];
    return {
        id: `sim-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        scenarioId: scenario.id,
        status: "hypothetical", // 只 hypothetical，禁 predicted/confirmed/expected
        derivedFrom: scenario.basedOnRepresentationIds, // lineage（必须保留）
        assumptions: scenario.assumptions,
        rules: [rule.id],
        stateAfter, // "suggests ... may occur"，非 "will cause"
        uncertainty: scenario.uncertainty,
    };
};
