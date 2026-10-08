// dsh-shadow —— query/delegation.ts：Delegated Execution Boundary Kernel seam（v0.36）。
// 从 query/query.ts 迁出：delegation-context / delegation-check / delegation-event（AutonomyBoundaryEvent 纯审计）。
// 委派执行 + 有限适应；不新增 trust/reputation/capabilityLevel。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runDelegation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderContext as renderDelegationContext, renderCheck, renderEvent as renderDelegationEvent } from "../stance/delegation/render/render.js";
import { buildDelegationContext, checkDelegation, recordDelegationEvent } from "../stance/delegation/engine/delegated-execution.js";
import { writeDelegationContext } from "../stance/delegation/persistence/persist.js";
import { unwrittenWarn } from "./degrade.js";
import type { ShadowQueryDeps } from "./types.js";

export interface DelegationCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["delegation-context", "delegation-check", "delegation-event"]);

/** Returns the rendered body for a delegation mode, or undefined if not one of this family. */
export async function runDelegation(deps: ShadowQueryDeps, args: any, ctx: DelegationCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "delegation-context") {
    const c = buildDelegationContext(args);
    if (!c.ok || !c.ctx) return scrubFinal(RECALL_PREFIX + "[DelegationContext Rejected] " + c.reason + flushWarn);
    const w = await writeDelegationContext(fs, ws, c.ctx);
    // B2：写失败必须与成功可区分（旧版 `Promise<void>` + `catch { console.log }`）——
    // 这条记录是 `mode:"delegation-check"` 随后**唯一**的授权事实来源，没落盘就等于「授权不存在」。
    const degrade = unwrittenWarn("DelegationContext", w, "`.shadow/delegation/<date>/delegation-*.json` 没有它：随后 `mode:\"delegation-check\"` 会报「无 delegation（Delegation Lineage 不可断）」—— 把**写失败**说成**没授权**。");
    return scrubFinal(RECALL_PREFIX + renderDelegationContext(c.ctx) + degrade + flushWarn);
  }
  if (mode === "delegation-check") {
    const r = await checkDelegation(fs, ws, args);
    if (r.notFound) return scrubFinal(RECALL_PREFIX + "[DelegationCheck Rejected] " + r.reason + flushWarn);
    // B4 续修：`!r.ok` 现在含两种情况 —— 「读不出 DelegationContext」（事故，reason 里带真实原因）
    // 与各守卫拒绝（判定结论）。两者都走这条早退，但**原因文本已经能区分**（旧版把读故障也写成「无 delegation」）。
    if (!r.ok) return scrubFinal(RECALL_PREFIX + "[DelegationCheck Rejected] " + r.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderCheck(r.result) + flushWarn);
  }
  const e = await recordDelegationEvent(fs, ws, args);
  if (!e.ok || !e.ev) return scrubFinal(RECALL_PREFIX + "[DelegationEvent Rejected] " + e.reason + flushWarn);
  // B2 续修（v1.22.x）：引擎现在把写侧三态带出来（旧版引擎**不消费** `writeDelegationEvent` 的返回值）。
  // 缺字段**不得当成功**（ADR-0049）：成功路径必带 `persist` ⇒ 缺席 = 上游契约被破坏，显式报「未落盘」。
  const degradeE = unwrittenWarn("AutonomyBoundaryEvent", e.persist ?? { ok: false, reason: "生产者未返回 persist" }, "`.shadow/delegation/<date>/event-*.json` 没有它：这次委派执行的审计痕迹（scope/约束/执行结果）没留下。");
  return scrubFinal(RECALL_PREFIX + renderDelegationEvent(e.ev) + degradeE + flushWarn);
}
