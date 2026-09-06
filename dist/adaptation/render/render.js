export const renderContext = (ctx) => {
    const lines = ["[Adaptation Context]（调整依据）"];
    lines.push(`sourceExperience ${ctx.sourceExperience} · validationRefs ${ctx.validationRefs.join("、") || "—"}`);
    lines.push(`adaptationScope ${ctx.adaptationScope}（只改变 How I do，不改 Who I am）`);
    return lines.join("\n");
};
export const renderChange = (ch) => {
    const lines = ["[Adaptation Change]（行为策略变化，非身份/目标演化）"];
    lines.push(`target ${ch.target} · ${ch.before || "—"} → ${ch.after}`);
    lines.push(`basedOn ${ch.basedOn.join("、") || "—"} · sourceExperience ${ch.sourceExperience} · validationRequired ${ch.validationRequired}`);
    lines.push("（改变做法，不改变认知地位/权威；禁 goal/objective/value/identity/confidenceIncrease）");
    return lines.join("\n");
};
export const renderValidation = (v) => {
    const lines = ["[Adaptation Validation]（弱语义：变化发生了 + 现实反馈）"];
    lines.push(`changeObserved ${v.changeObserved} · validationReferences ${v.validationReferences.join("、") || "—"} · sideEffects ${v.sideEffectsObserved.join("、") || "—"}`);
    lines.push("（不是 change was correct；变化证明不了我是对的）");
    return lines.join("\n");
};
