// dsh-shadow —— query/topic-recall.ts：默认主题召回管线（无 mode + 有 topic）。
// 活跃 Memory Atom 集**只**经 materializeAtoms（forget/compact 的 keep 唯一定义）；本模块不复制过滤。
// hits 经 core/served-hits.ts 的 recordServedHits（D7=②）。
import { readAuditStream, renderAuditStreamDiag } from "../persistence/audit-stream.js";
import { readLedger, writeLedger, type LedgerRead } from "../retrieval/ledger.js";
import { tokenize, today, ageDaysOf, RECALL_PREFIX, parseAsOf, onByDefault } from "../core/util.js";
import { scoreMemory, breakdownOf, tierFor, approxEntries, deprioritizeFactor } from "../retrieval/rank.js";
import { renderByTier, noMatchText, truncationNote } from "../retrieval/render.js";
import { excerptWorthwhile, tierLossNote } from "../retrieval/loss.js";
import {
  evidenceOf, provenanceText, newestByEntryOf, verdictOf, conflictOf, lessonOf, lineageOf,
} from "../observer/arbitrate.js";
import { lifecycleOf, hotnessOf } from "../core/lifecycle.js";
import { kgTrace } from "../observer/observer.js";
import { readSoul } from "../soul/soul.js";
import { readIdentity } from "../soul/identity.js";
import { observerContextOf } from "../observer/core.js";
import { readObserverState } from "../observer/state.js";
import { recordObservationTrace } from "../observer/trace.js";
import { scrubFinal, scrubUnsafe } from "../security/scrub.js";
import { recordServedHits } from "../core/served-hits.js";
import type { ShadowQueryDeps } from "./types.js";
import type { MaterializedView } from "./materialize.js";
import type { AgentLike } from "../core/types.js";
import type { ParsedMemory } from "../core/episode.js";

export interface TopicRecallCtx {
  fs: any;
  ws: string;
  flushWarn: string;
  agent?: AgentLike;
}

