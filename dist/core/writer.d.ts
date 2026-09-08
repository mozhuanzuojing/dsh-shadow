import type { RecallCandidate, ShadowConfig } from "./types.js";
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
    /** recall_shadow 的 LLM 推理导航（v1.6）：给候选任务列表，LLM 选最相关编号；失败返回 []。 */
    recallSelect: (query: string, candidates: RecallCandidate[]) => Promise<number[]>;
    /** Knowledge Engine 的 LLM 树上导航（v1.10.0，PageIndex `chat=` 步）：给候选章节，LLM 选编号；失败 []。 */
    knowledgeNavigate: (query: string, candidates: {
        id: string;
        title: string;
        content: string;
    }[]) => Promise<number[]>;
    /** 懒构建索引：读侧（read_shadow 无参）在确实要读索引时才构建/落盘 _index.md。 */
    ensureIndex: (ws: string) => Promise<void>;
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
