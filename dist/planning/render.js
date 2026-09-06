export const renderContext = (ctx) => {
    const lines = ["[Planning Context]"];
    lines.push(`objective(source:${ctx.objective.source}) ${ctx.objective.description} · constraints ${ctx.objective.constraints.join("、") || "—"}`);
    lines.push(`simulationReferences ${ctx.simulationReferences.join("、") || "—"}`);
    return lines.join("\n");
};
export const renderEvaluation = (ev) => {
    const lines = ["[Planning Evaluation]（comparison）"];
    lines.push(`candidates ${ev.candidates.map((c) => c.actionSequence.join("→") || c.id).join(" | ")}`);
    for (const t of ev.tradeoffs.slice(0, 4))
        lines.push(`  tradeoff: if ${t.condition} → ${t.consequence} (uncertainty ${t.uncertainty.toFixed(2)})`);
    for (const q of ev.unresolvedQuestions.slice(0, 3))
        lines.push(`  unresolved: ${q}`);
    lines.push("（是 comparison：只比较可能行动路径，不作系统价值判断）");
    return lines.join("\n");
};
