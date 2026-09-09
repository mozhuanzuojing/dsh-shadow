// dsh-shadow —— query/recall.ts：Recall Continuity Kernel seam（v0.37）。
// 从 query/query.ts 迁出：recall-forget / recall-event / recall-validation。
// Recall = Access Transition（恢复访问路径），不是 Reality Reconstruction；不为 Memory Kernel。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runRecall(deps,args,ctx)；返回 undefined 表示非本族 mode。
// ADR-0050 消歧：本族是 Continuity（mode 前缀 recall-*），不是 Task Recovery（mode:"recovery" / core/recall.ts），
//               不是主题召回，不是 config.recall。废止的是旧 mode:"recall"（整串），不是本族。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderRecord, renderEvent as renderRecallEvent, renderValidation as renderRecallValidation } from "../recall/render/render.js";
import { buildForgottenRecord, buildRecallEvent, validateRecall } from "../recall/engine/recall-continuity.js";
import { writeForgottenRecord } from "../recall/persistence/persist.js";
import type { ShadowQueryDeps } from "./types.js";

export interface RecallCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["recall-forget", "recall-event", "recall-validation"]);

/** Returns the rendered body for a recall mode, or undefined if not one of this family. */
export async function runRecall(deps: ShadowQueryDeps, args: any, ctx: RecallCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "recall-forget") {
    const r = buildForgottenRecord(args);
    if (!r.ok || !r.record) return scrubFinal(RECALL_PREFIX + "[Recall Rejected] " + r.reason + flushWarn);
    await writeForgottenRecord(fs, ws, r.record);
    return scrubFinal(RECALL_PREFIX + renderRecord(r.record) + flushWarn);
  }
  if (mode === "recall-event") {
    const e = await buildRecallEvent(fs, ws, args);
    if (!e.ok || !e.ev) return scrubFinal(RECALL_PREFIX + "[RecallEvent Rejected] " + e.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderRecallEvent(e.ev) + flushWarn);
  }
  const v = await validateRecall(fs, ws, args);
  if (!v.ok || !v.result) return scrubFinal(RECALL_PREFIX + "[RecallValidation Rejected] " + v.reason + flushWarn);
  return scrubFinal(RECALL_PREFIX + renderRecallValidation(v.result) + flushWarn);
}
