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
import { resolveWorkspace } from "./core/scope.js";
import { today, stamp, compact, slug, under, component, topicsInText, tokenize } from "./core/util.js";
import { readRel, listMemories } from "./persistence/files.js";
import { routeVerify } from "./evidence/gateway.js";
import { extractMessage, goalText, classifyUser } from "./core/collect.js";
import { buildClueHeader, registerMeta } from "./core/memory.js";
import { runReadShadow } from "./query/query.js";
import { sanitizeText, isUnsafe } from "./security/scrub.js";
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
    // 采集落盘可靠性：记录最近一次落盘失败，read_shadow 用于区分「数据不可达」与「召回不足」。
    let lastFlushError;
    // pending 超阈值即异步落盘，避免依赖单一 turn-stopping 事件导致积压不落盘。
    const MAX_PENDING = 60;
    const initiatorId = () => {
        try {
            const agents = context.get("agents");
            return agents ? agents.currentInitiator()?.id : undefined;
        }
        catch {
            return undefined;
        }
    };
    const agentIdOf = (thing) => {
        if (!thing || typeof thing !== "object")
            return undefined;
        const nested = thing.agent && typeof thing.agent === "object" ? thing.agent.id : undefined;
        const direct = typeof thing.id === "string" ? thing.id : undefined;
        return (typeof nested === "string" && nested) || direct || undefined;
    };
    const agentById = (id) => {
        if (!id)
            return undefined;
        try {
            return context.get("agents")?.get(id);
        }
        catch {
            return undefined;
        }
    };
    // pending[agentId] = [{ time, kind, text, comp, sub?, source? }]
    const pending = new Map();
    const comps = new Map();
    const cwdBySession = new Map();
    const goalByAgent = new Map();
    const push = (agentId, rec) => {
        if (!agentId)
            return;
        const arr = pending.get(agentId) || [];
        arr.push({ time: stamp(), ...rec });
        pending.set(agentId, arr);
        // 只把"语义"comp（读/改文件路径）计入主题入口；纯工具名（pwsh/edit/read 等）不作为入口，
        // 避免把多个事务的动作聚成一条"工具名"主题（防跨事务串线、召回命中错主题）。
        if (rec.comp && rec.source !== "tool") {
            const cs = comps.get(agentId) || [];
            cs.push(rec.comp);
            comps.set(agentId, cs);
        }
        // 兜底：pending 超阈值即异步落盘，避免依赖单一 turn-stopping 事件导致积压不落盘。
        if (arr.length >= MAX_PENDING) {
            void flush(agentById(agentId) || { id: agentId });
        }
    };
    const primaryComp = (agentId) => {
        const cs = comps.get(agentId) || [];
        if (!cs.length)
            return "";
        const tally = {};
        for (const c of cs)
            tally[c] = (tally[c] || 0) + 1;
        return Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    };
    const summaryCfg = config.summary ?? {};
    const recallCfg = config.recall ?? {};
    const retentionCfg = config.retention ?? {};
    const writeConsent = config.writeConsent === true;
    const routeFor = (cfg = summaryCfg) => {
        const explicit = cfg.provider && cfg.model ? { provider: cfg.provider, model: cfg.model } : undefined;
        if (explicit)
            return explicit;
        try {
            const sel = context.get("agentDefaultModel")?.currentSelection();
            return sel?.provider && sel?.model ? { provider: sel.provider, model: sel.model } : undefined;
        }
        catch {
            return undefined;
        }
    };
    const summarizeTurn = async (agent, body) => {
        if (summaryCfg.enabled === false)
            return "";
        const llm = context.get("llm");
        if (!llm)
            return "";
        const route = routeFor();
        if (!route)
            return "";
        const maxTokens = Math.max(1, Number(summaryCfg.maxTokens) || 80);
        const timeoutMs = Math.max(1, Number(summaryCfg.timeoutMs) || 8000);
        const system = "用一句话概括给定内容（这轮对话/动作的要点）。只用中文，不超过 40 个字；只输出这一句话，不加解释、引号、Markdown 或任何前缀。";
        const framed = String(body || "").trim().slice(0, 2000) || "（无正文）";
        const messages = [{ id: `shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: "user", content: [{ type: "text", text: framed }], source: { kind: "plugin", plugin: "dsh-shadow" } }];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let text = "";
            for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages, system, maxTokens, signal: controller.signal })) {
                if (!chunk)
                    continue;
                if (chunk.type === "text-delta" && chunk.text)
                    text += chunk.text;
                else if (chunk.type === "finish") {
                    if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted")
                        return "";
                    break;
                }
            }
            const one = String(text || "").replace(/\s+/g, " ").trim();
            return one ? one.slice(0, 120) : "";
        }
        catch (e) {
            console.log("[dsh-shadow] summarize skipped:", e && e.message);
            return "";
        }
        finally {
            clearTimeout(timer);
        }
    };
    const buildIndexText = (ws, memories, topicFiles, todayInfo) => {
        const byDate = {};
        for (const mm of memories)
            (byDate[mm.date] = byDate[mm.date] || []).push(mm);
        const lines = [];
        lines.push("# shadow 目录说明与索引");
        lines.push("");
        lines.push("`shadow/` 是 agent 思维/上下文/灵魂的投影——每条记忆都是一个文件。");
        lines.push("格式：`shadow/<日期>/<时刻>-<入口slug>.md`；记忆以「入口点+时间」为纲，思维/决策为正文。");
        lines.push("默认入口：`read_shadow` 无参读本索引；带 `topic`/`entry` 穿透到具体记忆文件。");
        lines.push("");
        lines.push(`工作区：\`${ws}\``);
        lines.push("");
        lines.push("## 今日摘要");
        if (todayInfo && todayInfo.count > 0) {
            lines.push(`今日 ${todayInfo.count} 条记忆${todayInfo.topics.length ? `，主题：${todayInfo.topics.slice(0, 10).join("、")}` : ""}。`);
        }
        else {
            lines.push("（今日暂无）");
        }
        lines.push("");
        lines.push("## 近期记忆（按日期）");
        const dates = Object.keys(byDate).sort().reverse();
        if (dates.length) {
            for (const dt of dates) {
                lines.push(`- ${dt}/`);
                for (const mm of byDate[dt].sort((a, b) => a.name.localeCompare(b.name)))
                    lines.push(`  - \`${mm.name}\``);
            }
        }
        else {
            lines.push("（暂无）");
        }
        lines.push("");
        lines.push("## 主题索引（入口/主题 → 记忆文件）");
        const topics = Object.keys(topicFiles).sort();
        if (topics.length) {
            for (const t of topics)
                lines.push(`- \`${t}\` → ${[...new Set(topicFiles[t])].join("、")}`);
        }
        else {
            lines.push("（暂无）");
        }
        lines.push("");
        lines.push("## 意识轨迹（按时间，可反推方向）");
        const sorted = [...memories].sort((a, b) => (a.date === b.date ? (a.time || "").localeCompare(b.time || "") : a.date.localeCompare(b.date)));
        if (sorted.length) {
            for (const mm of sorted)
                lines.push(`- ${mm.date} ${mm.time || "??????"} \`${mm.name}\``);
        }
        else {
            lines.push("（暂无）");
        }
        return lines.join("\n");
    };
    const rebuildIndex = async (fs, ws) => {
        if (!fs || !ws)
            return;
        try {
            const memories = await listMemories(fs, ws);
            const topicFiles = {};
            const todayStr = today();
            const todayTopics = new Set();
            let todayCount = 0;
            for (const mm of memories) {
                const text = await readRel(fs, ws, mm.rel);
                const tops = topicsInText(text, slug(mm.name));
                for (const t of tops)
                    (topicFiles[t] = topicFiles[t] || []).push(mm.rel);
                if (mm.date === todayStr) {
                    todayCount++;
                    for (const t of tops)
                        todayTopics.add(t);
                }
            }
            const idx = buildIndexText(ws, memories, topicFiles, { count: todayCount, topics: [...todayTopics] });
            const t = await fs.resolve(`${ws}/shadow/_index.md`, { cwd: ws });
            await fs.writeText(t, idx);
        }
        catch (e) {
            console.log("[dsh-shadow] rebuildIndex failed:", e && e.message);
        }
    };
    const patchSummary = async (fs, ws, rel, entry, arr) => {
        const summary = await summarizeTurn(null, arr.map((e) => `- [${e.comp || entry}] ${e.text}`).join("\n"));
        if (!summary)
            return;
        try {
            const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
            const existing = await fs.readText(t);
            const patched = existing.replace(/^(# .+\n\n)/, `$1> 摘要：${summary}\n\n`);
            if (patched !== existing) {
                await fs.writeText(t, patched);
                await rebuildIndex(fs, ws);
            }
        }
        catch (e) {
            console.log("[dsh-shadow] summarize patch failed:", e && e.message);
        }
    };
    // 安全清洗已迁移至 security/scrub.ts（v0.14 拆内核），此处按需 import 使用。
    const flush = async (agent) => {
        const id = agent?.id;
        const arr = pending.get(id || "");
        if (!arr || !arr.length) {
            if (id) {
                pending.delete(id);
                comps.delete(id);
            }
            return;
        }
        // P5 默认回写显式同意：writeConsent=true 时，仅当本回合含"用户显式要求记忆"的措辞才落盘；
        // 否则只累积（保留 pending，不删除、不写文件），避免静默持久化用户未要求的上下文。
        if (writeConsent && !arr.some((e) => e.kind === "user" && /(记住|记得|记一下|记下来|记忆|沉淀|存档|保存|日后|以后|写入记忆|记下)/.test(String(e.text || "")))) {
            return;
        }
        if (id)
            pending.delete(id);
        const entry = primaryComp(id || "") || "shadow";
        if (id)
            comps.delete(id);
        const ws = resolveWorkspace(agent, cwdBySession, config);
        const fs = context.get("fs");
        if (!ws || !fs)
            return;
        try {
            const rel = `shadow/${today()}/${compact()}-${slug(entry)}.md`;
            const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
            const head = `# ${entry}\n\n`;
            const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
            const extra = { project, agent: id ? String(id) : undefined, goal: goalByAgent.get(String(id || "")) };
            const clue = buildClueHeader(entry, arr, id, extra);
            const bodyLines = arr.map((e) => `- [${e.time}] [${e.comp || entry}] ${sanitizeText(e.text)}`).filter((l) => !isUnsafe(l));
            const body = bodyLines.length ? bodyLines.join("\n") : "- （本回合无可安全记录的正文）";
            await fs.writeText(t, `${head}${clue}${body}\n`);
            await rebuildIndex(fs, ws);
            await registerMeta(fs, ws, rel, id, retentionCfg.enabled === true);
            void patchSummary(fs, ws, rel, entry, arr);
        }
        catch (e) {
            lastFlushError = { at: Date.now(), err: (e && e.message) || String(e) };
            console.error("[dsh-shadow][error] flush FAILED:", lastFlushError.err);
        }
    };
    context.on("fs/observed", (target, observation, actor) => {
        const abs = (target && (target.displayPath || target.targetKey)) || "";
        if (!abs)
            return undefined;
        const id = agentIdOf(actor) || initiatorId();
        if (!id)
            return undefined;
        const ws = resolveWorkspace(agentById(id), cwdBySession, config) || "";
        push(id, { kind: "action", text: `改/读 ${under(abs, ws) || abs}`, comp: component(abs, ws), source: "fs" });
        return undefined;
    });
    context.on("tools/result", (exec) => {
        const id = exec?.agent?.id || initiatorId();
        const tool = exec?.tool?.name || exec?.toolName || exec?.name || exec?.tool || "tool";
        push(id, { kind: "action", text: `调用 ${tool}`, comp: tool, source: "tool" });
        return undefined;
    });
    context.on("goal/changed", (payload) => {
        const gid = payload?.agent?.id;
        const obj = payload?.change?.objective || payload?.change?.goal?.objective || "";
        if (gid && obj)
            goalByAgent.set(String(gid), String(obj).slice(0, 120));
        push(gid, { kind: "decision", text: `决定 ${goalText(payload?.change)}`, comp: "", source: "goal" });
        return undefined;
    });
    context.on("session/event", (session, event) => {
        const sid = session?.id;
        const cwd = session?.header?.cwd;
        if (sid && cwd)
            cwdBySession.set(String(sid), cwd);
        const m = extractMessage(event);
        if (!m)
            return undefined;
        const id = agentById(sid)?.id || (sid ? String(sid) : undefined) || initiatorId();
        const tag = m.kind === "user" ? "用户" : "我";
        const sub = m.kind === "user" ? classifyUser(m.text) : "";
        push(id, { kind: m.kind, text: `${tag}：${sanitizeText(m.text)}`, comp: "", sub, source: m.kind });
        return undefined;
    });
    context.on("agent/turn-stopping", async (payload) => {
        await flush(payload && payload.agent);
        return undefined;
    });
    // 兜底：session 收口（session/flush）时把仍在 pending 的全部落盘，防遗漏/进程重启丢数据。
    context.on("session/flush", async () => {
        for (const id of [...pending.keys()]) {
            await flush(agentById(id) || { id });
        }
        return undefined;
    });
    // 证据链：从记忆文件自身（> 证据链：行，写侧物化）+ _meta.json 状态/命中，物化出「来源·日期·状态·命中·置信·证据路径」。
    // ── Evidence Gateway（v0.14）已迁移至 evidence/{filesystem,zg,gateway}.ts 与 observer/arbitrate.ts；此处保持薄封装。 ──
    // zg 是「眼睛/Evidence Sensor」；Arbitration(它意味着什么) 留在 Shadow Core。zg 未装 → 明确 unavailable，绝不静默 fallback。
    const verifyEvidence = (ref, ctx) => routeVerify(ref, ctx, config.evidenceProvider || "fs", config.evidenceProviders);
    // ⑥ 工程知识图谱（起步地基）：从记忆树派生「组件/域 → 依赖 → 相关记忆」的可查询索引，`kg:true` 时输出邻接追踪。
    // 节点：组件（记忆 title = 路径/域）、域（路径首段）；边：组件→域（belongs_to）、组件→证据路径（depends_on/changed_by）、组件↔记忆（related_to）。
    // ── v0.13 Judgment / Taste ─────────────────────────────────────────────
    const expandTerms = async (topic) => {
        if (recallCfg.enabled !== true)
            return [];
        const llm = context.get("llm");
        if (!llm)
            return [];
        const route = routeFor(recallCfg);
        if (!route)
            return [];
        const maxTokens = Math.max(1, Number(recallCfg.maxTokens) || 60);
        const timeoutMs = Math.max(1, Number(recallCfg.timeoutMs) || 6000);
        const system = "你是检索扩词助手。给定一个主题/入口，输出 5~10 个最相关的检索词，每行一个，只输出词本身，不要编号、解释或标点。";
        const messages = [{ id: `shadow-r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: "user", content: [{ type: "text", text: topic }], source: { kind: "plugin", plugin: "dsh-shadow" } }];
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            let text = "";
            for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages, system, maxTokens, signal: controller.signal })) {
                if (!chunk)
                    continue;
                if (chunk.type === "text-delta" && chunk.text)
                    text += chunk.text;
                else if (chunk.type === "finish") {
                    if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted")
                        return [];
                    break;
                }
            }
            return tokenize(text).slice(0, 10);
        }
        catch (e) {
            console.log("[dsh-shadow] recall expand skipped:", e && e.message);
            return [];
        }
        finally {
            clearTimeout(timer);
        }
    };
    // ── Phase 5：query/router 依赖注入（读侧）——index.ts 收敛为 Adapter，领域逻辑在 query/query.ts ──
    const getFlushWarn = () => lastFlushError
        ? `\n\n> ⚠ shadow 最近一次落盘失败（${new Date(lastFlushError.at).toISOString()}：${lastFlushError.err}）。你读到的可能是旧/不完整记忆；请先确认 shadowRoot 可写，勿把「数据不可达」当作「召回不足」。`
        : "";
    const queryDeps = { fs: context.get("fs"), config, cwdBySession, getFlushWarn, verifyEvidence, expandTerms };
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
                        taste: { type: "boolean", description: "返回 Taste 偏好（curated：灵魂 taste + shadow/taste/taste.json），即「我认为什么是好的」。默认关。" },
                        verify: { type: "boolean", description: "返回 Evidence Result：经 Evidence Gateway 验证匹配记忆的证据路径，报告 verified/not_found/unavailable；zg 未装→unavailable，绝不静默 fallback。默认关。" },
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
    return () => {
        pending.clear();
        comps.clear();
    };
}
