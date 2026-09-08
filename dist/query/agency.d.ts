import type { ShadowQueryDeps } from "./types.js";
export interface AgencyCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for an agency mode, or undefined if not one of this family. */
export declare function runAgency(deps: ShadowQueryDeps, args: any, ctx: AgencyCtx): Promise<string | undefined>;
