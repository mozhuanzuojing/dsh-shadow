// dsh-shadow —— delegation/guard/lifecycle-guard.ts：委派生命周期（active/expired/revoked）。
// 从 revocation 信号中拆出：失效来源多样（时间/条件/主动撤销/委派者身份变化），都是 lifecycle state，不都是 revoke。
// Created → Active → Expired/Revoked → Cannot resurrect。
import type { DelegationContext } from "../types/context.js";

export type LifecycleState = "active" | "expired" | "revoked";

export const lifecycleOf = (ctx: DelegationContext, now: string): LifecycleState => {
  if (ctx.revocation === true) return "revoked";
  if (ctx.expiration && now > ctx.expiration) return "expired";
  return "active";
};

export const assertLifecycleActive = (ctx: DelegationContext, now: string) => {
  const state = lifecycleOf(ctx, now);
  const ok = state === "active";
  return {
    ok,
    state,
    reason: ok ? undefined : `lifecycle ${state}（Expired/Revoked cannot resurrect；扩大 scope 必须新委派）`,
  };
};
