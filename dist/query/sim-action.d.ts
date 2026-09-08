import type { ShadowQueryDeps } from "./types.js";
export interface SimActionCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a simulation/action mode, or undefined if not one of this family. */
export declare function runSimAction(deps: ShadowQueryDeps, args: any, ctx: SimActionCtx): Promise<string | undefined>;
