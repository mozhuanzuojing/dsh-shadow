export const renderRun = (run) => {
    const lines = ["[Verification Run]（只读只报，非评价）"];
    lines.push(`run ${run.runId} · runtime ${run.runtimeVersion} · invariants ${run.invariantRange} · observer ${run.observerRef}`);
    lines.push(`started ${run.startedAt} → ${run.completedAt}`);
    for (const c of run.checks)
        lines.push(`  ${c.boundary} #${c.invariantId} ${c.status.toUpperCase()} · evidence ${c.evidenceRefs.join("、") || "—"}`);
    lines.push("（Verification 只答有无违反边界；无 score/quality/health；不产生 RealityClaim）");
    return lines.join("\n");
};
export const renderReport = (report) => {
    const lines = ["[Drift Report]"];
    for (const b of report.observedBoundaries)
        lines.push(`  ${b.boundary} drift ${b.drift ? "⚠" : "none"} · evidence ${b.evidence.join("、") || "—"}`);
    lines.push("（DriftReport ≠ RealityClaim：只答有无漂移，非'系统值多少'）");
    return lines.join("\n");
};
