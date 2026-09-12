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
    /**
     * 记一条能力降级留痕（T8-A / ADR-0049）。写侧自己直接在 `catch`/早退分支里调
     * `noteDegrade(core, …)`；这个对外入口是给**读侧**用的（`ShadowQueryDeps.noteDegrade`），
     * 因为读侧路径没有 `WriterCore`。两者写的是**同一个台账**、由 `getFlushWarn` 统一渲染。
     */
    noteDegrade: (capability: string, reason: string, effect: string) => void;
    expandTerms: (topic: string) => Promise<string[]>;
    /** recall_shadow 的 LLM 推理导航（v1.6）：给候选任务列表，LLM 选最相关编号；失败返回 []。 */
    recallSelect: (query: string, candidates: RecallCandidate[]) => Promise<number[]>;
    /** Knowledge Engine 的 LLM 树上导航（v1.10.0，PageIndex `chat=` 步）：给候选章节，LLM 选编号；失败 []。 */
    knowledgeNavigate: (query: string, candidates: {
        id: string;
        title: string;
        content: string;
    }[]) => Promise<number[]>;
    /** 懒构建索引：读侧（read_shadow 无参）在确实要读索引时才构建/落盘 _index.md。
     *  `session` 由读侧入口透传，用于解析**该会话自己的**沙箱策略（ADR-0074）。 */
    ensureIndex: (ws: string, session?: any) => Promise<void>;
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
