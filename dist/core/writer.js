// dsh-shadow —— core/writer.ts：写侧采集内核（v0.14 Phase 5b）。
// 采集「一切皆文件」记忆树的写侧状态机：事件 → pending 累积 → flush 落盘 → 索引/摘要/meta 物化。
// index.ts 只做 Cordis Adapter 接线（事件 wire + 工具注册 + config），本模块封装领域逻辑。
import { SHADOW_ROOT } from "./paths.js";
import { resolveWorkspace } from "./scope.js";
import { today, stamp, compact, slug, under, component, topicsInText, tokenize } from "./util.js";
import { readRel, listMemories } from "../persistence/files.js";
import { readMeta, writeMeta } from "../persistence/meta.js";
import { extractMessage, goalText, classifyUser, extractDecisionStatement, extractReason } from "./collect.js";
import { buildClueHeader, registerMeta } from "./memory.js";
import { traceOf } from "./trace.js";
import { streamText, textMessage } from "./writer-llm.js";
import { parseMemory, deriveEpisodes, episodesIndexText } from "./episode.js";
import { isForgettable, oldestBeyond, isCompacted } from "./forget.js";
import { sanitizeText, isUnsafe } from "../security/scrub.js";
export function createShadowCollector(opts) {
    const { context, config, getAgentById } = opts;
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
    // pending[agentId] = [{ time, kind, text, comp, sub?, source? }]
    const pending = new Map();
    const comps = new Map();
    const cwdBySession = new Map();
    const goalByAgent = new Map();
    // L2 增量索引缓存：rel -> {date,time,name,entry,topics,parsed}。F5 性能热路径。
    // 避免每次 flush 都全量重读所有记忆文件（seq 读全量 O(N)），改为冷启动读一次、之后只读新增。
    // L2 增量索引缓存（按 workspace 隔离！）：ws -> Map<rel -> {entry,topics,parsed}>。
    const indexCache = new Map();
    const indexCacheWarm = new Set();
    const indexDirty = new Set(); // 索引为懒构建（derived artifact）：flush 仅置 dirty，读索引时才 ensureIndex。
    const forgetCfg = config.forget ?? {};
    const compactCfg = config.compact ?? {};
    const cacheFor = (ws) => { let c = indexCache.get(ws); if (!c) {
        c = new Map();
        indexCache.set(ws, c);
    } return c; };
    const recOf = (mm, text) => {
        const entry = (String(text || "").match(/^# (.+)$/m) || [])[1]?.trim() || "";
        let parsed = undefined;
        try {
            parsed = parseMemory(text, mm.rel, mm.name);
        }
        catch { /* 解析失败仅缺 episode/decision */ }
        return { date: mm.date, time: mm.time, name: mm.name, rel: mm.rel, entry, topics: topicsInText(text, slug(mm.name)), parsed };
    };
    const ensureIndexCache = async (fs, ws, skipForgotten) => {
        if (indexCacheWarm.has(ws))
            return;
        indexCacheWarm.add(ws); // 每个 workspace 只做一次全量读；之后靠 flush 增量增补。
        const cache = cacheFor(ws);
        const memories = await listMemories(fs, ws);
        for (const mm of memories) {
            if (skipForgotten(mm.rel))
                continue;
            const text = await readRel(fs, ws, mm.rel);
            if (text)
                cache.set(mm.rel, recOf(mm, text));
        }
    };
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
            void flush(getAgentById(agentId) || { id: agentId });
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
    const episodeCfg = config.episodes ?? {};
    const writeConsent = config.writeConsent === true;
    const episodeGap = Math.max(0, Number(episodeCfg.gapMinutes) || 60);
    const episodeShow = Math.max(0, Number(episodeCfg.showInIndex) || 8);
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
        const route = routeFor();
        if (!route)
            return "";
        const maxTokens = Math.max(1, Number(summaryCfg.maxTokens) || 80);
        const timeoutMs = Math.max(1, Number(summaryCfg.timeoutMs) || 8000);
        const system = "用一句话概括给定内容（这轮对话/动作的要点）。只用中文，不超过 40 个字；只输出这一句话，不加解释、引号、Markdown 或任何前缀。";
        const framed = String(body || "").trim().slice(0, 2000) || "（无正文）";
        const messages = [textMessage(`shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, framed)];
        const text = await streamText(context, route, { label: "summarize", system, messages, maxTokens, timeoutMs });
        const one = String(text || "").replace(/\s+/g, " ").trim();
        return one ? one.slice(0, 120) : "";
    };
    const buildIndexText = (ws, memories, topicFiles, todayInfo) => {
        const byDate = {};
        for (const mm of memories)
            (byDate[mm.date] = byDate[mm.date] || []).push(mm);
        const lines = [];
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
    // ── Episode 收口归档（B）：一个 episode 结束时把其 turn 原子合并成一个 consolidated 文件，
    //    个体原子 mark status=compacted 并移出活跃热集（文件保留、可回放；Forget≠Delete）。默认关。
    const compactSlug = (id) => String(id || "ep").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "ep";
    const consolidateText = (ep, atoms) => {
        const entry = (ep.entries && ep.entries[0]) || ep.title || "episode";
        const project = (atoms[0] && atoms[0].project) || ep.project || "";
        const agent = (atoms[0] && atoms[0].agent) || ep.agent || "";
        const date = (ep.startedAt || "").slice(0, 10);
        const materials = Array.from(new Set(atoms.flatMap((a) => a.materials || [])));
        const decisions = Array.from(new Set(atoms.flatMap((a) => a.decisions || [])));
        const actions = Array.from(new Set(atoms.flatMap((a) => a.actions || [])));
        const userMsgs = atoms.flatMap((a) => (a.thinkLines || []).filter((l) => /^用户：/.test(l)));
        const lines = [`# ${entry}`, "", "> 完整线索"];
        if (materials.length)
            lines.push(`> 背景/材料：${materials.slice(0, 8).join("、")}`);
        if (decisions.length)
            lines.push(`> 决策：${decisions.slice(0, 8).map((d) => `〔episode〕${d}`).join("；")}`);
        lines.push(`> 证据链：来源(决策·动作·用户) · 日期(${date}) · 证据(${materials.slice(0, 6).join("、") || "—"})`);
        lines.push(`> 概况：${actions.length} 动作 · ${userMsgs.length} 用户消息 · ${decisions.length} 决策`);
        if (project)
            lines.push(`> 项目：${project}`);
        if (agent)
            lines.push(`> Agent：${agent}`);
        lines.push(`> 汇总：由 ${atoms.length} 个原子记忆在 Episode 收口时合并（原始原子已归档移出活跃热集）`, "");
        const at = String(ep.startedAt || "").slice(11, 16) || "--:--";
        for (const d of decisions.slice(0, 20))
            lines.push(`- [${at}] [${entry}] 决定 ${d}`);
        for (const a of actions.slice(0, 40))
            lines.push(`- [${at}] [${entry}] ${a}`);
        for (const u of userMsgs.slice(0, 20))
            lines.push(`- [${at}] [${entry}] ${u}`);
        return lines.join("\n") + "\n";
    };
    const runCompact = async (fs, ws, cache, meta) => {
        if (compactCfg.enabled !== true)
            return;
        const parsed = [...cache.values()].map((r) => r.parsed).filter(Boolean);
        if (!parsed.length)
            return;
        const gap = Math.max(0, Number(compactCfg.gapMinutes) || episodeGap);
        const eps = deriveEpisodes(parsed, { gapMinutes: gap });
        if (eps.length <= 1)
            return; // 只有当前打开的 episode，无已完成收口的
        let changed = false;
        const dateOf = (rel) => (rel.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || today();
        for (const ep of eps.slice(0, -1)) {
            const atoms = (ep.memoryRefs || []).map((rel) => cache.get(rel)?.parsed).filter(Boolean);
            if (!atoms.length)
                continue;
            const name = `ep-${compactSlug(ep.id)}-consolidated.md`;
            const rdate = dateOf((ep.memoryRefs || [])[0]);
            const rel = `${SHADOW_ROOT}/${rdate}/${name}`;
            const text = consolidateText(ep, atoms);
            const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
            await fs.writeText(t, text);
            for (const a of atoms) {
                if (meta) {
                    meta[a.rel] = meta[a.rel] || { hits: 0, status: "active", pinned: false };
                    meta[a.rel].status = "compacted";
                }
                cache.delete(a.rel);
            }
            cache.set(rel, recOf({ date: rdate, time: (ep.startedAt || "").slice(11, 17).replace(/:/g, ""), name, rel }, text));
            changed = true;
        }
        if (changed)
            await writeMeta(fs, ws, meta);
    };
    const rebuildIndex = async (fs, ws) => {
        if (!fs || !ws)
            return;
        try {
            // L2：增量索引 —— 优先用进程内缓存（冷启动才读一次全部，之后只靠 flush 增量增补），
            // 避免每回合全量顺序重读所有记忆文件（性能热路径根因）。
            const meta = await readMeta(fs, ws);
            const skipForgotten = (rel) => isForgettable(rel, meta, forgetCfg) || isCompacted(meta, rel);
            await ensureIndexCache(fs, ws, skipForgotten);
            const cache = cacheFor(ws);
            // 遗忘：把低价值/旧条目移出活跃热集（文件保留，仅不再被索引/召回扫描；Forget≠Delete）。
            for (const rel of [...cache.keys()])
                if (isForgettable(rel, meta, forgetCfg) || isCompacted(meta, rel))
                    cache.delete(rel);
            // 硬上限：活跃记忆超过 maxActive 时，遗忘最旧的（封顶热集大小）。
            const maxActive = Math.max(0, Number(forgetCfg.maxActive) || 0);
            if (forgetCfg.enabled === true && maxActive > 0 && cache.size > maxActive) {
                const recsAll = [...cache.values()];
                const drop = oldestBeyond(recsAll.map((r) => ({ rel: r.rel, date: r.date, time: r.time })), maxActive);
                for (const rel of drop)
                    cache.delete(rel);
            }
            // Episode 收口归档：关闭的 episode → 合并成一个 consolidated 文件 + 原子归档（文件变少）。
            await runCompact(fs, ws, cache, meta);
            const recs = [...cache.values()];
            const memories = recs.map((r) => ({ date: r.date, time: r.time, name: r.name, rel: r.rel }));
            const topicFiles = {};
            const parsed = [];
            const todayStr = today();
            const todayTopics = new Set();
            let todayCount = 0;
            for (const r of recs) {
                for (const t of r.topics)
                    (topicFiles[t] = topicFiles[t] || []).push(r.rel);
                if (r.date === todayStr) {
                    todayCount++;
                    for (const t of r.topics)
                        todayTopics.add(t);
                }
                if (r.parsed)
                    parsed.push(r.parsed);
            }
            let idx = buildIndexText(ws, memories, topicFiles, { count: todayCount, topics: [...todayTopics] });
            // 把碎片串成"任务回溯（Episodes）"：一次连续任务 = 一个 Episode（派生式，不写回记忆文件）。
            if (episodeShow > 0) {
                try {
                    const eps = deriveEpisodes(parsed, { gapMinutes: episodeGap });
                    idx += "\n" + episodesIndexText(eps, episodeShow);
                }
                catch (e) {
                    console.log("[dsh-shadow] episodes derive failed:", e && e.message);
                }
            }
            const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_index.md`, { cwd: ws });
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
                indexDirty.add(ws); // 摘要回填 → 索引懒标记，待读时再重建。
            }
        }
        catch (e) {
            console.log("[dsh-shadow] summarize patch failed:", e && e.message);
        }
    };
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
            // L2 增量索引：把刚落盘的文件立即并入进程内缓存（避免重复读盘）；索引直接由缓存生成。
            // L2 增量索引：把刚落盘的文件立即并入进程内缓存（避免重复读盘）；索引直接由缓存生成。
            cacheFor(ws).set(rel, recOf({ date: today(), time: compact().split("--")[1]?.slice(0, 6), name: rel.split("/").pop(), rel }, `${head}${clue}${body}\n`));
            indexDirty.add(ws); // 索引懒构建：不在此处重建，待 read_shadow 读索引时再 ensureIndex。
            await registerMeta(fs, ws, rel, id, retentionCfg.enabled === true);
            void patchSummary(fs, ws, rel, entry, arr);
        }
        catch (e) {
            lastFlushError = { at: Date.now(), err: (e && e.message) || String(e) };
            console.error("[dsh-shadow][error] flush FAILED:", lastFlushError.err);
        }
    };
    const onFsObserved = (target, observation, actor) => {
        const abs = (target && (target.displayPath || target.targetKey)) || "";
        if (!abs)
            return undefined;
        const id = agentIdOf(actor) || initiatorId();
        if (!id)
            return undefined;
        const ws = resolveWorkspace(getAgentById(id), cwdBySession, config) || "";
        push(id, { kind: "action", text: `改/读 ${under(abs, ws) || abs}`, comp: component(abs, ws), source: "fs" });
        return undefined;
    };
    const onToolsResult = (exec) => {
        const id = exec?.agent?.id || initiatorId();
        const tool = exec?.tool?.name || exec?.toolName || exec?.name || exec?.tool || "tool";
        push(id, { kind: "action", text: `调用 ${tool}`, comp: tool, source: "tool" });
        return undefined;
    };
    const onGoalChanged = (payload) => {
        const gid = payload?.agent?.id;
        const obj = payload?.change?.objective || payload?.change?.goal?.objective || "";
        if (gid && obj)
            goalByAgent.set(String(gid), String(obj).slice(0, 120));
        // Decision Capture：goal 事件 = 明确决策（一等事件），statement 与 source 入内供血缘派生。
        push(gid, { kind: "decision", text: `决定 ${goalText(payload?.change)}`, statement: goalText(payload?.change), source: "goal" });
        return undefined;
    };
    const onSessionEvent = (session, event) => {
        const sid = session?.id;
        const cwd = session?.header?.cwd;
        if (sid && cwd)
            cwdBySession.set(String(sid), cwd);
        const m = extractMessage(event);
        if (!m)
            return undefined;
        const id = getAgentById(sid)?.id || (sid ? String(sid) : undefined) || initiatorId();
        const tag = m.kind === "user" ? "用户" : "我";
        if (m.kind === "assistant") {
            push(id, { kind: "assistant", text: `${tag}：${sanitizeText(m.text)}`, comp: "", sub: "", source: "assistant" });
            // Decision Capture：assistant 明确表达的决策（选择类动词+宾语），reasons 只在原文明确时挂，
            // 不 LLM 补写（Evidence≠Interpretation）。也计入「决策」正文（trace 供 deriveDecisions 派生）。
            for (const st of extractDecisionStatement(m.text)) {
                push(id, { kind: "decision", text: `决定 ${st}`, statement: st, reason: extractReason(m.text), source: "assistant" });
            }
            return undefined;
        }
        const sub = classifyUser(m.text);
        const rec = { kind: "user", text: `${tag}：${sanitizeText(m.text)}`, comp: "", sub, source: "user" };
        // Decision Capture：用户拍板 = 明确决策；理由仅当原文含「因为/由于/理由是…」时挂。
        if (sub === "decision") {
            rec.statement = m.text;
            rec.reason = extractReason(m.text);
        }
        push(id, rec);
        return undefined;
    };
    const onTurnStopping = async (payload) => {
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
    const expandTerms = async (topic) => {
        if (recallCfg.enabled !== true)
            return [];
        const route = routeFor(recallCfg);
        if (!route)
            return [];
        const maxTokens = Math.max(1, Number(recallCfg.maxTokens) || 60);
        const timeoutMs = Math.max(1, Number(recallCfg.timeoutMs) || 6000);
        const system = "你是检索扩词助手。给定一个主题/入口，输出 5~10 个最相关的检索词，每行一个，只输出词本身，不要编号、解释或标点。";
        const messages = [textMessage(`shadow-r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, topic)];
        const text = await streamText(context, route, { label: "recall expand", system, messages, maxTokens, timeoutMs });
        return tokenize(text).slice(0, 10);
    };
    const getFlushWarn = () => lastFlushError
        ? `\n\n> ⚠ shadow 最近一次落盘失败（${new Date(lastFlushError.at).toISOString()}：${lastFlushError.err}）。你读到的可能是旧/不完整记忆；请先确认 shadowRoot 可写，勿把「数据不可达」当作「召回不足」。`
        : "";
    // v1.6 recall_shadow 的 LLM 推理导航：只让 LLM【选编号】（意图/排序），不生成事实/理由/判断。
    // 失败/未配置 → 返回 []，调用方回退到确定性 bestTask（行为不变）。
    const recallSelect = async (query, candidates) => {
        const cfg = config.llmRecall ?? {};
        if (cfg.enabled !== true || !candidates.length)
            return [];
        const route = routeFor(cfg);
        if (!route)
            return [];
        const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
        const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
        const system = "你是记忆检索规划器。给定用户查询与候选任务列表，选出最相关任务的编号（从 0 开始）。只输出一个整数，不要解释、标点或 Markdown。";
        const framed = `查询：${query}\n候选任务：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.objective ? " — " + c.objective : ""}${c.summary ? " — " + c.summary : ""}`).join("\n");
        const messages = [textMessage(`shp-${Date.now()}`, framed)];
        const text = await streamText(context, route, { label: "", system, messages, maxTokens, timeoutMs });
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
    // 失败/未配置 → 返回 []，调用方回退到确定性 retrieveKnowledge（行为不变）。
    const knowledgeNavigate = async (query, candidates) => {
        const cfg = config.knowledgeEngine?.llmNavigate ?? {};
        if (cfg.enabled !== true || !candidates.length)
            return [];
        const route = routeFor({ provider: cfg.provider, model: cfg.model });
        if (!route)
            return [];
        const maxTokens = Math.max(4, Number(cfg.maxTokens) || 12);
        const timeoutMs = Math.max(1, Number(cfg.timeoutMs) || 6000);
        const system = "你是知识树检索规划器（像人翻长文档定位正确章节）。给定查询与候选章节，选出最相关章节的编号（逗号分隔，从 0 开始，可多选）。只输出编号，不要解释、标点或 Markdown。";
        const framed = `查询：${query}\n候选章节：\n` + candidates.map((c, i) => `${i}. ${c.title}${c.content ? " — " + c.content : ""}`).join("\n");
        const messages = [textMessage(`shk-${Date.now()}`, framed)];
        const text = await streamText(context, route, { label: "", system, messages, maxTokens, timeoutMs });
        const idxs = (String(text || "").match(/\d+/g) || []).map(Number).filter((i) => i >= 0 && i < candidates.length);
        return Array.from(new Set(idxs)).slice(0, 6);
    };
    // 懒构建索引：flush 只置 dirty（不重建）；这里才在「确实要读索引」时构建/落盘。
    const ensureIndex = async (ws) => {
        if (!ws)
            return;
        if (!indexDirty.has(ws) && indexCacheWarm.has(ws))
            return; // 已最新且已预热 → 跳过重建
        const fsI = context.get("fs");
        if (!fsI)
            return;
        await rebuildIndex(fsI, ws);
        indexDirty.delete(ws);
    };
    const cleanup = () => {
        pending.clear();
        comps.clear();
        indexDirty.clear();
    };
    return {
        cwdBySession,
        push,
        getFlushWarn,
        expandTerms,
        recallSelect,
        knowledgeNavigate,
        ensureIndex,
        onFsObserved,
        onToolsResult,
        onGoalChanged,
        onSessionEvent,
        onTurnStopping,
        onSessionFlush,
        cleanup,
    };
}
