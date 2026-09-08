import type { ShadowQueryDeps } from "./types.js";
export interface HorizonCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a horizon mode, or undefined if not one of this family. */
export declare function runHorizon(deps: ShadowQueryDeps, args: any, ctx: HorizonCtx): Promise<string | undefined>;
