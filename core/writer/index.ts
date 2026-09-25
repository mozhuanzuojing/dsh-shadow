// dsh-shadow —— core/writer.ts：写侧采集内核（v0.14 Phase 5b）——composition root。
// 采集记忆树的写侧状态机：事件 → pending 累积 → flush 落盘 → 索引/摘要/meta 物化。
// 本文件只做组合：建 WriterCore（共享状态+cfg）→ makeCapture（事件→pending）→ makeMaterialize
// （pending→文件+索引+meta+摘要）→ 以 hooks 解 capture↔materialize 的互相调用 → 拼装 ShadowCollector。
// index.ts 只做 Cordis Adapter 接线（事件 wire + 工具注册 + config），本模块封装领域逻辑。
import type { AgentLike, RecallCandidate, ShadowConfig } from "../types.js";
import { tokenize } from "../util.js";
import { streamText, textMessage } from "./llm.js";
import { createWriterCore, routeFor, noteDegrade, dirtyRelsFor, clearDerivedDirty } from "./core.js";
import { makeCapture, type WriterHooks } from "./capture.js";
import { makeMaterialize } from "./materialize.js";

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
  knowledgeNavigate: (query: string, candidates: { id: string; title: string; content: string }[]) => Promise<number[]>;
  /** 懒构建索引：读侧（read_shadow 无参）在确实要读索引时才构建/落盘 _index.md。
   *  `session` 由读侧入口透传，用于解析**该会话自己的**沙箱策略（ADR-0074）。 */
  ensureIndex: (ws: string, session?: any) => Promise<void>;
  /**
   * **派生索引的写侧精确信号**（T17-B D6 门③）：取某工作区下「已知变更」的 rel 列表。
   * 由 `flush`（新落盘）与 `patchSummary`（**原地改写**）标脏；读侧 provider 对这些 rel 做单条 upsert，
   * 并在**成功之后**经 `clearDerivedDirty` 消费。
   */
  derivedDirtyFor: (ws: string) => string[];
  /** 消费一批 dirty（键 `ws|rel` 精确删）。**只有成功并入索引之后才允许调**。 */
  clearDerivedDirty: (ws: string, rels: Iterable<string>) => void;
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

  const getFlushWarn = () => {
    const parts: string[] = [];
    // T6 ②（v1.21.26）：兜底根写入的**未受会话授权**告知 —— 与 `lastFlushError` 并列（同一条横幅的两种事实：
    // 「没写进去」与「写到了不受本会话围栏保护的地方」）。信号只由写侧在落到兜底根时置，见 `core/writer/materialize.ts`。
    if (core.lastScopeNotice) {
      parts.push(`\n\n> ⚠ shadow 本次写入**未受会话授权**（${new Date(core.lastScopeNotice.at).toISOString()}）：${core.lastScopeNotice.note}。请确认 shadowRoot / 会话 cwd，勿把「写到了别处」当成「已按本会话落盘」。`);
    }
    if (core.lastFlushError) {
      parts.push(`\n\n> ⚠ shadow 最近一次落盘失败（${new Date(core.lastFlushError.at).toISOString()}：${core.lastFlushError.err}）。你读到的可能是旧/不完整记忆；请先确认 shadowRoot 可写，勿把「数据不可达」当作「召回不足」。`);
    }
    // 索引重建失败**也必须提示**：此时无参读路径会 serve 磁盘上的**陈旧** `_index.md`，
    // 「索引里没有这条」与「这条不存在」是两件事（ADR-0049）。
    if (core.lastIndexError) {
      parts.push(`\n\n> ⚠ shadow 最近一次**索引重建失败**（${new Date(core.lastIndexError.at).toISOString()}：${core.lastIndexError.err}）。下面的索引可能**不是最新的**；主题召回走逐文件读盘，两者可能不一致。`);
    }
    // 元数据未登记：记忆**存在**但 hits/生命周期/遗忘判据看不到它 —— 与「落盘失败」是不同的事，故分开提示。
    if (core.lastMetaError) {
      parts.push(`\n\n> ⚠ shadow 最近一次**元数据未登记**（${new Date(core.lastMetaError.at).toISOString()}：${core.lastMetaError.err}）。记忆本体已写入，但命中计数与生命周期标签对它不生效。`);
    }
    // T8-A（v1.15.65）**能力降级台账** —— ADR-0049 的「可见信号」在此收口。
    //
    // 为什么复用它而不是各能力自己打印：本函数的结果（`flushWarn`）已经被**每一个**读路径
    // 带在返回值里（`query/*.ts` 里 60+ 处 `+ flushWarn`）⇒ 在这里加一行，
    // 所有 mode 同时获得信号，不需要逐个 handler 改。**判据收一处**在这里的具体含义就是：
    // 「能力降级怎么让读者看见」只有一个答案。
    //
    // 排序保证输出**稳定**（`Map` 的插入序会随「哪个先降级」变化 ⇒ 会让逐字节比对的门禁变脆）。
    for (const n of [...core.degrade.values()].sort((a, b) => a.capability.localeCompare(b.capability))) {
      parts.push(`\n\n> ⚠ shadow **能力降级** · ${n.capability}（${new Date(n.at).toISOString()}）。**原因**：${n.reason}。**后果**：${n.effect}`);
    }
    return parts.join("");
  };

  // v1.6 recall_shadow 的 LLM 推理导航：只让 LLM【选编号】（意图/排序），不生成事实/理由/判断。
  // 失败/未配置 → 返回 []，调用方回退到确定性 bestTask（行为不变）。
  const recallSelect = async (query: string, candidates: RecallCandidate[]) => {
    const cfg = core.config.llmRecall ?? {};
    if (cfg.enabled !== true || !candidates.length) return [];
    const route = routeFor(core, cfg);
    const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
    const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
    const system = "你是记忆检索规划器。给定用户查询与候选任务列表，选出最相关任务的编号（从 0 开始）。只输出一个整数，不要解释、标点或 Markdown。";
    const framed = `查询：${query}\n候选任务：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.objective ? " — " + c.objective : ""}${c.summary ? " — " + c.summary : ""}`).join("\n");
    const messages = [textMessage(`shp-${Date.now()}`, framed)];
    // T8-A（v1.15.65）：**不再**在这里 `if (!route) return []` —— 「无路由」这个判据
    // 只在 `streamText` 里判一次（原来两处各判一次，且这里那次**完全静默**）。
    // `onSkip` 把「为什么没有结果」接到降级台账上，读者才看得到（ADR-0049）。
    const text = await streamText(core.context, route, { label: "", system, messages, maxTokens, timeoutMs, onSkip: (reason, detail) => noteDegrade(core, "llmRecall", `${reason}${detail ? `（${detail}）` : ""}`, "召回排序退回确定性 bestTask：LLM 没有参与选任务，结果可能与你在 LLM 里看到的排序不一致") });
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
    const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
    const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
    const system = "你是知识树检索规划器（像人翻长文档定位正确章节）。给定查询与候选章节，选出最相关章节的编号（逗号分隔，从 0 开始，可多选）。只输出编号，不要解释、标点或 Markdown。";
    const framed = `查询：${query}\n候选章节：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.content ? " — " + c.content : ""}`).join("\n");
    const messages = [textMessage(`shk-${Date.now()}`, framed)];
    // T8-A：本条**不**与 `query/reads.ts:174` 的「（…LLM 导航未启用/失败 → 确定性检索）」重复 ——
    // 那一句说的是「**退到了**确定性检索」（在输出里就地可见），这里补的是「**因为什么**」
    // 退的（`no-route` / `llm-service-unavailable` / `llm-finish-error` / `llm-error`）。
    // 两者受众不同层级，不合并；`streamText` 里那次「无路由」判据也因此只判一次。
    const text = await streamText(core.context, route, { label: "", system, messages, maxTokens, timeoutMs, onSkip: (reason, detail) => noteDegrade(core, "knowledgeNavigate", `${reason}${detail ? `（${detail}）` : ""}`, "知识树导航退回确定性 `retrieveKnowledge`：LLM 没有参与选章节，引用可能与 LLM 的直觉不一致") });
    const idxs = (String(text || "").match(/\d+/g) || []).map(Number).filter((i) => i >= 0 && i < candidates.length);
    return Array.from(new Set(idxs)).slice(0, 6);
  };

  const expandTerms = async (topic: string) => {
    if (core.recallCfg.enabled !== true) return [];
    const route = routeFor(core, core.recallCfg);
    const maxTokens = Math.max(1, Number(core.recallCfg.maxTokens) || 60);
    const timeoutMs = Math.max(1, Number(core.recallCfg.timeoutMs) || 6000);
    const system = "你是检索扩词助手。给定一个主题/入口，输出 5~10 个最相关的检索词，每行一个，只输出词本身，不要编号、解释或标点。";
    const messages = [textMessage(`shadow-r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, topic)];
    // T8-A（T8 第 3 条）：`README.md` 自己写着「**静默**退回 A 档」，而代码此前**一条信号都没给**。
    // 「文档已承认」不等于「有信号」—— 承认写在文档里，读者在输出里看不到。
    const text = await streamText(core.context, route, { label: "recall expand", system, messages, maxTokens, timeoutMs, onSkip: (reason, detail) => noteDegrade(core, "recallExpansion", `${reason}${detail ? `（${detail}）` : ""}`, "语义扩词为空 ⇒ 退回 A 档（只用原始主题词匹配）：召回面比配置预期窄，属于「没搜到」而非「不存在」") });
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
    // T8-A：降级留痕的**对外唯一入口**（`query/*` 经 `ShadowQueryDeps.noteDegrade` 拿它）。
    noteDegrade: (capability: string, reason: string, effect: string) => noteDegrade(core, capability, reason, effect),
    expandTerms,
    recallSelect,
    knowledgeNavigate,
    ensureIndex: materialize.ensureIndex,
    // T17-B（D6 门③）：派生索引的写侧精确信号 —— 读侧取走（`ShadowQueryDeps.derivedIndexDirty`），
    // **成功 upsert 后**才经 `clearDerivedDirty` 消费（回退路径保留 ⇒ `patchSummary` 的原地改写不会丢）。
    derivedDirtyFor: (ws: string) => dirtyRelsFor(core, ws),
    clearDerivedDirty: (ws: string, rels: Iterable<string>) => clearDerivedDirty(core, ws, rels),
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
