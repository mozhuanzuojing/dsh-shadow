const MODE_GOAL = {
    judgment: "形成判断",
    project: "投影当前任务",
    experience: "回顾经历",
    observer: "观测窗口",
    verifyEvidence: "验证证据",
    identity: "确认主体",
    context: "观察上下文",
};
/** 布尔旗标优先级（ADR-0050：verify→verifyEvidence；废止 args.recall，默认目标仍为主题召回文案）。 */
const MODE_ORDER = ["identity", "context", "observer", "project", "experience", "judgment", "verifyEvidence"];
const DEFAULT_GOAL = "召回相关记忆";
export const intentOf = (args, topic) => {
    const explicit = args?.intent;
    const question = String(explicit?.question || explicit?.query || args?.topic || topic || "").trim();
    const goal = String(explicit?.goal || args?.goal || "").trim();
    const activeMode = MODE_ORDER.find((m) => args?.[m]);
    const modeGoal = activeMode ? MODE_GOAL[activeMode] : DEFAULT_GOAL;
    const desiredOutcome = explicit?.desiredOutcome ? String(explicit.desiredOutcome) : (goal ? `推进 ${goal}` : undefined);
    const constraints = Array.isArray(explicit?.constraints)
        ? explicit.constraints.map(String)
        : Array.isArray(args?.constraints) ? args.constraints.map(String) : [];
    return {
        goal: goal || modeGoal,
        question,
        desiredOutcome: desiredOutcome || undefined,
        constraints: constraints.length ? constraints : undefined,
    };
};
export const renderIntent = (i) => {
    const lines = ["[Intent]"];
    lines.push(`goal ${i.goal}`);
    if (i.question)
        lines.push(`question ${i.question}`);
    if (i.desiredOutcome)
        lines.push(`desired_outcome ${i.desiredOutcome}`);
    if (i.constraints?.length)
        lines.push(`constraints ${i.constraints.join("、")}`);
    return lines.join("\n");
};
