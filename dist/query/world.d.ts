import type { ShadowQueryDeps } from "./types.js";
export interface WorldCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a world mode, or undefined if not one of this family. */
export declare function runWorld(deps: ShadowQueryDeps, args: any, ctx: WorldCtx): Promise<string | undefined>;
