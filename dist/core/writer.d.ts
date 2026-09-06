import type { ShadowConfig } from "./types.js";
export interface ShadowCollectorOpts {
    context: any;
    config: ShadowConfig;
    getAgentById: (id: string | undefined) => any;
}
export interface ShadowCollector {
    /** 会话 id → 工作区 cwd（读侧 resolveWorkspace 用）。 */
    cwdBySession: ReadonlyMap<string, string>;
    /** push / flush / 扩词 / 落盘失败提示。 */
    push: (agentId: string | undefined, rec: any) => void;
    getFlushWarn: () => string;
    expandTerms: (topic: string) => Promise<string[]>;
    /** 事件 handler（index.ts 用 context.on 绑定）。 */
    onFsObserved: (target: any, observation: any, actor: any) => undefined;
    onToolsResult: (exec: any) => undefined;
    onGoalChanged: (payload: any) => undefined;
    onSessionEvent: (session: any, event: any) => undefined;
    onTurnStopping: (payload: any) => Promise<undefined>;
    onSessionFlush: () => Promise<undefined>;
    /** apply 清理：清空 pending/comps。 */
    cleanup: () => void;
}
export declare function createShadowCollector(opts: ShadowCollectorOpts): ShadowCollector;
