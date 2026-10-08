// dsh-shadow —— query/validation.ts：Hypothesis Validation seam（v0.28）。
// 从 query/query.ts 迁出：evidence（注册 FutureEvidence 单向）、validate（替代解释竞争→Artifact）、
// timeline（验证历史）。只读记忆/验证派生；validate 不覆盖 Hypothesis。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runValidation(deps,args,ctx)；返回 undefined 表示非本族 mode。
//
// **B2/B4 同类补扫（v1.22.x；规格轴复审 (a)-1/(a)-2）**：本文件是那批写侧/读侧信号的**唯一读者** ——
// `writeValidation` / `appendValidationEvent` 现在返回三态，`readHypothesis` / `readFutureEvidence` 现在
// 把「还没有」与「读不出/坏件」分开；这里据实把它们并进**同一段输出**（ADR-0049 规则 2/3）。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { writeHypothesis, readHypothesis, registerFutureEvidence, readFutureEvidence } from "../epistemic/validation/evidence.js";
import { validateHypothesis, toArtifact, renderValidation } from "../epistemic/validation/validate.js";
import { writeValidation } from "../epistemic/validation/persist.js";
import { appendValidationEvent, readTimelineDetailed, renderTimeline } from "../epistemic/validation/history.js";
import { unwrittenWarn, readCauseWarn } from "./degrade.js";
import type { ShadowQueryDeps } from "./types.js";

export interface ValidationCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["evidence", "validate", "timeline"]);

/** Returns the rendered body for a validation mode, or undefined if not one of this family. */
export async function runValidation(deps: ShadowQueryDeps, args: any, ctx: ValidationCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "evidence") {
    const { evidence: ev, persisted } = await registerFutureEvidence(fs, ws, { hypothesisId: String(args?.hypothesisId || ""), observedAt: String(args?.observedAt || today()), actualOutcome: String(args?.actualOutcome || ""), observationType: String(args?.observationType || "observation") });
    // **播报必须与实际一致**（v1.15.55）：没落盘就不能说 registered —— 否则之后 validate 读不到它，
    // 使用者只会看到「证据消失了」，无从知道当时根本没写下去。
    if (!persisted) {
      return scrubFinal(RECALL_PREFIX + `[Evidence] **未落盘** ${ev.id} · hypothesis ${ev.hypothesisId} · outcome ${ev.actualOutcome}\n> ⚠ 写入 \`.shadow/future-evidence/\` 失败：这条证据**不会**被后续 \`mode:validate\` 读到。请先确认 shadowRoot 可写后重试。` + flushWarn);
    }
    return scrubFinal(RECALL_PREFIX + `[Evidence] registered ${ev.id} · hypothesis ${ev.hypothesisId} · outcome ${ev.actualOutcome}` + flushWarn);
  }
  if (mode === "validate") {
    const hid = String(args?.hypothesisId || "");
    const hr = await readHypothesis(fs, ws, hid);
    if (!hr.hypothesis) {
      // B4：三态分开说 —— 「没生成过」（正常，下一步是 dream）与「读不出/坏件」（事故，下一步是修可读性）
      // 的处置**相反**；旧实现只有一个 `catch { return null }`，于是把事故说成「请先 mode:offline 生成假设」。
      const why = hr.readFailure ? `**读不出来**（${hr.readFailure}）` : hr.corrupt ? "**坏件**（不是合法 JSON）" : "";
      if (why) {
        return scrubFinal(RECALL_PREFIX + `[Validation Rejected] hypothesis/${hid}.json ${why} —— 这**不是**「还没生成过」：请先修好 \`.shadow/hypothesis/\` 的可读性/内容，再依赖本模式。` + flushWarn);
      }
      return scrubFinal(RECALL_PREFIX + `（无 hypothesis ${hid}：请先 mode:offline 生成假设）` + flushWarn);
    }
    const h = hr.hypothesis;
    // B4：`applied`/结论吃证据列表长度 ⇒ 「被削样本」必须与「本来就这么少」可区分。
    const fe = await readFutureEvidence(fs, ws, hid);
    const evidences = fe.evidence;
    const inputNote =
      readCauseWarn("future-evidence", fe.readFailure, "本次验证的 `applied` 与结论**不是**基于全部证据算出来的 —— `validated`/`rejected` 的判定可能因此偏。")
      + (fe.skipped > 0 ? `\n> ⚠ **${fe.skipped} 份 future evidence 读不出或不是有效文件**（已跳过）：下面的 \`applied ${evidences.length}\` 比真实少 ⇒ 结论可能从 validated 掉回 observed/rejected。` : "");
    const result = validateHypothesis(h, evidences);
    // B2：两个 `write*` 现在返回三态 —— 结论快照与 append-only 历史**当场**渲染，写失败不得静默。
    const wv = await writeValidation(fs, ws, toArtifact(h, result, evidences.map((e) => e.id), today()));
    const ae = await appendValidationEvent(fs, ws, hid, { evidenceIds: evidences.map((e) => e.id), result: result.outcome, alternativeWinner: result.alternativeEvaluation.find((a) => a.supported)?.alternative || null, perceptionDelta: `支持${result.applied.support}/反例${result.applied.contradiction}` });
    const writeNote =
      unwrittenWarn("ValidationArtifact", wv, "`.shadow/validation/<id>.json` 没有它：这次验证的结论快照（当时假设 + 当时现状两个 view）没留下。")
      + unwrittenWarn("ValidationTimeline", ae.persist, "`.shadow/validation/<id>.timeline.json` 没有这次事件：append-only 历史少一条（若原因是「坏件 ⇒ 拒绝覆盖」，那是**设计内**的拒绝 —— 历史被完整保留，但这次事件确实没记下）。");
    return scrubFinal(RECALL_PREFIX + renderValidation(result) + inputNote + writeNote + flushWarn);
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
