// dsh-shadow —— query/recall.ts：Recall Continuity Kernel seam（v0.37）。
// 从 query/query.ts 迁出：recall-forget / recall-event / recall-validation。
// Recall = Access Transition（恢复访问路径），不是 Reality Reconstruction；不为 Memory Kernel。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runRecall(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderRecord, renderEvent as renderRecallEvent, renderValidation as renderRecallValidation } from "../recall/render/render.js";
import { buildForgottenRecord, buildRecallEvent, validateRecall } from "../recall/engine/recall-continuity.js";
import { writeForgottenRecord } from "../recall/persistence/persist.js";
const MODES = new Set(["recall-forget", "recall-event", "recall-validation"]);
/** Returns the rendered body for a recall mode, or undefined if not one of this family. */
export async function runRecall(deps, args, ctx) {
    const mode = String(args?.mode || "");
    if (!MODES.has(mode))
        return undefined;
    const { fs, ws, flushWarn } = ctx;
    if (mode === "recall-forget") {
        const r = buildForgottenRecord(args);
        if (!r.ok || !r.record)
            return scrubFinal(RECALL_PREFIX + "[Recall Rejected] " + r.reason + flushWarn);
        await writeForgottenRecord(fs, ws, r.record);
        return scrubFinal(RECALL_PREFIX + renderRecord(r.record) + flushWarn);
    }
    if (mode === "recall-event") {
        const e = await buildRecallEvent(fs, ws, args);
        if (!e.ok || !e.ev)
            return scrubFinal(RECALL_PREFIX + "[RecallEvent Rejected] " + e.reason + flushWarn);
        return scrubFinal(RECALL_PREFIX + renderRecallEvent(e.ev) + flushWarn);
    }
    const v = await validateRecall(fs, ws, args);
    if (!v.ok || !v.result)
        return scrubFinal(RECALL_PREFIX + "[RecallValidation Rejected] " + v.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderRecallValidation(v.result) + flushWarn);
}
