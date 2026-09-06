import { today } from "../core/util.js";
export const observationOf = (opts) => ({
    id: `ro-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    observedAt: opts.observedAt || today(),
    subjectRef: opts.subjectRef,
    sourcePerspectives: opts.sourcePerspectives,
    observation: opts.observation, // 弱事实，无 truth/certainty/fact
    temporalContext: opts.temporalContext || opts.observedAt || today(),
    validationRefs: opts.validationRefs || [],
});
export const renderObservation = (ro) => {
    const lines = ["[Reality Observation]"];
    lines.push(`id ${ro.id} · ${ro.observedAt} · subject ${ro.subjectRef || "—"}`);
    lines.push(`observation ${ro.observation}（弱事实：多个 Observer 指向同一被观察事件，非世界事实）`);
    lines.push(`sourcePerspectives ${ro.sourcePerspectives.join("、") || "—"} · validationRefs ${ro.validationRefs.join("、") || "—"}`);
    return lines.join("\n");
};
