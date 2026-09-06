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

import type { AgentLike, EvidenceMatch, EvidenceProvider, EvidenceRef, EvidenceResult, EvidenceStatus, EvidenceFreshness, ShadowConfig, ShadowScope, ShadowScopeKind } from "./core/types.js";
import { firstNonEmpty, resolveShadowScope, resolveWorkspace } from "./core/scope.js";
import { pad, today, stamp, compact, slug, normalize, under, component, topicsInText, ageDaysOf, RECALL_PREFIX, tokenize } from "./core/util.js";
import { readRel, listMemories } from "./persistence/files.js";
import { readMeta, writeMeta } from "./persistence/meta.js";
import { scoreMemory, breakdownOf, confidenceOf, snippetFor, memorySummary, tierFor } from "./retrieval/rank.js";
import { renderByTier, noMatchText } from "./retrieval/render.js";
import { readLedger, writeLedger } from "./retrieval/ledger.js";
import { fsEvidenceProvider, fsExists } from "./evidence/filesystem.js";
import { zgEvidenceProvider, zgVerify, runZg, parseZgMatches } from "./evidence/zg.js";
import { builtinEvidenceProviders, routeVerify } from "./evidence/gateway.js";
import { evidencePathsOf, isPathLike } from "./evidence/paths.js";
import { experienceOf, renderExperience } from "./core/experience.js";
import { judgmentOf, renderJudgment } from "./core/judgment.js";
import { lifecycleOf } from "./core/lifecycle.js";
import { readSoul, soulText } from "./soul/soul.js";
import { tasteOf, renderTaste } from "./soul/taste.js";
import { evidenceOf, provenanceText, newestByEntryOf, verdictOf, conflictOf } from "./observer/arbitrate.js";
import { kgTrace } from "./observer/observer.js";
import { projectContext, renderProjection } from "./observer/projection.js";
import { extractMessage, goalText, classifyUser } from "./core/collect.js";
import { buildClueHeader, registerMeta } from "./core/memory.js";
import { sigmoid, hotnessOf } from "./core/lifecycle.js";
import { SECRET_PATTERNS, UNSAFE_CONTROL, sanitizeText, isUnsafe, scrubUnsafe, SYSTEM_TAG_NAMES, SYSTEM_TAG_RE, SYSTEM_TAG_RESIDUE_RE, stripSystemScaffold, SYSTEM_SCAFFOLD_MARKERS, isScaffoldBlock, INJECTION_PHRASES, scrubFinal, referencedMaterials } from "./security/scrub.js";
export type { EvidenceMatch, EvidenceProvider, EvidenceRef, EvidenceResult, ShadowConfig, ShadowScope, ShadowScopeKind } from "./core/types.js";
export { firstNonEmpty, resolveShadowScope, resolveWorkspace } from "./core/scope.js";

export const name = "dsh-shadow";
export const inject: string[] = [];

type CtxLike = any;

