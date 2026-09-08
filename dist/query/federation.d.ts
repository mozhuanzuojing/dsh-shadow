import type { ShadowQueryDeps } from "./types.js";
import type { AgentLike } from "../core/types.js";
export interface FederationCtx {
    fs: any;
    ws: string;
    flushWarn: string;
    agent?: AgentLike;
}
/** Returns the rendered body for a federation mode, or undefined if not one of this family. */
export declare function runFederation(deps: ShadowQueryDeps, args: any, ctx: FederationCtx): Promise<string | undefined>;