/** 默认主题召回。`view` 已物化（含 meta / memories / parsed）。 */
export async function runTopicRecall(
  deps: ShadowQueryDeps,
  args: any,
  ctx: TopicRecallCtx,
  view: MaterializedView,
  topic: string,
  tokensIn: string[],
  maxChars: number,
): Promise<string> {
  const { fs, ws, flushWarn, agent } = ctx;
  const recallCfg = deps.config.recall ?? {};
  const retentionCfg = deps.config.retention ?? {};
  const limit = Math.max(1, Math.min(30, Number(args?.limit) || 10));
  const debugMode = recallCfg.debug === true || Boolean(args?.debug);
  const diag: string[] = [];
  const asOf = parseAsOf(args?.asOf);
  const observerMode = Boolean(args?.observer);
  const meta = view.meta;
  // 按 rel 索引 parsed（物化时已读正文）；无 atom 的 source（解析失败）与旧「空正文 continue」同效。
  const byRel = new Map<string, ParsedMemory>();
  for (const p of view.parsed || []) if (p?.rel) byRel.set(p.rel, p);

  let memories = Array.isArray(view.memories) ? view.memories.slice() : [];
  if (asOf) memories = memories.filter((m: any) => m.date <= asOf.date);
  if (debugMode) diag.push(`候选 ${memories.length}${asOf ? ` · asOf<=${asOf.date}` : ""}`);
  if (debugMode) diag.push(renderAuditStreamDiag(await readAuditStream(fs, ws)));

  const obsSoul = await readSoul(fs, ws);
  const obsIdentity = await readIdentity(fs, ws, agent?.id);
  const obsState = await readObserverState(fs, ws, obsSoul, args.state);
  const obsCtx = observerContextOf(args, topic, obsIdentity, agent?.id, obsState);

  let tokens = tokensIn.slice();
  if (!tokens.length) tokens = [String(topic).toLowerCase()];
  // 扩词已在 runReadShadow 完成并传入 tokensIn，此处不再二次 expandTerms。

  const scored: any[] = [];
  const entryList: any[] = [];
  const entryLineage = new Map<string, { date: string; time: string; decision: string }[]>();
  const halfLife = Math.max(0.01, Number(retentionCfg.halfLifeDays) || 7);

  for (const mm of memories) {
    const parsed = byRel.get(mm.rel);
    const text = parsed?.body;
    if (!text) continue;
    const entry = parsed.entry || (text.match(/^# (.+)$/m) || [])[1] || "";
    entryList.push({ entry, date: mm.date, time: mm.time });
    const decisionTxt = (text.match(/^> 用户提示\/决策：(.+)$/m) || [])[1] || "";
    if (!entryLineage.has(entry)) entryLineage.set(entry, []);
    entryLineage.get(entry)!.push({ date: mm.date, time: mm.time, decision: decisionTxt });
    const tier = tierFor(text);
    let score = scoreMemory(text, mm.rel, entry, tokens);
    const originM = text.match(/^> 来源会话：(.+)$/m);
    const origin = originM ? scrubUnsafe(originM[1]).trim() : "";
    const staleDays = Math.max(1, Number(retentionCfg.staleDays) || 7);
    let stale = ageDaysOf(mm.rel) >= staleDays;
    if (onByDefault(retentionCfg.enabled)) {
      const rec = meta[mm.rel];
      if (rec && rec.status && rec.status !== "active" && !rec.pinned) continue;
      const h = hotnessOf(rec ? rec.hits : 0, ageDaysOf(mm.rel), halfLife);
      score = score * (0.5 + h * 2);
      if (rec && rec.status === "stale") stale = true;
      if (h < 0.15) stale = true;
    }
    const dp = deprioritizeFactor(mm.rel, entry, recallCfg.deprioritize);
    if (score > 0) {
      const conflict = await conflictOf(fs, ws, text, deps.verifyEvidence);
      if (conflict.missing.length) { score = score * 0.5; stale = true; }
      if (dp !== 1) score = score * dp;
      const ev: any = evidenceOf(text, mm, meta, stale);
      ev.conflict = conflict.missing.length;
      ev.unverifiedByCap = conflict.droppedByCap ?? 0;
      ev.lifecycle = lifecycleOf(meta[mm.rel], ageDaysOf(mm.rel), conflict.missing.length, stale);
      scored.push({
        mm, text, entry, tier, score, tokens, origin, stale, currentOrigin: agent?.id,
        provenance: provenanceText(ev), evidence: ev,
        breakdown: breakdownOf(text, mm.rel, entry, tokens, dp !== 1),
        deprioritized: dp !== 1, conflict: conflict.missing, observer: observerMode, asOf,
      });
    }
  }

  const newest = newestByEntryOf(entryList);
  for (const s of scored) {
    const v = verdictOf(s.evidence.conflict || 0, s.entry, s.mm.date, s.mm.time, newest);
    s.superseded = v.superseded; s.verdict = v.verdict; s.outcome = v.outcome; s.reflection = v.reflection;
    if (v.superseded) s.score = s.score * 0.7;
    s.evidence.lifecycle = lifecycleOf(meta[s.mm.rel], ageDaysOf(s.mm.rel), s.evidence.conflict || 0, s.stale, v.superseded);
    s.evidence.verdict = v.verdict; s.evidence.outcome = v.outcome; s.evidence.reflection = v.reflection;
    s.evidence.lineage = lineageOf(entryLineage.get(s.entry) || []);
    s.provenance = provenanceText(s.evidence);
  }
  scored.sort((a, b) => b.score - a.score || b.mm.date.localeCompare(a.mm.date));
  if (debugMode) {
    diag.push(`命中（打分>0）${scored.length}`);
    const dpr = scored.filter((s) => s.deprioritized).length;
    if (dpr) diag.push(`降权·deprioritize ${dpr} 条（recall.deprioritize）`);
  }
  if (!scored.length) {
    return noMatchText(topic, flushWarn, { approx: approxEntries(topic, entryList.map((e) => e.entry)) })
      + (debugMode ? "\n\n" + diag.join("\n") : "");
  }

  const cooldownTurns = Math.max(0, Number(recallCfg.cooldownTurns) || 0);
  const ledger: LedgerRead = cooldownTurns > 0
    ? await readLedger(fs, ws)
    : { turn: 0, served: {} };
  if (cooldownTurns > 0) {
    if (ledger.corrupt) {
      deps.noteDegrade?.("recallLedger", "_recall_log.json **坏件**（无法解析或结构不对）", "本次按空台账处理 ⇒ **冷却状态可能失效**：已经冷却过的记忆会被重新返回，`recall.cooldownTurns` 事实上没生效。**另注**：本回合若走到写台账那一步，会把这份坏件**覆盖**掉（其内容已无法解析，但手工抢救的机会同时消失）");
    } else if (ledger.unreadable) {
      deps.noteDegrade?.("recallLedger", `_recall_log.json **读不到**（${ledger.error || "原因未知"}）`, "本次按空台账处理且 `turn` 从 0 重算 ⇒ 冷却窗口整体作废，与「第一次运行」不可区分");
    }
  }
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
  if (!available.length) {
    const cooledEntries = scored.slice(0, 3).map((s) => s.entry || s.mm.rel);
    return (
      noMatchText(topic, flushWarn, {
        reason: `全部命中都在冷却中（recall.cooldownTurns=${cooldownTurns}，${cooledCount} 条）`,
        approx: cooledEntries,
        approxLabel: "冷却中的命中（是命中，不是近似）",
        steps: `> 下一步：① 等 ${cooldownTurns} 回合后再查（冷却按回合计数）；② 或调低 \`recall.cooldownTurns\`；③ \`read_shadow({debug:true})\` 看完整候选。`,
      }) + (debugMode ? "\n\n" + diag.join("\n") : "")
    );
  }

  const n = available.length;
  const parts: string[] = [];
  const withheld: { rel: string; entry?: string }[] = [];
  const recoverHandleOf = (s: any): { file: string; locator?: string } | null => {
    const rel = s?.mm?.rel;
    return rel ? { file: String(rel), locator: s?.entry ? String(s.entry) : undefined } : null;
  };
  let used = 0;
  let droppedByLimit = 0;
  let droppedByBudget = 0;
  const servedRels: string[] = [];
  const servedDetail: string[] = [];
  for (let i = 0; i < available.length; i++) {
    const s = available[i];
    if (parts.length >= limit) { droppedByLimit = available.length - i; break; }
    const sharedPool = Math.max(0, Math.floor((maxChars - used) / Math.max(1, n)));
    const cap = Math.max(120, Math.floor((maxChars / n) * 2) + sharedPool);
    let render = renderByTier(s, cap, false, tokens);
    if (used + render.length > maxChars) {
      const degraded = renderByTier(s, cap, true, tokens);
      const handle = recoverHandleOf(s);
      if (handle && degraded.length <= render.length) render = degraded;
      if (used + degraded.length > maxChars) { droppedByBudget = available.length - i; break; }
    }
    if (!render.includes("…") && excerptWorthwhile(s.text)) withheld.push({ rel: s.mm.rel, entry: s.entry });
    parts.push(render);
    servedRels.push(s.mm.rel);
    used += render.length;
    if (debugMode) {
      const b = s.breakdown || {};
      const sc = Math.round(s.score * 10) / 10;
      diag.push(`返回 ${s.mm.rel} · 命中 ${sc} · 入口${b.entry || 0} 主题${b.topic || 0} 路径${b.path || 0} 正文${b.body || 0}${b.deprioritized ? " · 降权(deprioritize)" : ""}${s.evidence ? ` · 状态${s.evidence.status}` : ""}`);
    }
    if (s.tier !== "L0" && render.includes("…")) servedDetail.push(s.mm.rel);
  }
  if (debugMode) diag.push(`预算 ${maxChars} 字 · 返回 ${parts.length} 条${droppedByLimit ? ` · limit 截断 ${droppedByLimit}` : ""}${droppedByBudget ? ` · 预算截断 ${droppedByBudget}` : ""}`);

  const returnedSet = new Set(servedRels);
  const envelope = truncationNote({
    matched: scored.length,
    returned: parts.length,
    limit,
    maxChars,
    droppedByLimit,
    droppedByBudget,
    droppedByCooldown: cooledCount,
    dropped: scored.filter((s) => !returnedSet.has(s.mm.rel)).slice(0, 3).map((s) => ({ entry: s.entry, score: Math.round(s.score * 10) / 10 })),
  });
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
    const ledgerWritten = await writeLedger(fs, ws, { turn, served: nextServed });
    if (!ledgerWritten) {
      deps.noteDegrade?.("recallLedger", "_recall_log.json **写失败**", "本次的冷却状态**没有保存**：下回合 `turn` 递进会从头再算，同一条记忆可能被反复返回（`recall.cooldownTurns` 失效）");
    }
  }

  await recordServedHits(fs, ws, servedRels, {
    turn,
    observerId: agent?.id ? String(agent.id) : undefined,
  });

  const kgBlock = args?.kg ? await kgTrace(fs, ws, memories, topic) : "";
  const lossNote = onByDefault(recallCfg.lossDisclosure) ? tierLossNote({ withheld, returned: parts.length }) : "";
  const out = scrubFinal(RECALL_PREFIX + (kgBlock ? kgBlock + "\n\n" : "") + (debugMode ? diag.join("\n") + "\n\n" : "") + parts.join("\n\n") + lossNote + envelope + flushWarn);
  await recordObservationTrace(fs, ws, {
    observerId: obsCtx.observerId,
    createdAt: today(),
    realityAnchor: obsCtx.realityAnchor,
    intent: obsCtx.intent,
    projection: { visible: available.slice(0, limit).map((s: any) => s.entry || s.mm?.name || ""), hidden: [], distortion: obsCtx.intent.goal ? [obsCtx.intent.goal] : [] },
    uncertainty: { level: available.length ? 0 : memories.length, reasons: [] },
    metadata: { source: "read_shadow" },
    state: obsCtx.state,
  });
  return out;
}
