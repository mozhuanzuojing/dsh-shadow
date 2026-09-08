// dsh-shadow —— query/validation.ts：Hypothesis Validation seam（v0.28）。
// 从 query/query.ts 迁出：evidence（注册 FutureEvidence 单向）、validate（替代解释竞争→Artifact）、
// timeline（验证历史）。只读记忆/验证派生；validate 不覆盖 Hypothesis。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runValidation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { readHypothesis, registerFutureEvidence, readFutureEvidence } from "../validation/evidence.js";
import { validateHypothesis, toArtifact, renderValidation } from "../validation/validate.js";
import { writeValidation } from "../validation/persist.js";
import { appendValidationEvent, readTimeline, renderTimeline } from "../validation/history.js";
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
    const tl = await readTimeline(fs, ws, String(args?.hypothesisId || ""));
    return scrubFinal(RECALL_PREFIX + renderTimeline(tl) + flushWarn);
}
