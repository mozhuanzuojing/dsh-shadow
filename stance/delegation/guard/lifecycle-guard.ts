// dsh-shadow —— delegation/guard/lifecycle-guard.ts：委派生命周期（active/expired/revoked）。
// Created → Active → Expired/Revoked → Cannot resurrect。
import type { DelegationContext } from "../types/context.js";
import { notRevoked, notExpired } from "./revocation-guard.js";

export type LifecycleState = "active" | "expired" | "revoked";

export const lifecycleOf = (ctx: DelegationContext, now: string): LifecycleState => {
  if (!notRevoked(ctx)) return "revoked";
  if (!notExpired(ctx, now)) return "expired";
  return "active";
};

export const lifecycleIsActive = (ctx: DelegationContext, now: string) => lifecycleOf(ctx, now) === "active";
