const nearestNodeAt = (graph, at) => {
    const t = String(at || "").slice(0, 10);
    const sorted = [...graph.nodes].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    let best = null;
    for (const n of sorted)
        if (String(n.timestamp).slice(0, 10) <= t)
            best = n;
    return best;
};
export const queryTemporal = (graph, q) => {
    if (q.type === "replay") {
        const n = nearestNodeAt(graph, q.at);
        if (!n)
            return { type: "replay", found: false };
        return {
            type: "replay", found: true, at: q.at,
            observer: n.stateSnapshot.identityVersion,
            intent: n.stateSnapshot.intent,
            visible: n.perceptionSnapshot.visible,
            hidden: n.perceptionSnapshot.hidden,
            distortion: n.perceptionSnapshot.distortion,
            evidence: n.evidenceLinks,
        };
    }
    // compare
    const a = nearestNodeAt(graph, q.from);
    const b = nearestNodeAt(graph, q.to);
    if (!a || !b)
        return { type: "compare", found: false };
    return {
        type: "compare", found: true, from: q.from, to: q.to,
        identityChange: `${a.stateSnapshot.identityVersion} → ${b.stateSnapshot.identityVersion}`,
        projectionChange: { visibleA: a.perceptionSnapshot.visible, visibleB: b.perceptionSnapshot.visible, distortionA: a.perceptionSnapshot.distortion, distortionB: b.perceptionSnapshot.distortion },
    };
};
export const renderTemporalGraph = (g) => {
    const lines = ["[Temporal Graph]"];
    lines.push(`graphVersion ${g.graphVersion} · generatedAt ${g.generatedAt} · nodes ${g.nodes.length} · edges ${g.edges.length}`);
    lines.push(`sourceRange ${g.sourceRange.from || "…"} → ${g.sourceRange.to || "…"} · sourceTraces ${g.sourceTraceIds.length}`);
    for (const n of g.nodes.slice(0, 8))
        lines.push(`  node ${n.id} · ${String(n.timestamp).slice(0, 10)} · ${n.stateSnapshot.identityVersion} · visible=${n.perceptionSnapshot.visible.join("、") || "—"} · hidden=${n.perceptionSnapshot.hidden.join("、") || "—"}`);
    for (const e of g.edges.slice(0, 8))
        lines.push(`  edge ${e.from} ${e.relation} ${e.to} (${e.derivation.rule})`);
    return lines.join("\n");
};
export const renderReplay = (r) => {
    const lines = ["[Replay]"];
    if (!r.found) {
        lines.push(`（无 ${r.at} 附近的观察）`);
        return lines.join("\n");
    }
    lines.push(`who ${r.observer} · intent ${r.intent.goal || "—"}`);
    lines.push(`visible ${r.visible.join("、") || "—"}`);
    lines.push(`hidden ${r.hidden.join("、") || "—"}`);
    lines.push(`distortion ${r.distortion.join(" · ") || "—"}`);
    lines.push(`evidence ${r.evidence.join("、") || "—"}`);
    return lines.join("\n");
};
export const renderCompare = (r) => {
    const lines = ["[Compare]"];
    if (!r.found) {
        lines.push(`（无 ${r.from}/${r.to} 附近的观察）`);
        return lines.join("\n");
    }
    lines.push(`identity ${r.identityChange}`);
    lines.push(`visible ${r.projectionChange.visibleA.join("、") || "—"} → ${r.projectionChange.visibleB.join("、") || "—"}`);
    lines.push(`distortion ${r.projectionChange.distortionA.join(" · ") || "—"} → ${r.projectionChange.distortionB.join(" · ") || "—"}`);
    return lines.join("\n");
};
