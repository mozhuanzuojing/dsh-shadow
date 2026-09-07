// dsh-shadow —— core/writer.ts：写侧采集内核（v0.14 Phase 5b）。
// 采集「一切皆文件」记忆树的写侧状态机：事件 → pending 累积 → flush 落盘 → 索引/摘要/meta 物化。
// index.ts 只做 Cordis Adapter 接线（事件 wire + 工具注册 + config），本模块封装领域逻辑。
import { SHADOW_ROOT } from "./paths.js";
import type { AgentLike, ShadowConfig } from "./types.js";
import { resolveWorkspace } from "./scope.js";
import { today, stamp, compact, slug, under, component, topicsInText, tokenize } from "./util.js";
import { readRel, listMemories } from "../persistence/files.js";
import { extractMessage, goalText, classifyUser } from "./collect.js";
import { buildClueHeader, registerMeta } from "./memory.js";
import { traceOf } from "./trace.js";
import { sanitizeText, isUnsafe } from "../security/scrub.js";

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

export function createShadowCollector(opts: ShadowCollectorOpts): ShadowCollector {
  const { context, config, getAgentById } = opts;

  // 采集落盘可靠性：记录最近一次落盘失败，read_shadow 用于区分「数据不可达」与「召回不足」。
  let lastFlushError: { at: number; err: string } | undefined;
  // pending 超阈值即异步落盘，避免依赖单一 turn-stopping 事件导致积压不落盘。
  const MAX_PENDING = 60;
  const initiatorId = (): string | undefined => {
    try {
      const agents = context.get("agents");
      return agents ? agents.currentInitiator()?.id : undefined;
    } catch {
      return undefined;
    }
  };
  const agentIdOf = (thing: any): string | undefined => {
    if (!thing || typeof thing !== "object") return undefined;
    const nested = thing.agent && typeof thing.agent === "object" ? thing.agent.id : undefined;
    const direct = typeof thing.id === "string" ? thing.id : undefined;
    return (typeof nested === "string" && nested) || direct || undefined;
  };

  // pending[agentId] = [{ time, kind, text, comp, sub?, source? }]
  const pending = new Map<string, any[]>();
  const comps = new Map<string, string[]>();
  const cwdBySession = new Map<string, string>();
  const goalByAgent = new Map<string, string>();
  const push = (agentId: string | undefined, rec: any) => {
    if (!agentId) return;
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
      void flush(getAgentById(agentId) || { id: agentId });
    }
  };
  const primaryComp = (agentId: string) => {
    const cs = comps.get(agentId) || [];
    if (!cs.length) return "";
    const tally: Record<string, number> = {};
    for (const c of cs) tally[c] = (tally[c] || 0) + 1;
    return Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  };

  const summaryCfg = config.summary ?? {};
  const recallCfg = config.recall ?? {};
  const retentionCfg = config.retention ?? {};
  const writeConsent = config.writeConsent === true;
  const routeFor = (cfg: any = summaryCfg) => {
    const explicit = cfg.provider && cfg.model ? { provider: cfg.provider as string, model: cfg.model as string } : undefined;
    if (explicit) return explicit;
    try {
      const sel = context.get("agentDefaultModel")?.currentSelection();
      return sel?.provider && sel?.model ? { provider: sel.provider, model: sel.model } : undefined;
    } catch {
      return undefined;
    }
  };
  const summarizeTurn = async (agent: any, body: unknown) => {
    if (summaryCfg.enabled === false) return "";
    const llm = context.get("llm");
    if (!llm) return "";
    const route = routeFor();
    if (!route) return "";
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
        if (!chunk) continue;
        if (chunk.type === "text-delta" && chunk.text) text += chunk.text;
        else if (chunk.type === "finish") {
          if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted") return "";
          break;
        }
      }
      const one = String(text || "").replace(/\s+/g, " ").trim();
      return one ? one.slice(0, 120) : "";
    } catch (e: any) {
      console.log("[dsh-shadow] summarize skipped:", e && e.message);
      return "";
    } finally {
      clearTimeout(timer);
    }
  };

  const buildIndexText = (ws: string, memories: any[], topicFiles: Record<string, string[]>, todayInfo: { count: number; topics: string[] }) => {
    const byDate: Record<string, any[]> = {};
    for (const mm of memories) (byDate[mm.date] = byDate[mm.date] || []).push(mm);
    const lines: string[] = [];
    lines.push("# shadow 目录说明与索引");
    lines.push("");
    lines.push("`.shadow/` 是 agent 思维/上下文/灵魂的投影——每条记忆都是一个文件。");
    lines.push("格式：`.shadow/<日期>/<时刻>-<入口slug>.md`；记忆以「入口点+时间」为纲，思维/决策为正文。");
    lines.push("默认入口：`read_shadow` 无参读本索引；带 `topic`/`entry` 穿透到具体记忆文件。");
    lines.push("");
    lines.push(`工作区：\`${ws}\``);
    lines.push("");
    lines.push("## 今日摘要");
    if (todayInfo && todayInfo.count > 0) {
      lines.push(`今日 ${todayInfo.count} 条记忆${todayInfo.topics.length ? `，主题：${todayInfo.topics.slice(0, 10).join("、")}` : ""}。`);
    } else {
      lines.push("（今日暂无）");
    }
    lines.push("");
    lines.push("## 近期记忆（按日期）");
    const dates = Object.keys(byDate).sort().reverse();
    if (dates.length) {
      for (const dt of dates) {
        lines.push(`- ${dt}/`);
        for (const mm of byDate[dt].sort((a, b) => a.name.localeCompare(b.name))) lines.push(`  - \`${mm.name}\``);
      }
    } else {
      lines.push("（暂无）");
    }
    lines.push("");
    lines.push("## 主题索引（入口/主题 → 记忆文件）");
    const topics = Object.keys(topicFiles).sort();
    if (topics.length) {
      for (const t of topics) lines.push(`- \`${t}\` → ${[...new Set(topicFiles[t])].join("、")}`);
    } else {
      lines.push("（暂无）");
    }
    lines.push("");
    lines.push("## 意识轨迹（按时间，可反推方向）");
    const sorted = [...memories].sort((a, b) => (a.date === b.date ? (a.time || "").localeCompare(b.time || "") : a.date.localeCompare(b.date)));
    if (sorted.length) {
      for (const mm of sorted) lines.push(`- ${mm.date} ${mm.time || "??????"} \`${mm.name}\``);
    } else {
      lines.push("（暂无）");
    }
    return lines.join("\n");
  };

  const rebuildIndex = async (fs: any, ws: string) => {
    if (!fs || !ws) return;
    try {
      const memories = await listMemories(fs, ws);
      const topicFiles: Record<string, string[]> = {};
      const todayStr = today();
      const todayTopics = new Set<string>();
      let todayCount = 0;
      for (const mm of memories) {
        const text = await readRel(fs, ws, mm.rel);
        const tops = topicsInText(text, slug(mm.name));
        for (const t of tops) (topicFiles[t] = topicFiles[t] || []).push(mm.rel);
        if (mm.date === todayStr) {
          todayCount++;
          for (const t of tops) todayTopics.add(t);
        }
      }
      const idx = buildIndexText(ws, memories, topicFiles, { count: todayCount, topics: [...todayTopics] });
      const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_index.md`, { cwd: ws });
      await fs.writeText(t, idx);
    } catch (e: any) {
      console.log("[dsh-shadow] rebuildIndex failed:", e && e.message);
    }
  };

  const patchSummary = async (fs: any, ws: string, rel: string, entry: string, arr: any[]) => {
    const summary = await summarizeTurn(null, arr.map((e) => `- [${e.comp || entry}] ${e.text}`).join("\n"));
    if (!summary) return;
    try {
      const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
      const existing = await fs.readText(t);
      const patched = existing.replace(/^(# .+\n\n)/, `$1> 摘要：${summary}\n\n`);
      if (patched !== existing) {
        await fs.writeText(t, patched);
        await rebuildIndex(fs, ws);
      }
    } catch (e: any) {
      console.log("[dsh-shadow] summarize patch failed:", e && e.message);
    }
  };

  const flush = async (agent: AgentLike | undefined) => {
    const id = agent?.id;
    const arr = pending.get(id || "");
    if (!arr || !arr.length) {
      if (id) { pending.delete(id); comps.delete(id); }
      return;
    }
    // P5 默认回写显式同意：writeConsent=true 时，仅当本回合含"用户显式要求记忆"的措辞才落盘；
    // 否则只累积（保留 pending，不删除、不写文件），避免静默持久化用户未要求的上下文。
    if (writeConsent && !arr.some((e) => e.kind === "user" && /(记住|记得|记一下|记下来|记忆|沉淀|存档|保存|日后|以后|写入记忆|记下)/.test(String(e.text || "")))) {
      return;
    }
    if (id) pending.delete(id);
    const entry = primaryComp(id || "") || "shadow";
    if (id) comps.delete(id);
    const ws = resolveWorkspace(agent, cwdBySession, config);
    const fs = context.get("fs");
    if (!ws || !fs) return;
    try {
      const rel = `${SHADOW_ROOT}/${today()}/${compact()}-${slug(entry)}.md`;
      const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
      const head = `# ${entry}\n\n`;
      const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
      const extra = { project, agent: id ? String(id) : undefined, goal: goalByAgent.get(String(id || "")) };
      const clue = buildClueHeader(entry, arr, id, extra);
      // 事件 → Trace → Memory：正常化采集源为有序 Trace，再据此塑形正文（输出保持一致）。
      const traces = traceOf(arr, id);
      const bodyLines = traces.map((t) => `- [${t.at}] [${t.comp || entry}] ${sanitizeText(t.text)}`).filter((l) => !isUnsafe(l));
      const body = bodyLines.length ? bodyLines.join("\n") : "- （本回合无可安全记录的正文）";
      await fs.writeText(t, `${head}${clue}${body}\n`);
      await rebuildIndex(fs, ws);
      await registerMeta(fs, ws, rel, id, retentionCfg.enabled === true);
      void patchSummary(fs, ws, rel, entry, arr);
    } catch (e: any) {
      lastFlushError = { at: Date.now(), err: (e && e.message) || String(e) };
      console.error("[dsh-shadow][error] flush FAILED:", lastFlushError.err);
    }
  };

  const onFsObserved = (target: any, observation: any, actor: any) => {
    const abs = (target && (target.displayPath || target.targetKey)) || "";
    if (!abs) return undefined;
    const id = agentIdOf(actor) || initiatorId();
    if (!id) return undefined;
    const ws = resolveWorkspace(getAgentById(id), cwdBySession, config) || "";
    push(id, { kind: "action", text: `改/读 ${under(abs, ws) || abs}`, comp: component(abs, ws), source: "fs" });
    return undefined;
  };

  const onToolsResult = (exec: any) => {
    const id = exec?.agent?.id || initiatorId();
    const tool = exec?.tool?.name || exec?.toolName || exec?.name || exec?.tool || "tool";
    push(id, { kind: "action", text: `调用 ${tool}`, comp: tool, source: "tool" });
    return undefined;
  };

  const onGoalChanged = (payload: any) => {
    const gid = payload?.agent?.id;
    const obj = payload?.change?.objective || payload?.change?.goal?.objective || "";
    if (gid && obj) goalByAgent.set(String(gid), String(obj).slice(0, 120));
    push(gid, { kind: "decision", text: `决定 ${goalText(payload?.change)}`, comp: "", source: "goal" });
    return undefined;
  };

  const onSessionEvent = (session: any, event: any) => {
    const sid = session?.id;
    const cwd = session?.header?.cwd;
    if (sid && cwd) cwdBySession.set(String(sid), cwd);
    const m = extractMessage(event);
    if (!m) return undefined;
    const id = getAgentById(sid)?.id || (sid ? String(sid) : undefined) || initiatorId();
    const tag = m.kind === "user" ? "用户" : "我";
    const sub = m.kind === "user" ? classifyUser(m.text) : "";
    push(id, { kind: m.kind, text: `${tag}：${sanitizeText(m.text)}`, comp: "", sub, source: m.kind });
    return undefined;
  };

  const onTurnStopping = async (payload: any) => {
    await flush(payload && payload.agent);
    return undefined;
  };

  // 兜底：session 收口（session/flush）时把仍在 pending 的全部落盘，防遗漏/进程重启丢数据。
  const onSessionFlush = async () => {
    for (const id of [...pending.keys()]) {
      await flush(getAgentById(id) || { id });
    }
    return undefined;
  };

  const expandTerms = async (topic: string) => {
    if (recallCfg.enabled !== true) return [];
    const llm = context.get("llm");
    if (!llm) return [];
    const route = routeFor(recallCfg);
    if (!route) return [];
    const maxTokens = Math.max(1, Number(recallCfg.maxTokens) || 60);
    const timeoutMs = Math.max(1, Number(recallCfg.timeoutMs) || 6000);
    const system = "你是检索扩词助手。给定一个主题/入口，输出 5~10 个最相关的检索词，每行一个，只输出词本身，不要编号、解释或标点。";
    const messages = [{ id: `shadow-r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, role: "user", content: [{ type: "text", text: topic }], source: { kind: "plugin", plugin: "dsh-shadow" } }];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let text = "";
      for await (const chunk of llm.stream({ provider: route.provider, model: route.model, messages, system, maxTokens, signal: controller.signal })) {
        if (!chunk) continue;
        if (chunk.type === "text-delta" && chunk.text) text += chunk.text;
        else if (chunk.type === "finish") {
          if (chunk.reason?.kind === "error" || chunk.reason?.kind === "aborted") return [];
          break;
        }
      }
      return tokenize(text).slice(0, 10);
    } catch (e: any) {
      console.log("[dsh-shadow] recall expand skipped:", e && e.message);
      return [];
    } finally {
      clearTimeout(timer);
    }
  };

  const getFlushWarn = () =>
    lastFlushError
      ? `\n\n> ⚠ shadow 最近一次落盘失败（${new Date(lastFlushError.at).toISOString()}：${lastFlushError.err}）。你读到的可能是旧/不完整记忆；请先确认 shadowRoot 可写，勿把「数据不可达」当作「召回不足」。`
      : "";

  const cleanup = () => {
    pending.clear();
    comps.clear();
  };

  return {
    cwdBySession,
    push,
    getFlushWarn,
    expandTerms,
    onFsObserved,
    onToolsResult,
    onGoalChanged,
    onSessionEvent,
    onTurnStopping,
    onSessionFlush,
    cleanup,
  };
}
