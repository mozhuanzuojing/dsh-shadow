import type { ShadowQueryDeps } from "./types.js";
export interface ContVerifyCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a continuity/verify mode, or undefined if not one of this family. */
export declare function runContVerify(deps: ShadowQueryDeps, args: any, ctx: ContVerifyCtx): Promise<string | undefined>;
