import { today } from "../core/util.js";
import { scrubUnsafe } from "../security/scrub.js";
export const recordObservationTrace = async (fs, ws, trace) => {
    try {
        const id = trace.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const rel = `shadow/observation/${today()}/${id}.md`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, renderObservationTrace({ ...trace, id }));
    }
    catch (e) {
        console.log("[dsh-shadow] observation trace record failed (bypath):", e && e.message);
    }
};
export const renderObservationTrace = (tr) => {
    const lines = ["# Observation Trace"];
    lines.push(`> observer: ${scrubUnsafe(tr.observerId)}`);
    lines.push(`> createdAt: ${tr.createdAt}`);
    lines.push(`> realityAnchor: ${tr.realityAnchor}`);
    lines.push(`> intent: ${scrubUnsafe(tr.intent.goal)}${tr.intent.question ? ` · ${scrubUnsafe(tr.intent.question)}` : ""}`);
    if (tr.decision)
        lines.push(`> decision: ${scrubUnsafe(tr.decision.action)}${tr.decision.rationale ? ` (${scrubUnsafe(tr.decision.rationale)})` : ""}`);
    if (tr.outcome)
        lines.push(`> outcome: expected=${scrubUnsafe(tr.outcome.expected || "—")} · actual=${scrubUnsafe(tr.outcome.actual || "—")}`);
    lines.push(`> uncertainty: ${tr.uncertainty.level}${tr.uncertainty.reasons.length ? ` (${scrubUnsafe(tr.uncertainty.reasons.join("、"))})` : ""}`);
    lines.push(`> source: ${tr.metadata.source}`);
    if (tr.state && (tr.state.focus || tr.state.energy || tr.state.goalStage || tr.state.uncertainty !== undefined)) {
        lines.push(`> state: ${JSON.stringify(tr.state)}`);
    }
    lines.push("");
    lines.push(`visible: ${tr.projection.visible.join("、") || "—"}`);
    lines.push(`hidden: ${tr.projection.hidden.join("、") || "—"}`);
    lines.push(`distortion: ${tr.projection.distortion.join(" · ") || "—"}`);
    return lines.join("\n");
};
