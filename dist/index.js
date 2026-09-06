/**
 * dsh-shadow — agent「思维/上下文/灵魂」的投影，落成「一切皆文件」的记忆树。
 *
 * Cordis host plugin entry（Cordis Adapter，薄）：config 解析 + 事件接线 + 工具注册 + systemPrompt。
 * 领域内核已拆出：
 *   - 写侧采集 → core/writer.ts（createShadowCollector：事件 → pending → flush → 索引/摘要/meta）
 *   - 读侧查询 → query/query.ts（runReadShadow：多模式分派 + 召回管线）
 *   - 其余（evidence/observer/soul/retrieval/persistence/security）为独立模块。
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
 * 类型化迁移：源码 index.ts → tsc → dist/index.js（DSH/Cordis bundle 加载的是编译后 JS）。
 * resolver 契约（resolveShadowScope / resolveWorkspace）作为模块级导出，供测试直接引用。
 *
 * 零运行时依赖 @deepseek-ai/*：全部服务经 ctx.get / ctx.inject 读取。
 */
import { createShadowCollector } from "./core/writer.js";
import { routeVerify } from "./evidence/gateway.js";
import { runReadShadow } from "./query/query.js";
export { firstNonEmpty, resolveShadowScope, resolveWorkspace } from "./core/scope.js";
export const name = "dsh-shadow";
export const inject = [];
export function apply(ctx, rawConfig = {}) {
    const context = ctx;
    // 配置读取：测试直接传 rawConfig；live 走 Cordis 的 ctx.config（插件行 config，经 cordis.patch.yml 注入）。
    const config = rawConfig && Object.keys(rawConfig).length
        ? rawConfig
        : (() => { try {
            return (ctx?.config ?? {});
        }
        catch {
            return {};
        } })() ?? {};
    const getAgentById = (id) => {
        if (!id)
            return undefined;
        try {
            return context.get("agents")?.get(id);
        }
        catch {
            return undefined;
        }
    };
    // 写侧采集内核：事件 → pending → flush 落盘（索引/摘要/meta 物化）。
    const collector = createShadowCollector({ context, config, getAgentById });
    context.on("fs/observed", collector.onFsObserved);
    context.on("tools/result", collector.onToolsResult);
    context.on("goal/changed", collector.onGoalChanged);
    context.on("session/event", collector.onSessionEvent);
    context.on("agent/turn-stopping", collector.onTurnStopping);
    context.on("session/flush", collector.onSessionFlush);
    // zg 是「眼睛/Evidence Sensor」；Arbitration(它意味着什么) 留在 Shadow Core。zg 未装 → 明确 unavailable，绝不静默 fallback。
    const verifyEvidence = (ref, ctx) => routeVerify(ref, ctx, config.evidenceProvider || "fs", config.evidenceProviders);
    // 读侧查询依赖注入（闭包型依赖在此构造；领域逻辑在 query/query.ts）。
    const queryDeps = {
        fs: context.get("fs"),
        config,
        cwdBySession: collector.cwdBySession,
        getFlushWarn: collector.getFlushWarn,
        verifyEvidence,
        expandTerms: collector.expandTerms,
    };
    if (typeof context.inject === "function") {
        context.inject(["tools"], (toolsCtx) => {
            const toolsService = toolsCtx.get("tools");
            if (!toolsService)
                return;
            toolsService.register({
                name: "read_shadow",
                description: "读取 agent 的记忆树（shadow）。无参数返回目录与索引；带 topic/entry 按入口或主题穿透到具体记忆文件。穿透按分层召回（先精后深、预算内返回）：低分记忆只给摘要，高分记忆给摘要+命中片段+正文骨架。当判断上下文不足、需要回忆最近想过/决定过什么时调用。",
                parameters: {
                    type: "object",
                    properties: {
                        topic: { type: "string", description: "要穿透的入口/主题（如某路径片段、组件名、工具名、决策词）" },
                        limit: { type: "number", description: "最多返回的记忆文件数，默认 10" },
                        max_tokens: { type: "number", description: "召回内容预算（粗略 token 数），越大返回越深，默认 1600" },
                        debug: { type: "boolean", description: "开启召回管线调试：返回 候选/命中/冷却/预算/返回 计数 + 每条召回「为什么命中/为什么被降权」的拆解。默认关。" },
                        kg: { type: "boolean", description: "返回工程知识图谱（派生）追踪：主题 → 域 → 组件 → 依赖/相关记忆。默认关。" },
                        soul: { type: "boolean", description: "返回 Soul Kernel（身份/价值观/原则/品味/边界）投影。默认关。" },
                        experience: { type: "boolean", description: "返回结构化 Experience（情境/问题/决策/实现/证据/结果/教训），而非零散行。默认关。" },
                        asOf: { type: "string", description: "时间锚定（YYYY-MM-DD）：只召回该时间点『当时可知』的记忆；晚于此的记忆不入窗口。默认=现在。" },
                        observer: { type: "boolean", description: "Observer/Observation Window：以『当时可知』呈现（as-of），并把 outcome/lesson/verdict 等『后来才知』标为 [后验]，不让全局/后验知识假装成当下可知。默认关。" },
                        project: { type: "boolean", description: "Projection：把 topic 视为当前任务，返回 LocalContext（relevant 原则/经验/偏好 + current_state + uncertainty + excluded），用 Observer 透镜算显著、显式排除。默认关。" },
                        judgment: { type: "boolean", description: "返回 Judgment 模式：从记忆派生「面对<情境> → 我判断/选择<决策>」，让经验形成判断。默认关。" },
                        claim: { type: "boolean", description: "返回 claim→Evidence→Judgment：对每条匹配记忆的断言验证证据，由 Observer 决定结论/置信/理由（Evidence 是输入，Observer 下判断）。默认关。" },
                        taste: { type: "boolean", description: "返回 Taste 偏好（curated：灵魂 taste + shadow/taste/taste.json），即「我认为什么是好的」。默认关。" },
                        verify: { type: "boolean", description: "返回 Evidence Result：经 Evidence Gateway 验证匹配记忆的证据路径，报告 verified/not_found/unavailable；zg 未装→unavailable，绝不静默 fallback。默认关。" },
                        identity: { type: "boolean", description: "返回 Identity 主体锚（id/价值观/原则/反模式/决策风格/边界/Observer Lens），长期实体。默认关。" },
                        context: { type: "boolean", description: "返回 ObserverContext（observerId/identityRef/intent/asOf/lens/realityAnchor）——一次观察事件。默认关。" },
                        goal: { type: "string", description: "观察意图 goal（我想改变什么），与 topic 合成 Intent。默认按模式推断。" },
                        realityAnchor: { type: "string", description: "观察现实层 known-at-time（当时可知）/current（当前）/historical（史观）。默认按 asOf/observer 推断。" },
                        lens: { type: "object", description: "覆盖 Observer 透镜 {preferred, avoided}（如 架构师/产品 视角），影响 Projection visible/hidden。默认关。" },
                        state: { type: "object", description: "ObserverState {energy, focus, goalStage, uncertainty}——只读取、不自动推断；可经 soul.json 或此处注入。默认关。" },
                    },
                },
                output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
                execute: (args, exec) => runReadShadow(queryDeps, args, exec),
            });
        });
    }
    if (typeof context.inject === "function") {
        context.inject(["systemPrompt"], (promptCtx) => {
            const systemPrompt = promptCtx.get("systemPrompt");
            if (!systemPrompt)
                return;
            systemPrompt.context({
                name: "dsh-shadow",
                order: 40,
                text: () => "你的思维、上下文与决策沉淀在 shadow 记忆树中。如果发现当前上下文不足、需要回忆最近想过/决定过什么，" +
                    "或要回顾用户最近在往哪个方向走，请先调用 read_shadow（无参读目录索引，带 topic 可按入口穿透）再补充回答。" +
                    "你还有 Soul 投影（身份/价值观/原则/品味/边界，见 shadow/soul/soul.json）：遇到取舍可 read_shadow({soul:true}) 参考，回应工程经历问题可用 read_shadow(topic, {experience:true})。",
            });
        });
    }
    return collector.cleanup;
}
