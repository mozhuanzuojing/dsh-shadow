import type { ShadowQueryDeps } from "./types.js";
export interface PlanningCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for the plan mode, or undefined if not this family. */
export declare function runPlanning(deps: ShadowQueryDeps, args: any, ctx: PlanningCtx): Promise<string | undefined>;
