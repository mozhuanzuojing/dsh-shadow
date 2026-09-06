import { today } from "../core/util.js";
export const buildSleepWindow = (opts) => ({
    id: opts.id || `sw-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    observerId: opts.observerId,
    startTime: opts.from || "",
    endTime: opts.to || today(),
    trigger: opts.trigger || "scheduled",
    includedTimelineRange: { from: opts.from || "", to: opts.to || today() },
    excluded: { currentConversation: true, externalInput: true }, // 恒 true
});
export const renderSleepWindow = (w) => {
    const lines = ["[SleepWindow]"];
    lines.push(`id ${w.id} · observer ${w.observerId} · trigger ${w.trigger}`);
    lines.push(`range ${w.includedTimelineRange.from || "…"} → ${w.includedTimelineRange.to || "…"}`);
    lines.push(`excluded currentConversation=${w.excluded.currentConversation} externalInput=${w.excluded.externalInput}`);
    return lines.join("\n");
};
