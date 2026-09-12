import { tokenize } from "./util.js";
import { streamText, textMessage } from "./writer-llm.js";
import { createWriterCore, routeFor } from "./writer-core.js";
import { makeCapture } from "./writer-capture.js";
import { makeMaterialize } from "./writer-materialize.js";
export function createShadowCollector(opts) {
    const core = createWriterCore(opts);
    const hooks = {};
    const capture = makeCapture(core, hooks);
    const materialize = makeMaterialize(core, hooks);
    // 解 cycle：capture.push 兜底 flush（阈值溢出）；materialize.flush 取主入口。
    hooks.flush = materialize.flush;
    hooks.primaryComp = capture.primaryComp;
    const getFlushWarn = () => {
        const parts = [];
        if (core.lastFlushError) {
            parts.push(`\n\n> ⚠ shadow 最近一次落盘失败（${new Date(core.lastFlushError.at).toISOString()}：${core.lastFlushError.err}）。你读到的可能是旧/不完整记忆；请先确认 shadowRoot 可写，勿把「数据不可达」当作「召回不足」。`);
        }
        // 索引重建失败**也必须提示**：此时无参读路径会 serve 磁盘上的**陈旧** `_index.md`，
        // 「索引里没有这条」与「这条不存在」是两件事（ADR-0049）。
        if (core.lastIndexError) {
            parts.push(`\n\n> ⚠ shadow 最近一次**索引重建失败**（${new Date(core.lastIndexError.at).toISOString()}：${core.lastIndexError.err}）。下面的索引可能**不是最新的**；主题召回走逐文件读盘，两者可能不一致。`);
        }
        return parts.join("");
    };
    // v1.6 recall_shadow 的 LLM 推理导航：只让 LLM【选编号】（意图/排序），不生成事实/理由/判断。
    // 失败/未配置 → 返回 []，调用方回退到确定性 bestTask（行为不变）。
    const recallSelect = async (query, candidates) => {
        const cfg = core.config.llmRecall ?? {};
        if (cfg.enabled !== true || !candidates.length)
            return [];
        const route = routeFor(core, cfg);
        if (!route)
            return [];
        const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
        const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
        const system = "你是记忆检索规划器。给定用户查询与候选任务列表，选出最相关任务的编号（从 0 开始）。只输出一个整数，不要解释、标点或 Markdown。";
        const framed = `查询：${query}\n候选任务：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.objective ? " — " + c.objective : ""}${c.summary ? " — " + c.summary : ""}`).join("\n");
        const messages = [textMessage(`shp-${Date.now()}`, framed)];
        const text = await streamText(core.context, route, { label: "", system, messages, maxTokens, timeoutMs });
        const m = String(text || "").match(/\d+/);
        if (m) {
            const idx = Number(m[0]);
            if (idx >= 0 && idx < candidates.length)
                return [idx];
        }
        return [];
    };
    // v1.10.0 Knowledge Engine 的 LLM 树上导航（PageIndex `chat=` 步，ADR-0047 思想）：
    // 只让 LLM【选章节编号】（导航/排序），不生成事实/理由（事实仍从树派生）。
    const knowledgeNavigate = async (query, candidates) => {
        const cfg = core.config.knowledgeEngine?.llmNavigate ?? {};
        if (cfg.enabled !== true || !candidates.length)
            return [];
        const route = routeFor(core, { provider: cfg.provider, model: cfg.model });
        if (!route)
            return [];
        const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
        const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
        const system = "你是知识树检索规划器（像人翻长文档定位正确章节）。给定查询与候选章节，选出最相关章节的编号（逗号分隔，从 0 开始，可多选）。只输出编号，不要解释、标点或 Markdown。";
        const framed = `查询：${query}\n候选章节：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.content ? " — " + c.content : ""}`).join("\n");
        const messages = [textMessage(`shk-${Date.now()}`, framed)];
        const text = await streamText(core.context, route, { label: "", system, messages, maxTokens, timeoutMs });
        const idxs = (String(text || "").match(/\d+/g) || []).map(Number).filter((i) => i >= 0 && i < candidates.length);
        return Array.from(new Set(idxs)).slice(0, 6);
    };
    const expandTerms = async (topic) => {
        if (core.recallCfg.enabled !== true)
            return [];
        const route = routeFor(core, core.recallCfg);
        if (!route)
            return [];
        const maxTokens = Math.max(1, Number(core.recallCfg.maxTokens) || 60);
        const timeoutMs = Math.max(1, Number(core.recallCfg.timeoutMs) || 6000);
        const system = "你是检索扩词助手。给定一个主题/入口，输出 5~10 个最相关的检索词，每行一个，只输出词本身，不要编号、解释或标点。";
        const messages = [textMessage(`shadow-r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, topic)];
        const text = await streamText(core.context, route, { label: "recall expand", system, messages, maxTokens, timeoutMs });
        return tokenize(text).slice(0, 10);
    };
    const cleanup = () => {
        core.pending.clear();
        core.comps.clear();
        core.indexDirty.clear();
    };
    return {
        cwdBySession: core.cwdBySession,
        push: capture.push,
        getFlushWarn,
        expandTerms,
        recallSelect,
        knowledgeNavigate,
        ensureIndex: materialize.ensureIndex,
        onFsObserved: capture.onFsObserved,
        onToolsResult: capture.onToolsResult,
        onGoalChanged: capture.onGoalChanged,
        onSessionEvent: capture.onSessionEvent,
        onTurnStopping: async (payload) => {
            await materialize.flush(payload && payload.agent);
            return undefined;
        },
        onSessionFlush: async () => {
            for (const id of [...core.pending.keys()]) {
                await materialize.flush(core.getAgentById(id) || { id });
            }
            return undefined;
        },
        cleanup,
    };
}
