// dsh-shadow —— core/experience.ts：Experience 领域对象（从记忆文本派生）。从 index.ts 迁出。纯解析。
export const experienceOf = (text, mm) => {
    const body = String(text || "");
    const m = (re) => (body.match(re) || [])[1] || "";
    const clue = m(/^> 证据链：(.+)$/m);
    const evidence = (clue.match(/证据\(([^)]*)\)/) || [])[1] || "";
    return {
        situation: (body.match(/^# (.+)$/m) || [])[1] || "",
        problem: m(/^> 背景\/材料：(.+)$/m),
        decision: m(/^> 用户提示\/决策：(.+)$/m),
        implementation: evidence || m(/^> 背景\/材料：(.+)$/m),
        evidence,
        // Summary ≠ Lesson（ADR-0003 §3-1）：summary = 真正的「摘要」（LLM 一句话回顾）；
        // overview = 概况（动作/消息/决策计数）；lesson 由裁决层派生，不复用摘要。
        summary: m(/^> 摘要：(.+)$/m),
        overview: m(/^> 概况：(.+)$/m),
        session: m(/^> 来源会话：(.+)$/m),
        project: m(/^> 项目：(.+)$/m),
        goal: m(/^> 目标：(.+)$/m),
        date: mm?.date || "",
    };
};
export const renderExperience = (e) => {
    const lines = [`[Experience] ${e.situation}`];
    if (e.problem)
        lines.push(`问题 ${e.problem}`);
    if (e.decision)
        lines.push(`决策 ${e.decision}`);
    if (e.implementation)
        lines.push(`实现 ${e.implementation}`);
    if (e.evidence)
        lines.push(`证据 ${e.evidence}`);
    if (e.verdict)
        lines.push(`裁决 ${e.verdict}`);
    if (e.outcome)
        lines.push(`结果 ${e.outcome}`);
    if (e.overview)
        lines.push(`概况 ${e.overview}`);
    if (e.summary)
        lines.push(`摘要 ${e.summary}`);
    if (e.reflection)
        lines.push(`反思 ${e.reflection}`);
    if (e.lesson)
        lines.push(`教训 ${e.lesson}`);
    if (e.project)
        lines.push(`项目 ${e.project}`);
    if (e.goal)
        lines.push(`目标 ${e.goal}`);
    return lines.join("\n");
};
