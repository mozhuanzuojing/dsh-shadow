import type { AgentLike } from "./types.js";
import type { WriterCore } from "./writer-core.js";
import type { WriterHooks } from "./writer-capture.js";
export interface MaterializeResult {
    flush: (agent: AgentLike | undefined) => Promise<void>;
    /** 返回是否**真的重建成功**（v1.15.55）：调用方 `ensureIndex` 必须据此决定要不要清 dirty 标记。 */
    rebuildIndex: (fs: any, ws: string) => Promise<boolean>;
    ensureIndex: (ws: string, session?: any) => Promise<void>;
}
export declare function makeMaterialize(core: WriterCore, hooks: WriterHooks): MaterializeResult;
