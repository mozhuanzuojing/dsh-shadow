import type { ShadowQueryDeps } from "./types.js";
export interface ValidationCtx {
    fs: any;
    ws: string;
    flushWarn: string;
}
/** Returns the rendered body for a validation mode, or undefined if not one of this family. */
export declare function runValidation(deps: ShadowQueryDeps, args: any, ctx: ValidationCtx): Promise<string | undefined>;
