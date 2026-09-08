import type { ShadowQueryDeps } from "./types.js";
export interface AdaptationCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for an adaptation mode, or undefined if not one of this family. */
export declare function runAdaptation(deps: ShadowQueryDeps, args: any, ctx: AdaptationCtx): Promise<string | undefined>;
