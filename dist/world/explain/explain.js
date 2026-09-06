export const explain = (graph, subject, observations, claims) => {
    if (!graph || !graph.objects.length)
        return "（无 RepresentationObject：仅 supported RealityClaim 可进 Representation）";
    const obj = graph.objects.find((o) => o.basedOnClaims.some((cid) => { const c = claims.find((x) => x.id === cid); return c && (c.subjectRef === subject || c.subject === subject); })) || graph.objects[0];
    const lines = ["[World Representation]"];
    lines.push(`representation ${obj.id} · basedOnClaims ${obj.basedOnClaims.join("、")} · uncertainty ${obj.uncertainty.toFixed(2)}`);
    lines.push("explain:");
    for (const o of observations)
        lines.push(`  RealityObservation: ${o.observation} (perspectives: ${o.sourcePerspectives.join("、") || "—"})`);
    lines.push(`  Validation History: ${obj.basedOnClaims.length} supported claim(s)`);
    lines.push("（不是『系统知道 X 存在』，而是『因为这些观察/验证/时间上下文支持这个表示』）");
    return lines.join("\n");
};
