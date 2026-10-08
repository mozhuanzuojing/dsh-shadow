// dsh-shadow —— query/adaptation.ts：Controlled Adaptation Kernel seam（v0.38）。
// 从 query/query.ts 迁出：adapt-context / adapt-change / adapt-validation。
// Adaptation = 行为策略调整（How I do），不是身份/目标/价值观演化（Who I am）；不提升 epistemic status / authority。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runAdaptation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderContext as renderAdaptContext, renderChange, renderValidation as renderAdaptValidation } from "../trajectory/adaptation/render/render.js";
import { buildAdaptationContext, buildAdaptationChange, validateAdaptation } from "../trajectory/adaptation/engine/adaptation.js";
import { writeAdaptationContext } from "../trajectory/adaptation/persistence/persist.js";
import { unwrittenWarn } from "./degrade.js";
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
    const w = await writeAdaptationContext(fs, ws, c.ctx);
    // B2：写失败必须与成功可区分（旧版 `Promise<void>` + `catch { console.log }`）。
    const degrade = unwrittenWarn("AdaptationContext", w, "`.shadow/adapt/<date>/context-*.json` 没有它：上面这段只是**内存中的对象**（调整依据/范围随后读不回来）。");
    return scrubFinal(RECALL_PREFIX + renderAdaptContext(c.ctx) + degrade + flushWarn);
  }
  if (mode === "adapt-change") {
    const ch = await buildAdaptationChange(fs, ws, args);
    if (!ch.ok || !ch.change) return scrubFinal(RECALL_PREFIX + "[AdaptationChange Rejected] " + ch.reason + flushWarn);
    // 缺字段**不得当成功**（ADR-0049）：`buildAdaptationChange` 的成功路径必带 `persist`，
    // 故这里缺席 = 上游契约被破坏 ⇒ 显式报「未落盘」，而不是把「未记录」静默读成「写成功」。
    const degrade = unwrittenWarn("AdaptationChange", ch.persist ?? { ok: false, reason: "生产者未返回 persist" }, "`.shadow/adapt/<date>/change-*.json` 没有它：`mode:\"adapt-validation\"` 随后**找不到这次调整**（Adaptation Lineage 断了）。");
    return scrubFinal(RECALL_PREFIX + renderChange(ch.change) + degrade + flushWarn);
  }
  const v = await validateAdaptation(fs, ws, args);
  if (!v.ok || !v.validation) return scrubFinal(RECALL_PREFIX + "[AdaptationValidation Rejected] " + v.reason + flushWarn);
  const degrade = unwrittenWarn("AdaptationValidation", v.persist ?? { ok: false, reason: "生产者未返回 persist" }, "`.shadow/adapt/<date>/validation-*.json` 没有它：这次「问题发生 + 现实反馈」的记录没留下。");
  return scrubFinal(RECALL_PREFIX + renderAdaptValidation(v.validation) + degrade + flushWarn);
}
