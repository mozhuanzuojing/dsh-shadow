export const explain = (graph, subject, observations, claims) => {
    if (!graph || !graph.objects.length)
        return "（无 RepresentationObject：仅 supported RealityClaim 可进 Representation）";
    const matched = graph.objects.find((o) => o.basedOnClaims.some((cid) => { const c = claims.find((x) => x.id === cid); return c && (c.subjectRef === subject || c.subject === subject); }));
    // **回退必须出声**（v1.15.61）：`|| graph.objects[0]` 会在 subject 不匹配时静默换成一个**无关**的表示，
    // 而 `explain` 的整个用途就是回答「为什么系统认为**这个世界结构**存在」—— 换了对象再说理由就是答非所问。
    const obj = matched || graph.objects[0];
    const lines = ["[World Representation]"];
    if (!matched && subject)
        lines.push(`（subject「${subject}」**未匹配任何表示** ⇒ 下面回退到 objects[0]，**不是**该 subject 的解释）`);
    lines.push(`representation ${obj.id} · basedOnClaims ${obj.basedOnClaims.join("、")} · uncertainty ${obj.uncertainty.toFixed(2)}`);
    lines.push("explain:");
    for (const o of observations)
        lines.push(`  RealityObservation: ${o.observation} (perspectives: ${o.sourcePerspectives.join("、") || "—"})`);
    // 标签要说准（v1.15.61）：这里数的其实是**支撑该表示的 claim 条数**，不是验证记录。
    // 保留 `Validation History:` 这个前缀是为了不破坏既有断言（`test/recall-attribution.test.ts:3230` 钉的就是它），
    // 但**必须带上纠正从句** —— 否则「没验证也显示验证历史」（配合 `claimOf` 的 validations 由参数决定，见 BACKLOG §7.2）。
    lines.push(`  Validation History: ${obj.basedOnClaims.length} supported claim(s)（**标签注意**：此处数是支撑该表示的 claim 条数；**验证记录**在 \`.shadow/validation/*.timeline.json\`，本函数不读它）`);
    lines.push("（不是『系统知道 X 存在』，而是『因为这些观察/验证/时间上下文支持这个表示』）");
    return lines.join("\n");
};
