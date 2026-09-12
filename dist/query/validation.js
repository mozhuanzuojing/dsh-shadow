// dsh-shadow —— query/validation.ts：Hypothesis Validation seam（v0.28）。
// 从 query/query.ts 迁出：evidence（注册 FutureEvidence 单向）、validate（替代解释竞争→Artifact）、
// timeline（验证历史）。只读记忆/验证派生；validate 不覆盖 Hypothesis。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runValidation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { readHypothesis, registerFutureEvidence, readFutureEvidence } from "../validation/evidence.js";
import { validateHypothesis, toArtifact, renderValidation } from "../validation/validate.js";
import { writeValidation } from "../validation/persist.js";
import { appendValidationEvent, readTimelineDetailed, renderTimeline } from "../validation/history.js";
const MODES = new Set(["evidence", "validate", "timeline"]);
/** Returns the rendered body for a validation mode, or undefined if not one of this family. */
export async function runValidation(deps, args, ctx) {
    const mode = String(args?.mode || "");
    if (!MODES.has(mode))
        return undefined;
    const { fs, ws, flushWarn } = ctx;
    if (mode === "evidence") {
        const ev = await registerFutureEvidence(fs, ws, { hypothesisId: String(args?.hypothesisId || ""), observedAt: String(args?.observedAt || today()), actualOutcome: String(args?.actualOutcome || ""), observationType: String(args?.observationType || "observation") });
        return scrubFinal(RECALL_PREFIX + `[Evidence] registered ${ev.id} · hypothesis ${ev.hypothesisId} · outcome ${ev.actualOutcome}` + flushWarn);
    }
    if (mode === "validate") {
        const hid = String(args?.hypothesisId || "");
        const h = await readHypothesis(fs, ws, hid);
        if (!h)
            return scrubFinal(RECALL_PREFIX + `（无 hypothesis ${hid}：请先 mode:offline 生成假设）` + flushWarn);
        const evidences = await readFutureEvidence(fs, ws, hid);
        const result = validateHypothesis(h, evidences);
        await writeValidation(fs, ws, toArtifact(h, result, evidences.map((e) => e.id), today()));
        await appendValidationEvent(fs, ws, hid, { evidenceIds: evidences.map((e) => e.id), result: result.outcome, alternativeWinner: result.alternativeEvaluation.find((a) => a.supported)?.alternative || null, perceptionDelta: `支持${result.applied.support}/反例${result.applied.contradiction}` });
        return scrubFinal(RECALL_PREFIX + renderValidation(result) + flushWarn);
    }
    // timeline
    const hid2 = String(args?.hypothesisId || "");
    const { timeline: tl, corrupt } = await readTimelineDetailed(fs, ws, hid2);
    // 坏件**不得**被渲染成「events 0」（那等于说「这段历史不存在」）—— 报出来，别静默（ADR-0049）。
    const corruptNote = corrupt
        ? `\n⚠ validation timeline **存在但读不出**（坏件）：${hid2}.timeline.json —— 上面的 events 数**不代表真实历史**，请人工修复（本路径不会覆盖它）。\n`
        : "";
    return scrubFinal(RECALL_PREFIX + (corrupt ? corruptNote : "") + renderTimeline(tl) + flushWarn);
}
