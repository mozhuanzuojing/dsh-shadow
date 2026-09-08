import type { WriterCore } from "./writer-core.js";
export interface WriterHooks {
    /** pending 超阈值时交给 materialize 落盘（composition root 注入）。 */
    flush?: (agent: {
        id?: string;
    } | undefined) => Promise<void>;
    /** materialize 的 flush 需要采集侧的主入口（composition root 注入，解 cycle）。 */
    primaryComp?: (agentId: string) => string;
}
export interface CaptureResult {
    push: (agentId: string | undefined, rec: any) => void;
    primaryComp: (agentId: string) => string;
    onFsObserved: (target: any, observation: any, actor: any) => undefined;
    onToolsResult: (exec: any) => undefined;
    onGoalChanged: (payload: any) => undefined;
    onSessionEvent: (session: any, event: any) => undefined;
}
export declare function makeCapture(core: WriterCore, hooks: WriterHooks): CaptureResult;
