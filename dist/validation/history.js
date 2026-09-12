// dsh-shadow —— validation/history.ts：ValidationTimeline（append-only；Hypothesis immutable）。
// 智慧不是"永远正确"而是"能记住自己什么时候错过"——ValidationEvent[] 支撑 Decision Style / Anti Pattern / Wisdom。
import { SHADOW_ROOT } from "../core/paths.js";
import { today } from "../core/util.js";
export const appendValidationEvent = async (fs, ws, hypothesisId, event) => {
    const { timeline: existing, corrupt } = await readTimelineDetailed(fs, ws, hypothesisId);
    if (corrupt) {
        // **拒绝覆盖**：坏件被「1 条新事件」覆盖 ⇒ 整段 append-only 历史**永久销毁**，
        // 而且从外面看只是「历史变短了」。宁可这次不记，也不把历史抹掉（Forget ≠ Delete，ADR-0031）。
        console.log(`[dsh-shadow] validation timeline **坏件，已拒绝覆盖**（历史保留原样，请人工修复）：${hypothesisId}`);
        return existing; // 不追加、不落盘
    }
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
/**
 * 读时间线，并**区分「还没有」与「读不出」**（本仓纪律 ADR-0049：缺件不静默）。
 *
 * `corrupt: true` ⇒ 文件**存在但不可用**（读失败 / 不是 JSON / 形状不对）。
 * 调用方**不得**把坏件当成空历史去写 —— 那就是用「一条新事件」覆盖掉整段历史。
 */
export const readTimelineDetailed = async (fs, ws, hypothesisId) => {
    const empty = { hypothesisId, events: [] };
    let txt = "";
    try {
        const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/validation/${hypothesisId}.timeline.json`, { cwd: ws });
        txt = await fs.readText(t);
    }
    catch (e) {
        const code = e?.code ?? "";
        const missing = code === "ENOENT" || /ENOENT|no such file|not exist/i.test(String(e?.message ?? e));
        return { timeline: empty, corrupt: !missing }; // 不存在 ⇒ 正常的新时间线；读失败 ⇒ 坏件
    }
    if (!String(txt ?? "").trim())
        return { timeline: empty, corrupt: false }; // 空文件 = 尚无事件
    try {
        const parsed = JSON.parse(txt);
        if (!parsed || !Array.isArray(parsed.events))
            return { timeline: empty, corrupt: true }; // 形状不对 = 坏件
        return { timeline: parsed, corrupt: false };
    }
    catch {
        return { timeline: empty, corrupt: true }; // 不是 JSON = 坏件
    }
};
export const readTimeline = async (fs, ws, hypothesisId) => (await readTimelineDetailed(fs, ws, hypothesisId)).timeline;
export const renderTimeline = (tl) => {
    const lines = ["[Validation Timeline]"];
    lines.push(`hypothesis ${tl.hypothesisId} · events ${tl.events.length} (append-only)`);
    for (const e of tl.events)
        lines.push(`  ${e.time} · ${e.result} · evidence ${e.evidenceIds.length} · alternativeWinner ${e.alternativeWinner || "—"} · ${e.perceptionDelta}`);
    return lines.join("\n");
};