export function apply(ctx: CtxLike, rawConfig: ShadowConfig = {}) {
  const context: CtxLike = ctx;
  // 配置读取：测试直接传 rawConfig；live 走 Cordis 的 ctx.config（插件行 config，经 cordis.patch.yml 注入）。
  const config: ShadowConfig =
    rawConfig && Object.keys(rawConfig).length
      ? rawConfig
      : (() => { try { return (ctx?.config ?? {}) as ShadowConfig; } catch { return {}; } })() ?? {};
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
  const agentById = (id: string | undefined): any => {
    if (!id) return undefined;
    try {
      return context.get("agents")?.get(id);
    } catch {
      return undefined;
    }
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
      void flush(agentById(agentId) || { id: agentId });
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
    lines.push("`shadow/` 是 agent 思维/上下文/灵魂的投影——每条记忆都是一个文件。");
    lines.push("格式：`shadow/<日期>/<时刻>-<入口slug>.md`；记忆以「入口点+时间」为纲，思维/决策为正文。");
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
      const t = await fs.resolve(`${ws}/shadow/_index.md`, { cwd: ws });
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

  // 安全清洗已迁移至 security/scrub.ts（v0.14 拆内核），此处按需 import 使用。
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
    } catch (e: any) {
      lastFlushError = { at: Date.now(), err: (e && e.message) || String(e) };
      console.error("[dsh-shadow][error] flush FAILED:", lastFlushError.err);
    }
  };

  context.on("fs/observed", (target: any, observation: any, actor: any) => {
    const abs = (target && (target.displayPath || target.targetKey)) || "";
    if (!abs) return undefined;
    const id = agentIdOf(actor) || initiatorId();
    if (!id) return undefined;
    const ws = resolveWorkspace(agentById(id), cwdBySession, config) || "";
    push(id, { kind: "action", text: `改/读 ${under(abs, ws) || abs}`, comp: component(abs, ws), source: "fs" });
    return undefined;
  });

  context.on("tools/result", (exec: any) => {
    const id = exec?.agent?.id || initiatorId();
    const tool = exec?.tool?.name || exec?.toolName || exec?.name || exec?.tool || "tool";
    push(id, { kind: "action", text: `调用 ${tool}`, comp: tool, source: "tool" });
    return undefined;
  });

  context.on("goal/changed", (payload: any) => {
    const gid = payload?.agent?.id;
    const obj = payload?.change?.objective || payload?.change?.goal?.objective || "";
    if (gid && obj) goalByAgent.set(String(gid), String(obj).slice(0, 120));
    push(gid, { kind: "decision", text: `决定 ${goalText(payload?.change)}`, comp: "", source: "goal" });
    return undefined;
  });

  context.on("session/event", (session: any, event: any) => {
    const sid = session?.id;
    const cwd = session?.header?.cwd;
    if (sid && cwd) cwdBySession.set(String(sid), cwd);
    const m = extractMessage(event);
    if (!m) return undefined;
    const id = agentById(sid)?.id || (sid ? String(sid) : undefined) || initiatorId();
    const tag = m.kind === "user" ? "用户" : "我";
    const sub = m.kind === "user" ? classifyUser(m.text) : "";
    push(id, { kind: m.kind, text: `${tag}：${sanitizeText(m.text)}`, comp: "", sub, source: m.kind });
    return undefined;
  });

  context.on("agent/turn-stopping", async (payload: any) => {
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
  const verifyEvidence = (ref: EvidenceRef, ctx: any): Promise<EvidenceResult> => routeVerify(ref, ctx, config.evidenceProvider || "fs", config.evidenceProviders);
  // ⑥ 工程知识图谱（起步地基）：从记忆树派生「组件/域 → 依赖 → 相关记忆」的可查询索引，`kg:true` 时输出邻接追踪。
  // 节点：组件（记忆 title = 路径/域）、域（路径首段）；边：组件→域（belongs_to）、组件→证据路径（depends_on/changed_by）、组件↔记忆（related_to）。
  // ── v0.13 Judgment / Taste ─────────────────────────────────────────────
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
  if (typeof context.inject === "function") {
    context.inject(["tools"], (toolsCtx: CtxLike) => {
      const toolsService = toolsCtx.get("tools");
      if (!toolsService) return;
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
        output: { schema: { type: "string" }, render: (_args: any, value: string) => [{ type: "text", text: value }] },
        async execute(args: any, exec: any) {
          const agent: AgentLike | undefined = exec?.agent;
          const ws = resolveWorkspace(agent, cwdBySession, config);
          if (!ws) return "（无法确定工作区，shadow 不可用）";
          const fs = context.get("fs");
          if (!fs) return "（fs 服务不可用）";
          // 落盘失败信号：把「数据不可达」与「召回不足」区分开，避免误判插件召回能力。
          const flushWarn = lastFlushError
            ? `\n\n> ⚠ shadow 最近一次落盘失败（${new Date(lastFlushError.at).toISOString()}：${lastFlushError.err}）。你读到的可能是旧/不完整记忆；请先确认 shadowRoot 可写，勿把「数据不可达」当作「召回不足」。`
            : "";
          if (args?.soul) {
            const soul = await readSoul(fs, ws);
            if (!soul) return scrubFinal(RECALL_PREFIX + "（无 Soul 配置：可在 shadow/soul/soul.json 定义 身份/价值观/原则/品味/边界）" + flushWarn);
            return scrubFinal(RECALL_PREFIX + soulText(soul) + flushWarn);
          }
          if (args?.taste) {
            const soul = await readSoul(fs, ws);
            const t = await tasteOf(fs, ws, soul);
            return scrubFinal(RECALL_PREFIX + renderTaste(t) + flushWarn);
          }
          const topic = String(args?.topic || "").trim();
          if (!topic) {
            const idx = await readRel(fs, ws, "shadow/_index.md");
            return scrubFinal(RECALL_PREFIX + (idx || "（暂无 shadow 索引）") + flushWarn);
          }
          const limit = Math.max(1, Math.min(30, Number(args?.limit) || 10));
          const maxTokens = Math.max(256, Math.min(8000, Number(args?.max_tokens) || 1600));
          const maxChars = maxTokens * 4;
          let memories = await listMemories(fs, ws);
          const debugMode = recallCfg.debug === true || Boolean(args?.debug);
          const diag: string[] = [];
          const asOf = /^\d{4}-\d{2}-\d{2}$/.test(String(args?.asOf || "")) ? String(args.asOf) : "";
          const observerMode = Boolean(args?.observer);
          if (asOf) memories = memories.filter((m: any) => m.date <= asOf);
          if (debugMode) diag.push(`候选 ${memories.length}${asOf ? ` · asOf<=${asOf}` : ""}`);
          let tokens = tokenize(topic);
          if (!tokens.length) tokens = [String(topic).toLowerCase()];
          if (recallCfg.enabled === true && recallCfg.provider && recallCfg.model) {
            const extra = await expandTerms(topic);
            if (extra.length) tokens = Array.from(new Set([...tokens, ...extra]));
          }
          if (args?.project) {
            const soul = await readSoul(fs, ws);
            const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
            const p = await projectContext(fs, ws, memories, topic, soul, verifyEvidence);
            return scrubFinal(RECALL_PREFIX + renderProjection(p, topic, project) + flushWarn);
          }
          if (args?.judgment) {
            const js = await judgmentOf(fs, ws, memories, topic);
            return scrubFinal(RECALL_PREFIX + renderJudgment(js) + flushWarn);
          }
          if (args?.verify) {
            // Evidence Gateway 验证：对匹配记忆的证据路径逐个 verifyEvidence，报告 EvidenceResult。
            const texts: any[] = [];
            for (const mm of memories) {
              const text = await readRel(fs, ws, mm.rel);
              if (!text) continue;
              const exp = experienceOf(text, mm);
              const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
              if (tokens.some((t) => hay.includes(t))) texts.push(text);
            }
            const rows: string[] = [];
            const ctx = { fs, ws };
            for (const text of texts.slice(0, 3)) {
              for (const p of evidencePathsOf(text).filter(isPathLike).slice(0, 6)) {
                const r = await verifyEvidence({ path: p, kind: "path" }, ctx);
                rows.push(`${r.status}  ${p}  (provider=${r.source} · freshness=${r.freshness} · conf=${r.confidence.toFixed(2)})`);
              }
            }
            return scrubFinal(RECALL_PREFIX + "[Evidence Verify]" + (rows.length ? "\n" + rows.join("\n") : "\n（无可验证证据路径）") + flushWarn);
          }
          if (args?.experience) {
            const matched: any[] = [];            const entryList: any[] = [];
            for (const mm of memories) {
              const text = await readRel(fs, ws, mm.rel);
              if (!text) continue;
              const exp = experienceOf(text, mm);
              entryList.push({ entry: exp.situation, date: mm.date, time: mm.time });
              const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
              if (tokens.some((t) => hay.includes(t))) matched.push({ exp, mm, text });
            }
            if (!matched.length) return noMatchText(topic, flushWarn);
            const newest = newestByEntryOf(entryList);
            const exps: any[] = [];
            for (const { exp, mm, text } of matched) {
              const conflict = await conflictOf(fs, ws, text, verifyEvidence);
              const v = verdictOf(conflict.missing.length, exp.situation, mm.date, mm.time, newest);
              exp.verdict = v.verdict; exp.outcome = v.outcome; exp.reflection = v.reflection;
              exps.push(exp);
            }
            return scrubFinal(RECALL_PREFIX + exps.map(renderExperience).join("\n\n") + flushWarn);
          }
          const scored: any[] = [];
          const entryList: any[] = [];
          const meta = await readMeta(fs, ws);
          const halfLife = Math.max(0.01, Number(retentionCfg.halfLifeDays) || 7);
          for (const mm of memories) {
            const text = await readRel(fs, ws, mm.rel);
            if (!text) continue;
            const entry = (text.match(/^# (.+)$/m) || [])[1] || "";
            entryList.push({ entry, date: mm.date, time: mm.time });
            const tier = tierFor(text);
            let score = scoreMemory(text, mm.rel, entry, tokens);
            // P4：来源解析（写侧记录 `> 来源会话：`）；旧数据无该行视为同址，不额外标注，避免误伤。
            const originM = text.match(/^> 来源会话：(.+)$/m);
            const origin = originM ? scrubUnsafe(originM[1]).trim() : "";
            // P3：过时判定——默认按 age 超阈值；retention 开启时再叠加状态/热度。
            const staleDays = Math.max(1, Number(retentionCfg.staleDays) || 7);
            let stale = ageDaysOf(mm.rel) >= staleDays;
            if (retentionCfg.enabled) {
              const rec = meta[mm.rel];
              if (rec && rec.status && rec.status !== "active" && !rec.pinned) continue;
              const h = hotnessOf(rec ? rec.hits : 0, ageDaysOf(mm.rel), halfLife);
              score = score * (0.5 + h * 2);
              if (rec && rec.status === "stale") stale = true;
              if (h < 0.15) stale = true;
            }
            if (score > 0) {
              // ③ 轻量冲突检测：证据路径在当前工作区缺失 → 降权 + 标记 stale/冲突（该记忆可能已过时/源码已改）。
              const conflict = await conflictOf(fs, ws, text, verifyEvidence);
              if (conflict.missing.length) { score = score * 0.5; stale = true; }
              const ev: any = evidenceOf(text, mm, meta, stale);
              ev.conflict = conflict.missing.length;
              ev.lifecycle = lifecycleOf(meta[mm.rel], ageDaysOf(mm.rel), conflict.missing.length, stale);
              scored.push({ mm, text, entry, tier, score, tokens, origin, stale, currentOrigin: agent?.id, provenance: provenanceText(ev), evidence: ev, breakdown: breakdownOf(text, mm.rel, entry, tokens), conflict: conflict.missing, observer: observerMode, asOf });
            }
          }
          // Memory ≠ Evidence 裁决：证据存在性 + 同入口更新记忆 → fresh/stale/superseded + 结果 + 反思。
          const newest = newestByEntryOf(entryList);
          for (const s of scored) {
            const v = verdictOf(s.evidence.conflict || 0, s.entry, s.mm.date, s.mm.time, newest);
            s.superseded = v.superseded; s.verdict = v.verdict; s.outcome = v.outcome; s.reflection = v.reflection;
            if (v.superseded) s.score = s.score * 0.7;
            s.evidence.verdict = v.verdict; s.evidence.outcome = v.outcome; s.evidence.reflection = v.reflection;
            s.provenance = provenanceText(s.evidence);
          }
          scored.sort((a, b) => b.score - a.score || b.mm.date.localeCompare(a.mm.date));
          if (debugMode) diag.push(`命中（打分>0）${scored.length}`);
          if (!scored.length) return noMatchText(topic, flushWarn) + (debugMode ? "\n\n" + diag.join("\n") : "");
          const cooldownTurns = Math.max(0, Number(recallCfg.cooldownTurns) || 0);
          const ledger = await readLedger(fs, ws);
          const turn = (ledger.turn || 0) + 1;
          const available: any[] = [];
          let cooledCount = 0;
          for (const s of scored) {
            const rec = ledger.served && ledger.served[s.mm.rel];
            const cooled = cooldownTurns > 0 && rec && rec.detail && typeof rec.turn === "number" && turn - rec.turn <= cooldownTurns;
            if (cooled) { if (debugMode) diag.push(`降权·cooldown ${s.mm.rel}`); cooledCount++; continue; }
            available.push(s);
          }
          if (debugMode) diag.push(`可用（未冷却）${available.length}${cooledCount ? ` · 冷却 ${cooledCount}` : ""}`);
          if (!available.length) return noMatchText(topic, flushWarn) + (debugMode ? "\n\n" + diag.join("\n") : "");
          const n = available.length;
          const parts: string[] = [];
          let used = 0;
          const servedDetail: string[] = [];
          for (const s of available) {
            if (parts.length >= limit) break;
            const sharedPool = Math.max(0, Math.floor((maxChars - used) / Math.max(1, n)));
            const cap = Math.max(120, Math.floor((maxChars / n) * 2) + sharedPool);
            let render = renderByTier(s, cap, false, tokens);
            if (used + render.length > maxChars) {
              const degraded = renderByTier(s, cap, true, tokens);
              if (used + degraded.length > maxChars) break;
              render = degraded;
            }
            parts.push(render);
            used += render.length;
            if (debugMode) {
              const b = s.breakdown || {};
              diag.push(`返回 ${s.mm.rel} · 命中 ${s.score} · 入口${b.entry || 0} 主题${b.topic || 0} 路径${b.path || 0} 正文${b.body || 0}${s.evidence ? ` · 状态${s.evidence.status}` : ""}`);
            }
            if (s.tier !== "L0" && render.includes("…")) servedDetail.push(s.mm.rel);
          }
          if (debugMode) diag.push(`预算 ${maxChars} 字 · 返回 ${parts.length} 条`);
          if (cooldownTurns > 0 && servedDetail.length) {
            const nextServed = Object.assign({}, ledger.served || {});
            for (const p of servedDetail) nextServed[p] = { turn, detail: true };
            for (const k of Object.keys(nextServed)) {
              if (turn - nextServed[k].turn > cooldownTurns * 4) delete nextServed[k];
            }
            const keys = Object.keys(nextServed);
            if (keys.length > 500) {
              keys.sort((a, b) => (nextServed[a].turn || 0) - (nextServed[b].turn || 0)).slice(0, keys.length - 500).forEach((k) => delete nextServed[k]);
            }
            await writeLedger(fs, ws, { turn, served: nextServed });
          }
          if (servedDetail.length) {
            const next = await readMeta(fs, ws);
            const observer = agent?.id ? String(agent.id) : "";
            for (const p of servedDetail) {
              const rec = next[p] || { created: today(), hits: 0, status: "active", confidence: 0.5, pinned: false, createdBy: "", confirmedBy: [] };
              rec.hits = (rec.hits || 0) + 1;
              rec.lastSeen = turn;
              // ② 独立确认计数：由非创建者的其它 session/agent 读取 → 记入 confirmedBy（去重、封顶 10），
              // 用于生命周期 VERIFIED/TRUSTED 的状态推导。
              if (observer) {
                const cb = Array.isArray(rec.confirmedBy) ? rec.confirmedBy : [];
                if (observer !== (rec.createdBy || "") && !cb.includes(observer)) { cb.push(observer); rec.confirmedBy = cb.slice(-10); }
              }
              next[p] = rec;
            }
            await writeMeta(fs, ws, next);
          }
          const kgBlock = args?.kg ? await kgTrace(fs, ws, memories, topic) : "";
          return scrubFinal(RECALL_PREFIX + (kgBlock ? kgBlock + "\n\n" : "") + (debugMode ? diag.join("\n") + "\n\n" : "") + parts.join("\n\n") + flushWarn);
        },
      });
    });
  }

  if (typeof context.inject === "function") {
    context.inject(["systemPrompt"], (promptCtx: CtxLike) => {
      const systemPrompt = promptCtx.get("systemPrompt");
      if (!systemPrompt) return;
      systemPrompt.context({
        name: "dsh-shadow",
        order: 40,
        text: () =>
          "你的思维、上下文与决策沉淀在 shadow 记忆树中。如果发现当前上下文不足、需要回忆最近想过/决定过什么，" +
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
