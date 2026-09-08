import type { ShadowQueryDeps } from "./types.js";
export interface RecallCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a recall mode, or undefined if not one of this family. */
export declare function runRecall(deps: ShadowQueryDeps, args: any, ctx: RecallCtx): Promise<string | undefined>;
