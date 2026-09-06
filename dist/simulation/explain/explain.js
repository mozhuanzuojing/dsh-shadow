export const renderOutcome = (o) => {
    const lines = ["[Simulation Outcome]"];
    lines.push(`status ${o.status}（hypothetical，禁 predicted/confirmed/expected） · uncertainty ${o.uncertainty.toFixed(2)}`);
    for (const s of o.stateAfter)
        lines.push(`  ${s}`);
    lines.push(`derivedFrom ${o.derivedFrom.join("、") || "—"} · assumptions ${o.assumptions.join("、") || "—"} · rules ${o.rules.join("、")}`);
    return lines.join("\n");
};
