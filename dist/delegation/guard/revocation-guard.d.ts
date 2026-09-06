import type { DelegationContext } from "../types/context.js";
export declare const notRevoked: (ctx: DelegationContext) => boolean;
export declare const assertNotRevoked: (ctx: DelegationContext) => {
    ok: boolean;
    reason: string;
};
export declare const notExpired: (ctx: DelegationContext, now: string) => boolean;
export declare const assertNotExpired: (ctx: DelegationContext, now: string) => {
    ok: boolean;
    reason: string;
};
