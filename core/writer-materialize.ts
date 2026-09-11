// dsh-shadow —— core/writer-materialize.ts：写侧物化 seam（candidate 2 主体拆分）。
// 从 createShadowCollector 迁出的「pending → 落盘物化」部分：flush（事件→记忆文件+meta+摘要）、
// rebuildIndex（L2 增量索引→_index.md）、runCompact（Episode 收口归档）、patchSummary、ensureIndex。
// fs 重、领域逻辑最密；用显式 WriterCore 注入（状态 + 配置派生），便于无 harness 验证。
// 与 writer.ts 原实现逐字一致；flush 经 hooks.primaryComp 取主入口（composition root 注入，解 cycle）。
import { SHADOW_ROOT } from "./paths.js";
import type { AgentLike } from "./types.js";
import { resolveWorkspace } from "./scope.js";
import { today, compact, slug, topicsInText } from "./util.js";
import { readRel, listMemories } from "../persistence/files.js";
import { readMeta, mutateMeta } from "../persistence/meta.js";
import { buildClueHeader, registerMeta } from "./memory.js";
import { traceOf } from "./trace.js";
import { streamText, textMessage } from "./writer-llm.js";
import { buildIndexText, consolidateText } from "./writer-render.js";
import { parseMemory, deriveEpisodes, episodesIndexText } from "./episode.js";
import { isForgettable, oldestBeyond, isCompacted } from "./forget.js";
import { sanitizeText, isUnsafe } from "../security/scrub.js";
import { routeFor } from "./writer-core.js";
import { invalidateProjection } from "./projection-store.js";
import type { WriterCore } from "./writer-core.js";
import type { WriterHooks } from "./writer-capture.js";

export interface MaterializeResult {
  flush: (agent: AgentLike | undefined) => Promise<void>;
  rebuildIndex: (fs: any, ws: string) => Promise<void>;
  ensureIndex: (ws: string) => Promise<void>;
}

