/**
 * dsh-shadow — agent「思维/上下文/灵魂」的投影，落成「一切皆文件」的记忆树。
 *
 * 哲学：一切皆文件，这只是思维/上下文/灵魂的投影。
 * 记忆以「入口点 + 时间」为纲、思维/决策为正文、动作为背景。
 *   - 每条记忆 = 一个文件：shadow/<日期>/<时刻>-<入口slug>.md
 *   - shadow/_index.md = 说明文档 + 近期记忆 + 主题索引 + 意识轨迹
 *   - read_shadow：无参读索引；带 topic/entry 穿透到具体记忆文件
 *
 * 采集来源（按可靠度）：
 *   - fs/observed   → 入口点（实际改/读的组件，客观锚）
 *   - goal/changed  → 决策/意向
 *   - tools/result  → 动作背景
 *   - session/event → 交互 + 思维落点（按 SessionEvent 契约抽 text 块，跳过 reasoning）
 *
 * 增强：每一回合落盘后，detach 一个后台任务，用 llm.stream 生成一两句话总结并回填到
 * 记忆文件头（`> 摘要：…`）。纯聊天/无工具回合也能据此沉淀成可读记忆；失败/超时静默降级，
 * 不影响正文。默认路由取 agentDefaultModel.currentSelection()，可用 rawConfig.summary 配置
 * （enabled/provider/model/maxTokens/timeoutMs）。
 *
 * 类型化迁移：源码 index.ts → tsc → dist/index.js（DSH/Cordis bundle 加载的是编译后 JS）。
 * resolver 契约（resolveShadowScope / resolveWorkspace）作为模块级导出，供测试直接引用。
 *
 * Cordis host plugin entry。经 cordis.patch.yml bundle layer 挂载（dsh-wechat 模式）。
 * 零运行时依赖 @deepseek-ai/*：全部服务经 ctx.get / ctx.inject 读取。
 */
export type ShadowScopeKind = "explicit" | "implicit" | "none";
export interface ShadowScope {
    scope: ShadowScopeKind;
    ws: string;
}
export interface ShadowConfig {
    shadowRoot?: string;
    projectRoot?: string;
    summary?: {
        enabled?: boolean;
        provider?: string;
        model?: string;
        maxTokens?: number;
        timeoutMs?: number;
    };
    recall?: {
        enabled?: boolean;
        provider?: string;
        model?: string;
        maxTokens?: number;
        timeoutMs?: number;
        cooldownTurns?: number;
    };
    retention?: {
        enabled?: boolean;
        halfLifeDays?: number;
        staleDays?: number;
    };
    /** P5 默认回写显式同意：true=仅当用户显式要求记忆时才落盘，否则只累积；默认 false 保持现有采集流。 */
    writeConsent?: boolean;
}
/** 兼容 DSH Agent / Session 的最小形状（只读 id 与 cwd 相关字段）。 */
export interface AgentLike {
    id?: string;
    session?: {
        header?: {
            cwd?: string;
        };
        cwd?: string;
    };
}
/** 空串视为无效：避免 `"" ?? fallback` 返回空串导致 workspace 解析短路（F1）。 */
export declare function firstNonEmpty(...values: unknown[]): string | undefined;
/**
 * 解析 shadow 归属 scope：显式 project scope（config shadowRoot / projectRoot）**最高优先**；
 * 其次 session cwd 推导（含 session id → cwd 缓存）；否则 none。解析来源唯一，采集/读取共用，
 * 杜绝"同址但错项目"（O2）与"读不到写"（F1）。
 * @param agent Agent/session 最小形状
 * @param cwdBySession session.id → cwd 缓存
 * @param config 插件配置
 */
export declare function resolveShadowScope(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config?: ShadowConfig): ShadowScope;
/** 采集侧与读取侧共用的**单一** workspace 解析；严禁两处各自复制推导，防漂移。 */
export declare function resolveWorkspace(agent: AgentLike | undefined, cwdBySession: ReadonlyMap<string, string>, config?: ShadowConfig): string;
export declare const name = "dsh-shadow";
export declare const inject: string[];
type CtxLike = any;
export declare function apply(ctx: CtxLike, rawConfig?: ShadowConfig): () => void;
export {};
