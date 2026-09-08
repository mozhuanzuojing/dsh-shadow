import type { ShadowQueryDeps } from "./types.js";
import type { AgentLike } from "../core/types.js";
export interface ObserverCtx {
    fs: any;
    ws: string;
    flushWarn: string;
    agent?: AgentLike;
}
/** Returns the rendered body for an observer-kernel mode, or undefined if not one of this family. */
export declare function runObserverKernel(deps: ShadowQueryDeps, args: any, ctx: ObserverCtx): Promise<string | undefined>;
