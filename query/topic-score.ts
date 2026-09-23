// dsh-shadow —— query/topic-score.ts：主题召回打分 / lifecycle / 取代回填。
// 返回 scored + entryList（空命中早退的 approxEntries 需要后者）。
import { ageDaysOf, onByDefault } from "../core/util.js";
import { scoreMemory, breakdownOf, tierFor, deprioritizeFactor } from "../retrieval/rank.js";
import {
  evidenceOf, provenanceText, newestByEntryOf, verdictOf, conflictOf, lineageOf,
} from "../subject/observer/arbitrate.js";
import { lifecycleOf, hotnessOf } from "../core/retention/lifecycle.js";
import { scrubUnsafe } from "../security/scrub.js";
import type { ParsedMemory } from "../core/view/episode.js";

export interface TopicScoreOpts {
  fs: any;
  ws: string;
  memories: any[];
  byRel: Map<string, ParsedMemory>;
  meta: Record<string, any>;
  tokens: string[];
  retentionCfg: any;
  recallCfg: any;
  verifyEvidence: any;
  observerMode: boolean;
  asOf: any;
  agentId?: string;
}

export interface TopicScoreResult {
  scored: any[];
  entryList: { entry: string; date: string; time: string }[];
}

/** 对物化候选打分并排序；含 hotness / conflict / verdict / lineage。 */
export const scoreTopicCandidates = async (opts: TopicScoreOpts): Promise<TopicScoreResult> => {
  const {
    fs, ws, memories, byRel, meta, tokens, retentionCfg, recallCfg,
    verifyEvidence, observerMode, asOf, agentId,
  } = opts;
  const scored: any[] = [];
  const entryList: { entry: string; date: string; time: string }[] = [];
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
      const conflict = await conflictOf(fs, ws, text, verifyEvidence);
      if (conflict.missing.length) { score = score * 0.5; stale = true; }
      if (dp !== 1) score = score * dp;
      const ev: any = evidenceOf(text, mm, meta, stale);
      ev.conflict = conflict.missing.length;
      ev.unverifiedByCap = conflict.droppedByCap ?? 0;
      ev.lifecycle = lifecycleOf(meta[mm.rel], ageDaysOf(mm.rel), conflict.missing.length, stale);
      scored.push({
        mm, text, entry, tier, score, tokens, origin, stale, currentOrigin: agentId,
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
  return { scored, entryList };
};
