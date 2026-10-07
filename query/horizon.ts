// dsh-shadow —— query/horizon.ts：Long Horizon Interaction Kernel seam（v0.39）。
// 从 query/query.ts 迁出：horizon-context / horizon-summary / horizon-event / horizon-link。
// 时间可增加经验，但不能增加主体性：Longer≠MoreAuthority / History≠Purpose / Experience≠Identity /
// Adaptation≠Evolution / Continuity≠Autonomy。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runHorizon(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderContext as renderHorizonContext, renderSummary, renderEvent as renderHorizonEvent, renderLink } from "../trajectory/long-horizon/render/render.js";
import { buildInteractionContext, buildHistorySummary, buildContinuityEvent, buildInteractionAdaptationLink } from "../trajectory/long-horizon/engine/interaction.js";
import { writeInteractionContext, writeHistorySummary } from "../trajectory/long-horizon/persistence/persist.js";
import { unwrittenWarn } from "./degrade.js";
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
    const w = await writeInteractionContext(fs, ws, c.ctx);
    // B2：写失败必须与成功可区分（旧版 `Promise<void>` + `catch { console.log }` ⇒ 同一段输出宣称已记录）。
    const degrade = unwrittenWarn("InteractionContext", w, "`.shadow/horizon/<date>/context-*.json` 没有它：上面这段只是**内存中的对象**（`History→Recall→Adaptation` 的 lineage 靠这条记录成立）。");
    return scrubFinal(RECALL_PREFIX + renderHorizonContext(c.ctx) + degrade + flushWarn);
  }
  if (mode === "horizon-summary") {
    const s = buildHistorySummary(args);
    if (!s.ok || !s.summary) return scrubFinal(RECALL_PREFIX + "[HistorySummary Rejected] " + s.reason + flushWarn);
    const w = await writeHistorySummary(fs, ws, s.summary);
    const degrade = unwrittenWarn("HistorySummary", w, "`.shadow/horizon/<date>/summary-*.json` 没有它：上面的摘要是**内存中的对象**（摘要是访问辅助，丢了它下一次读不到这份压缩结果）。");
    return scrubFinal(RECALL_PREFIX + renderSummary(s.summary) + degrade + flushWarn);
  }
  if (mode === "horizon-event") {
    const e = await buildContinuityEvent(fs, ws, args);
    if (!e.ok || !e.event) return scrubFinal(RECALL_PREFIX + "[ContinuityEvent Rejected] " + e.reason + flushWarn);
    const degrade = unwrittenWarn("HistoryContinuityEvent", e.persist ?? { ok: true }, "`.shadow/horizon/<date>/event-*.json` 没有它：accessibility 变迁的审计痕迹没留下。");
    return scrubFinal(RECALL_PREFIX + renderHorizonEvent(e.event) + degrade + flushWarn);
  }
  const l = await buildInteractionAdaptationLink(fs, ws, args);
  if (!l.ok || !l.link) return scrubFinal(RECALL_PREFIX + "[InteractionLink Rejected] " + l.reason + flushWarn);
  const degrade = unwrittenWarn("InteractionAdaptationLink", l.persist ?? { ok: true }, "`.shadow/horizon/<date>/link-*.json` 没有它：History→Recall→Adaptation 这条链的**连接边**没留下。");
  return scrubFinal(RECALL_PREFIX + renderLink(l.link) + degrade + flushWarn);
}
