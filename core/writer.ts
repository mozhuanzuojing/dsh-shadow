// dsh-shadow —— core/writer.ts：写侧采集内核（v0.14 Phase 5b）——composition root。
// 采集「一切皆文件」记忆树的写侧状态机：事件 → pending 累积 → flush 落盘 → 索引/摘要/meta 物化。
// 本文件只做组合：建 WriterCore（共享状态+cfg）→ makeCapture（事件→pending）→ makeMaterialize
// （pending→文件+索引+meta+摘要）→ 以 hooks 解 capture↔materialize 的互相调用 → 拼装 ShadowCollector。
// index.ts 只做 Cordis Adapter 接线（事件 wire + 工具注册 + config），本模块封装领域逻辑。
import type { AgentLike, RecallCandidate, ShadowConfig } from "./types.js";
import { tokenize } from "./util.js";
import { streamText, textMessage } from "./writer-llm.js";
import { createWriterCore, routeFor } from "./writer-core.js";
import { makeCapture, type WriterHooks } from "./writer-capture.js";
import { makeMaterialize } from "./writer-materialize.js";

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
  knowledgeNavigate: (query: string, candidates: { id: string; title: string; content: string }[]) => Promise<number[]>;
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

export function createShadowCollector(opts: ShadowCollectorOpts): ShadowCollector {
  const core = createWriterCore(opts);
  const hooks: WriterHooks = {};
  const capture = makeCapture(core, hooks);
  const materialize = makeMaterialize(core, hooks);
  // 解 cycle：capture.push 兜底 flush（阈值溢出）；materialize.flush 取主入口。
  hooks.flush = materialize.flush;
  hooks.primaryComp = capture.primaryComp;

  const getFlushWarn = () =>
    core.lastFlushError
      ? `\n\n> ⚠ shadow 最近一次落盘失败（${new Date(core.lastFlushError.at).toISOString()}：${core.lastFlushError.err}）。你读到的可能是旧/不完整记忆；请先确认 shadowRoot 可写，勿把「数据不可达」当作「召回不足」。`
      : "";

  // v1.6 recall_shadow 的 LLM 推理导航：只让 LLM【选编号】（意图/排序），不生成事实/理由/判断。
  // 失败/未配置 → 返回 []，调用方回退到确定性 bestTask（行为不变）。
  const recallSelect = async (query: string, candidates: RecallCandidate[]) => {
    const cfg = core.config.llmRecall ?? {};
    if (cfg.enabled !== true || !candidates.length) return [];
    const route = routeFor(core, cfg);
    if (!route) return [];
    const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
    const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
    const system = "你是记忆检索规划器。给定用户查询与候选任务列表，选出最相关任务的编号（从 0 开始）。只输出一个整数，不要解释、标点或 Markdown。";
    const framed = `查询：${query}\n候选任务：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.objective ? " — " + c.objective : ""}${c.summary ? " — " + c.summary : ""}`).join("\n");
    const messages = [textMessage(`shp-${Date.now()}`, framed)];
    const text = await streamText(core.context, route, { label: "", system, messages, maxTokens, timeoutMs });
    const m = String(text || "").match(/\d+/);
    if (m) { const idx = Number(m[0]); if (idx >= 0 && idx < candidates.length) return [idx]; }
    return [];
  };

  // v1.10.0 Knowledge Engine 的 LLM 树上导航（PageIndex `chat=` 步，ADR-0047 思想）：
  // 只让 LLM【选章节编号】（导航/排序），不生成事实/理由（事实仍从树派生）。
  const knowledgeNavigate = async (query: string, candidates: { id: string; title: string; content: string }[]) => {
    const cfg = core.config.knowledgeEngine?.llmNavigate ?? {};
    if (cfg.enabled !== true || !candidates.length) return [];
    const route = routeFor(core, { provider: cfg.provider, model: cfg.model });
    if (!route) return [];
    const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
    const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
    const system = "你是知识树检索规划器（像人翻长文档定位正确章节）。给定查询与候选章节，选出最相关章节的编号（逗号分隔，从 0 开始，可多选）。只输出编号，不要解释、标点或 Markdown。";
    const framed = `查询：${query}\n候选章节：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.content ? " — " + c.content : ""}`).join("\n");
    const messages = [textMessage(`shk-${Date.now()}`, framed)];
    const text = await streamText(core.context, route, { label: "", system, messages, maxTokens, timeoutMs });
    const idxs = (String(text || "").match(/\d+/g) || []).map(Number).filter((i) => i >= 0 && i < candidates.length);
    return Array.from(new Set(idxs)).slice(0, 6);
  };

  const expandTerms = async (topic: string) => {
    if (core.recallCfg.enabled !== true) return [];
    const route = routeFor(core, core.recallCfg);
    if (!route) return [];
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
    onTurnStopping: async (payload: any) => {
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
