import type { ShadowQueryDeps } from "./types.js";
export interface DelegationCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a delegation mode, or undefined if not one of this family. */
export declare function runDelegation(deps: ShadowQueryDeps, args: any, ctx: DelegationCtx): Promise<string | undefined>;
