import type { ShadowQueryDeps } from "./types.js";
export interface RealityCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a reality-model mode, or undefined if not one of this family. */
export declare function runRealityModel(deps: ShadowQueryDeps, args: any, ctx: RealityCtx): Promise<string | undefined>;
