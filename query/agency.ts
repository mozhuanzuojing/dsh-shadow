// dsh-shadow —— query/agency.ts：Agency Boundary Kernel seam（v0.35）。
// 从 query/query.ts 迁出：agency-context（immutable snapshot）/ agency-select（reason=constraint_satisfied）/
// agency-event（audit + lineage）。Agency ≠ Autonomy：行动能力不得自造目的、不因成功而扩张、不升级为自主。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runAgency(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderContext as renderAgencyContext, renderSelection, renderEvent } from "../agency/render.js";
import { buildAgencyContext, pickAgencySelection, buildAgencyEvent } from "../agency/engine.js";
import { writeAgencyContext } from "../agency/persistence.js";
import type { ShadowQueryDeps } from "./types.js";

export interface AgencyCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["agency-context", "agency-select", "agency-event"]);

/** Returns the rendered body for an agency mode, or undefined if not one of this family. */
export async function runAgency(deps: ShadowQueryDeps, args: any, ctx: AgencyCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "agency-context") {
    const c = buildAgencyContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[AgencyContext Rejected] " + c.reason + flushWarn);
    await writeAgencyContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderAgencyContext(c.ctx) + flushWarn);
  }
  if (mode === "agency-select") {
    const s = pickAgencySelection(args);
    if (!s.ok || !s.sel) return scrubFinal(RECALL_PREFIX + "[AgencySelection Rejected] " + (s.reject || "") + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderSelection(s.sel) + flushWarn);
  }
  const e = await buildAgencyEvent(fs, ws, args);
  if (!e.ok || !e.ev) return scrubFinal(RECALL_PREFIX + "[AgencyEvent Rejected] " + e.reason + flushWarn);
  return scrubFinal(RECALL_PREFIX + renderEvent(e.ev) + flushWarn);
}
