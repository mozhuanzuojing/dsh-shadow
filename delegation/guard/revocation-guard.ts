// dsh-shadow —— delegation/guard/revocation-guard.ts：187 Revocation First + 189 Expiration ≠ Historical Permission。
import type { DelegationContext } from "../types/context.js";

// 187: Authority revoked + old successful history ≠ still allowed（撤销优先于执行历史）。
export const notRevoked = (ctx: DelegationContext) => ctx.revocation !== true;

// 189: 过期即失效（Time says stop）；历史成功不续期。
export const notExpired = (ctx: DelegationContext, now: string) => !ctx.expiration || now <= ctx.expiration;
