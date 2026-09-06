export const renderContext = (ctx) => {
    const lines = ["[Interaction Context]（当前长期交互基于什么历史）"];
    lines.push(`basedOnHistory ${ctx.basedOnHistory.join("、") || "—"} · window ${ctx.window.from}→${ctx.window.to}`);
    lines.push(`recallRefs ${ctx.recallRefs.join("、") || "—"} · adaptationRefs ${ctx.adaptationRefs.join("、") || "—"}`);
    lines.push("（答 what happened before，非 who I became；禁 history_count/experience_count 影响 identity）");
    return lines.join("\n");
};
export const renderSummary = (s) => {
    const lines = ["[History Summary]（访问辅助，非事实源）"];
    lines.push(`sourceRefs ${s.sourceRefs.join("、") || "—"} · compressionMethod ${s.compressionMethod} · accessibility ${s.accessibility}`);
    lines.push("（摘要是访问辅助，不是新的事实源；无 reality 字段）");
    return lines.join("\n");
};
export const renderEvent = (e) => {
    const lines = ["[History Continuity Event]（previous state / current accessibility / lineage）"];
    lines.push(`accessibility ${e.previousAccessibility} → ${e.currentAccessibility} · historyRef ${e.lineage.historyRef} recall ${e.lineage.recallRef || "—"} adapt ${e.lineage.adaptationRef || "—"}`);
    lines.push("（continuity 可追溯；非 self-evolution event）");
    return lines.join("\n");
};
export const renderLink = (l) => {
    const lines = ["[Interaction Adaptation Link]（History→Recall→Adaptation）"];
    lines.push(`history ${l.historyRef} → recall ${l.recallRef} → adaptation ${l.adaptationRef}`);
    lines.push("（禁 History→Identity；只连行为策略，不连身份/目标/权威）");
    return lines.join("\n");
};
