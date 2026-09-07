// dsh-shadow —— validation/history.ts：ValidationTimeline（append-only；Hypothesis immutable）。
// 智慧不是"永远正确"而是"能记住自己什么时候错过"——ValidationEvent[] 支撑 Decision Style / Anti Pattern / Wisdom。
import { SHADOW_ROOT } from "../core/paths.js";
import { today } from "../core/util.js";
export const appendValidationEvent = async (fs, ws, hypothesisId, event) => {
    const existing = await readTimeline(fs, ws, hypothesisId);
    existing.events.push({ time: event.time || today(), evidenceIds: event.evidenceIds || [], result: event.result, alternativeWinner: event.alternativeWinner || null, perceptionDelta: event.perceptionDelta || "" });
    try {
        const rel = `${SHADOW_ROOT}/validation/${hypothesisId}.timeline.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(existing));
    }
    catch (e) {
        console.log("[dsh-shadow] validation timeline write failed:", e && e.message);
    }
    return existing;
};
export const readTimeline = async (fs, ws, hypothesisId) => {
    try {
        const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/validation/${hypothesisId}.timeline.json`, { cwd: ws });
        return JSON.parse(await fs.readText(t));
    }
    catch {
        return { hypothesisId, events: [] };
    }
};
export const renderTimeline = (tl) => {
    const lines = ["[Validation Timeline]"];
    lines.push(`hypothesis ${tl.hypothesisId} · events ${tl.events.length} (append-only)`);
    for (const e of tl.events)
        lines.push(`  ${e.time} · ${e.result} · evidence ${e.evidenceIds.length} · alternativeWinner ${e.alternativeWinner || "—"} · ${e.perceptionDelta}`);
    return lines.join("\n");
};