export function makeMaterialize(core: WriterCore, hooks: WriterHooks): MaterializeResult {
  const cacheFor = (ws: string) => { let c = core.indexCache.get(ws); if (!c) { c = new Map(); core.indexCache.set(ws, c); } return c; };

  const recOf = (mm: any, text: string) => {
    const entry = (String(text || "").match(/^# (.+)$/m) || [])[1]?.trim() || "";
    let parsed: any = undefined;
    try { parsed = parseMemory(text, mm.rel, mm.name); } catch { /* 解析失败仅缺 episode/decision */ }
    return { date: mm.date, time: mm.time, name: mm.name, rel: mm.rel, entry, topics: topicsInText(text, slug(mm.name)), parsed };
  };

  const ensureIndexCache = async (fs: any, ws: string, skipForgotten: (rel: string) => boolean) => {
    if (core.indexCacheWarm.has(ws)) return;
    core.indexCacheWarm.add(ws); // 每个 workspace 只做一次全量读；之后靠 flush 增量增补。
    const cache = cacheFor(ws);
    const memories = await listMemories(fs, ws);
    for (const mm of memories) {
      if (skipForgotten(mm.rel)) continue;
      const text = await readRel(fs, ws, mm.rel);
      if (text) cache.set(mm.rel, recOf(mm, text));
    }
  };

  const summarizeTurn = async (agent: any, body: unknown) => {
    if (core.summaryCfg.enabled === false) return "";
    const route = routeFor(core);
    if (!route) return "";
    const maxTokens = Math.max(1, Number(core.summaryCfg.maxTokens) || 80);
    const timeoutMs = Math.max(1, Number(core.summaryCfg.timeoutMs) || 8000);
    const system = "用一句话概括给定内容（这轮对话/动作的要点）。只用中文，不超过 40 个字；只输出这一句话，不加解释、引号、Markdown 或任何前缀。";
    const framed = String(body || "").trim().slice(0, 2000) || "（无正文）";
    const messages = [textMessage(`shadow-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, framed)];
    const text = await streamText(core.context, route, { label: "summarize", system, messages, maxTokens, timeoutMs });
    const one = String(text || "").replace(/\s+/g, " ").trim();
    return one ? one.slice(0, 120) : "";
  };

  // ── Episode 收口归档（B）：一个 episode 结束时把其 turn 原子合并成一个 consolidated 文件，
  //    个体原子 mark status=compacted 并移出活跃热集（文件保留、可回放；Forget≠Delete）。默认关。
  const compactSlug = (id: string) => String(id || "ep").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "ep";
  const runCompact = async (fs: any, ws: string, cache: Map<string, any>) => {
    if (core.compactCfg.enabled !== true) return;
    const parsed = [...cache.values()].map((r) => r.parsed).filter(Boolean);
    if (!parsed.length) return;
    const gap = Math.max(0, Number(core.compactCfg.gapMinutes) || core.episodeGap);
    const eps = deriveEpisodes(parsed, { gapMinutes: gap });
    if (eps.length <= 1) return; // 只有当前打开的 episode，无已完成收口的
    // **增量标记，不在陈旧快照上改**（ADR-0068）：本函数的写入窗口跨「重建索引 + 收口」，
    // 拿开头读到的 meta 全量覆盖回去会丢掉期间别人的写入。故只收集 delta，最后在
    // `mutateMeta` 的**新鲜快照**上应用。
    const marks: string[] = [];
    const dateOf = (rel: string) => (rel.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || today();
    for (const ep of eps.slice(0, -1)) {
      const atoms = (ep.memoryRefs || []).map((rel: string) => cache.get(rel)?.parsed).filter(Boolean);
      if (!atoms.length) continue;
      const name = `ep-${compactSlug(ep.id)}-consolidated.md`;
      const rdate = dateOf((ep.memoryRefs || [])[0]);
      const rel = `${SHADOW_ROOT}/${rdate}/${name}`;
      const text = consolidateText(ep, atoms);
      const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
      await fs.writeText(t, text);
      for (const a of atoms) {
        marks.push(a.rel);
        cache.delete(a.rel);
      }
      cache.set(rel, recOf({ date: rdate, time: (ep.startedAt || "").slice(11, 17).replace(/:/g, ""), name, rel }, text));
    }
    if (marks.length) {
      await mutateMeta(fs, ws, (m) => {
        for (const rel of marks) {
          m[rel] = m[rel] || { hits: 0, status: "active", pinned: false };
          m[rel].status = "compacted";
        }
      });
    }
  };

  const rebuildIndex = async (fs: any, ws: string) => {
    if (!fs || !ws) return;
    try {
      // L2：增量索引 —— 优先用进程内缓存（冷启动才读一次全部，之后只靠 flush 增量增补），
      // 避免每回合全量顺序重读所有记忆文件（性能热路径根因）。
      const meta = await readMeta(fs, ws);
      const skipForgotten = (rel: string) => isForgettable(rel, meta, core.forgetCfg) || isCompacted(meta, rel);
      await ensureIndexCache(fs, ws, skipForgotten);
      const cache = cacheFor(ws);
      // 遗忘：把低价值/旧条目移出活跃热集（文件保留，仅不再被索引/召回扫描；Forget≠Delete）。
      for (const rel of [...cache.keys()]) if (isForgettable(rel, meta, core.forgetCfg) || isCompacted(meta, rel)) cache.delete(rel);
      // 硬上限：活跃记忆超过 maxActive 时，遗忘最旧的（封顶热集大小）。
      const maxActive = Math.max(0, Number(core.forgetCfg.maxActive) || 0);
      if (core.forgetCfg.enabled === true && maxActive > 0 && cache.size > maxActive) {
        const recsAll = [...cache.values()];
        const drop = oldestBeyond(recsAll.map((r) => ({ rel: r.rel, date: r.date, time: r.time })), maxActive);
        for (const rel of drop) cache.delete(rel);
      }
      // Episode 收口归档：关闭的 episode → 合并成一个 consolidated 文件 + 原子归档（文件变少）。
      await runCompact(fs, ws, cache);
      const recs = [...cache.values()];
      const memories = recs.map((r) => ({ date: r.date, time: r.time, name: r.name, rel: r.rel }));
      const topicFiles: Record<string, string[]> = {};
      const parsed: any[] = [];
      const todayStr = today();
      const todayTopics = new Set<string>();
      let todayCount = 0;
      for (const r of recs) {
        for (const t of r.topics) (topicFiles[t] = topicFiles[t] || []).push(r.rel);
        if (r.date === todayStr) { todayCount++; for (const t of r.topics) todayTopics.add(t); }
        if (r.parsed) parsed.push(r.parsed);
      }
      let idx = buildIndexText(ws, memories, topicFiles, { count: todayCount, topics: [...todayTopics] });
      // 把碎片串成"任务回溯（Episodes）"：一次连续任务 = 一个 Episode（派生式，不写回记忆文件）。
      if (core.episodeShow > 0) {
        try {
          const eps = deriveEpisodes(parsed, { gapMinutes: core.episodeGap });
          idx += "\n" + episodesIndexText(eps, core.episodeShow);
        } catch (e: any) {
          console.log("[dsh-shadow] episodes derive failed:", e && e.message);
        }
      }
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
        core.indexDirty.add(ws); // 摘要回填 → 索引懒标记，待读时再重建。
      }
    } catch (e: any) {
      console.log("[dsh-shadow] summarize patch failed:", e && e.message);
    }
  };

  const flush = async (agent: AgentLike | undefined) => {
    const id = agent?.id;
    const arr = core.pending.get(id || "");
    if (!arr || !arr.length) {
      if (id) { core.pending.delete(id); core.comps.delete(id); }
      return;
    }
    // P5 默认回写显式同意：writeConsent=true 时，仅当本回合含"用户显式要求记忆"的措辞才落盘；
    // 否则只累积（保留 pending，不删除、不写文件），避免静默持久化用户未要求的上下文。
    if (core.writeConsent && !arr.some((e) => e.kind === "user" && /(记住|记得|记一下|记下来|记忆|沉淀|存档|保存|日后|以后|写入记忆|记下)/.test(String(e.text || "")))) {
      return;
    }
    if (id) core.pending.delete(id);
    const entry = hooks.primaryComp?.(id || "") || "shadow";
    if (id) core.comps.delete(id);
    const ws = resolveWorkspace(agent, core.cwdBySession, core.config);
    const fs = core.context.get("fs");
    if (!ws || !fs) return;
    try {
      const rel = `${SHADOW_ROOT}/${today()}/${compact()}-${slug(entry)}.md`;
      const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
      const head = `# ${entry}\n\n`;
      const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
      const extra = { project, agent: id ? String(id) : undefined, goal: core.goalByAgent.get(String(id || "")) };
      const clue = buildClueHeader(entry, arr, id, extra);
      // 事件 → Trace → Memory：正常化采集源为有序 Trace，再据此塑形正文（输出保持一致）。
      const traces = traceOf(arr, id);
      const bodyLines = traces.map((t) => `- [${t.at}] [${t.comp || entry}] ${sanitizeText(t.text)}`).filter((l) => !isUnsafe(l));
      const body = bodyLines.length ? bodyLines.join("\n") : "- （本回合无可安全记录的正文）";
      await fs.writeText(t, `${head}${clue}${body}\n`);
      // L2 增量索引：把刚落盘的文件立即并入进程内缓存（避免重复读盘）；索引直接由缓存生成。
      cacheFor(ws).set(rel, recOf({ date: today(), time: compact().split("--")[1]?.slice(0, 6), name: rel.split("/").pop(), rel }, `${head}${clue}${body}\n`));
      core.indexDirty.add(ws); // 索引懒构建：不在此处重建，待 read_shadow 读索引时再 ensureIndex。
      await registerMeta(fs, ws, rel, id, core.retentionCfg.enabled === true);
      void patchSummary(fs, ws, rel, entry, arr);
    } catch (e: any) {
      core.lastFlushError = { at: Date.now(), err: (e && e.message) || String(e) };
      console.error("[dsh-shadow][error] flush FAILED:", core.lastFlushError.err);
    }
  };

  // 懒构建索引：flush 只置 dirty（不重建）；这里才在「确实要读索引」时构建/落盘。
  const ensureIndex = async (ws: string) => {
    if (!ws) return;
    if (!core.indexDirty.has(ws) && core.indexCacheWarm.has(ws)) return; // 已最新且已预热 → 跳过重建
    const fsI = core.context.get("fs");
    if (!fsI) return;
    await rebuildIndex(fsI, ws);
    core.indexDirty.delete(ws);
    // v1.15.12：索引重建 = **记忆集已变** → 投影缓存必须一并失效，
    // 否则 shadow_query 会读陈旧投影（此前 invalidate 零调用点，只能手动删 nodes.jsonl）。
    if (core.config.projectionStore?.enabled === true) await invalidateProjection(fsI, ws);
  };

  return { flush, rebuildIndex, ensureIndex };
}
