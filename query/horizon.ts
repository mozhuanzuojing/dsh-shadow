// dsh-shadow —— query/horizon.ts：Long Horizon Interaction Kernel seam（v0.39）。
// 从 query/query.ts 迁出：horizon-context / horizon-summary / horizon-event / horizon-link。
// 时间可增加经验，但不能增加主体性：Longer≠MoreAuthority / History≠Purpose / Experience≠Identity /
// Adaptation≠Evolution / Continuity≠Autonomy。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runHorizon(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderContext as renderHorizonContext, renderSummary, renderEvent as renderHorizonEvent, renderLink } from "../long-horizon/render/render.js";
import { buildInteractionContext, buildHistorySummary, buildContinuityEvent, buildInteractionAdaptationLink } from "../long-horizon/engine/interaction.js";
import { writeInteractionContext, writeHistorySummary } from "../long-horizon/persistence/persist.js";
import type { ShadowQueryDeps } from "./types.js";

export interface HorizonCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["horizon-context", "horizon-summary", "horizon-event", "horizon-link"]);

/** Returns the rendered body for a horizon mode, or undefined if not one of this family. */
export async function runHorizon(deps: ShadowQueryDeps, args: any, ctx: HorizonCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "horizon-context") {
    const c = buildInteractionContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[Interaction Rejected] " + c.reason + flushWarn);
    await writeInteractionContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderHorizonContext(c.ctx) + flushWarn);
  }
  if (mode === "horizon-summary") {
    const s = buildHistorySummary(args);
    if (!s.ok || !s.summary) return scrubFinal(RECALL_PREFIX + "[HistorySummary Rejected] " + s.reason + flushWarn);
    await writeHistorySummary(fs, ws, s.summary);
    return scrubFinal(RECALL_PREFIX + renderSummary(s.summary) + flushWarn);
  }
  if (mode === "horizon-event") {
    const e = await buildContinuityEvent(fs, ws, args);
    if (!e.ok || !e.event) return scrubFinal(RECALL_PREFIX + "[ContinuityEvent Rejected] " + e.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderHorizonEvent(e.event) + flushWarn);
  }
  const l = await buildInteractionAdaptationLink(fs, ws, args);
  if (!l.ok || !l.link) return scrubFinal(RECALL_PREFIX + "[InteractionLink Rejected] " + l.reason + flushWarn);
  return scrubFinal(RECALL_PREFIX + renderLink(l.link) + flushWarn);
}
