// dsh-shadow —— query/adaptation.ts：Controlled Adaptation Kernel seam（v0.38）。
// 从 query/query.ts 迁出：adapt-context / adapt-change / adapt-validation。
// Adaptation = 行为策略调整（How I do），不是身份/目标/价值观演化（Who I am）；不提升 epistemic status / authority。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runAdaptation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderContext as renderAdaptContext, renderChange, renderValidation as renderAdaptValidation } from "../adaptation/render/render.js";
import { buildAdaptationContext, buildAdaptationChange, validateAdaptation } from "../adaptation/engine/adaptation.js";
import { writeAdaptationContext } from "../adaptation/persistence/persist.js";
import type { ShadowQueryDeps } from "./types.js";

export interface AdaptationCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["adapt-context", "adapt-change", "adapt-validation"]);

/** Returns the rendered body for an adaptation mode, or undefined if not one of this family. */
export async function runAdaptation(deps: ShadowQueryDeps, args: any, ctx: AdaptationCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "adapt-context") {
    const c = buildAdaptationContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[Adaptation Rejected] " + c.reason + flushWarn);
    await writeAdaptationContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderAdaptContext(c.ctx) + flushWarn);
  }
  if (mode === "adapt-change") {
    const ch = await buildAdaptationChange(fs, ws, args);
    if (!ch.ok || !ch.change) return scrubFinal(RECALL_PREFIX + "[AdaptationChange Rejected] " + ch.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderChange(ch.change) + flushWarn);
  }
  const v = await validateAdaptation(fs, ws, args);
  if (!v.ok || !v.validation) return scrubFinal(RECALL_PREFIX + "[AdaptationValidation Rejected] " + v.reason + flushWarn);
  return scrubFinal(RECALL_PREFIX + renderAdaptValidation(v.validation) + flushWarn);
}
