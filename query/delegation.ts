// dsh-shadow —— query/delegation.ts：Delegated Execution Boundary Kernel seam（v0.36）。
// 从 query/query.ts 迁出：delegation-context / delegation-check / delegation-event（AutonomyBoundaryEvent 纯审计）。
// 委派执行 + 有限适应；不新增 trust/reputation/capabilityLevel。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runDelegation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { renderContext as renderDelegationContext, renderCheck, renderEvent as renderDelegationEvent } from "../delegation/render/render.js";
import { buildDelegationContext, checkDelegation, recordDelegationEvent } from "../delegation/engine/delegated-execution.js";
import { writeDelegationContext } from "../delegation/persistence/persist.js";
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
    await writeDelegationContext(fs, ws, c.ctx);
    return scrubFinal(RECALL_PREFIX + renderDelegationContext(c.ctx) + flushWarn);
  }
  if (mode === "delegation-check") {
    const r = await checkDelegation(fs, ws, args);
    if (r.notFound) return scrubFinal(RECALL_PREFIX + "[DelegationCheck Rejected] " + r.reason + flushWarn);
    if (!r.ok) return scrubFinal(RECALL_PREFIX + "[DelegationCheck Rejected] " + r.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderCheck(r.result) + flushWarn);
  }
  const e = await recordDelegationEvent(fs, ws, args);
  if (!e.ok || !e.ev) return scrubFinal(RECALL_PREFIX + "[DelegationEvent Rejected] " + e.reason + flushWarn);
  return scrubFinal(RECALL_PREFIX + renderDelegationEvent(e.ev) + flushWarn);
}
