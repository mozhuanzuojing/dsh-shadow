import type { AgentLike } from "./types.js";
import type { WriterCore } from "./writer-core.js";
import type { WriterHooks } from "./writer-capture.js";
export interface MaterializeResult {
    flush: (agent: AgentLike | undefined) => Promise<void>;
    rebuildIndex: (fs: any, ws: string) => Promise<void>;
    ensureIndex: (ws: string, session?: any) => Promise<void>;
}
export declare function makeMaterialize(core: WriterCore, hooks: WriterHooks): MaterializeResult;
