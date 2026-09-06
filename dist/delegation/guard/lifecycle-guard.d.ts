import type { DelegationContext } from "../types/context.js";
export type LifecycleState = "active" | "expired" | "revoked";
export declare const lifecycleOf: (ctx: DelegationContext, now: string) => LifecycleState;
export declare const assertLifecycleActive: (ctx: DelegationContext, now: string) => {
    ok: boolean;
    state: LifecycleState;
    reason: string;
};
