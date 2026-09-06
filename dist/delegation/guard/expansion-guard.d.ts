import type { DelegationContext } from "../types/context.js";
export declare const contextHasNoExpansionField: (ctx: DelegationContext) => boolean;
export declare const assertNoExpansionField: (ctx: DelegationContext) => {
    ok: boolean;
    reason: string;
};
export declare const resultNoPermissionUpgrade: (r: string) => boolean;
export declare const assertResultNoPermissionUpgrade: (r: string) => {
    ok: boolean;
    reason: string;
};
export declare const resultNoLongRunAuthority: (r: string) => boolean;
export declare const assertResultNoLongRunAuthority: (r: string) => {
    ok: boolean;
    reason: string;
};
export declare const resultNoOwnership: (r: string) => boolean;
export declare const assertResultNoOwnership: (r: string) => {
    ok: boolean;
    reason: string;
};
export declare const resultNoIdentityClaim: (r: string) => boolean;
export declare const assertResultNoIdentityClaim: (r: string) => {
    ok: boolean;
    reason: string;
};
