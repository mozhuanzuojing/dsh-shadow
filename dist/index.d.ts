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
import type { ShadowConfig } from "./core/types.js";
export type { EvidenceMatch, EvidenceProvider, EvidenceRef, EvidenceResult, ShadowConfig, ShadowScope, ShadowScopeKind } from "./core/types.js";
export { firstNonEmpty, resolveShadowScope, resolveWorkspace } from "./core/scope.js";
export declare const name = "dsh-shadow";
export declare const inject: string[];
type CtxLike = any;
export declare function apply(ctx: CtxLike, rawConfig?: ShadowConfig): () => void;
