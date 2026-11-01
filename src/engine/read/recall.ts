/**
 * v2 engine/read — 主题召回：打分 → 排序 → limit/预算 → 渲染。
 */

import type { NormalizedConfig } from "../../contract/config.js";
import type { AtomMeta, ParsedAtom } from "../../contract/types.js";
import { ageDays } from "../../contract/time.js";
import { bm25Rank } from "../../domain/bm25.js";
import { deprioritizeFactor, fuzzyHit, fuzzyOverlap, scoreMemory, snippetFor, tierFor } from "../../domain/rank.js";
import { renderAtomEntry } from "./render.js";

export interface ScoredAtom {
  atom: ParsedAtom;
  score: number;
  tier: "L0" | "L1" | "L2";
  deprioritized: boolean;
  stale: boolean;
  hits: number;
  /** 同入口/显式纠正指向的新版本；旧项必须可见地标注“被取代”。 */
  supersededBy?: string;
}

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-(x || 0)));

export const hotnessOf = (hits: number, age: number, halfLife: number): number => {
  const h = Math.max(0, Number(hits) || 0);
  const a = Math.max(0, Number(age) || 0);
  const hl = Math.max(0.01, Number(halfLife) || 7);
  return sigmoid(Math.log(1 + h)) * Math.exp((-Math.LN2 * a) / hl);
};

export interface ScoreOpts {
  config: NormalizedConfig;
  meta: Map<string, AtomMeta>;
  todayStr: string;
  agentId?: string;
  /** 证据路径核验失败（missing）的 rel；v1 对冲突 ×0.5 并标 stale。 */
  conflictRels?: Set<string>;
  /** 旧 rel → 取代它的新 rel；打分 ×0.7，并在渲染中显示取代关系。 */
  supersededBy?: Map<string, string>;
  /**
   * 宽松兜底：仅当某 atom 的严格分 = 0 时，用 CJK 2-gram 覆盖再判一次。
   * 只在调用方已确认「严格匹配整体零结果」时才置 true（见 modes.ts），
   * 因此不改变任何已有命中的排序（parity 安全）。
   */
  fuzzy?: boolean;
}

export const scoreAtoms = (atoms: ParsedAtom[], tokens: string[], opts: ScoreOpts): ScoredAtom[] => {
  const out: ScoredAtom[] = [];
  for (const atom of atoms) {
    if (!atom.body.trim()) continue;
    const meta = opts.meta.get(atom.rel);
    if (meta && meta.status !== "active" && !meta.pinned) continue;
    let score = scoreMemory(atom.body, atom.rel, atom.entry, tokens, opts.todayStr);
    if (!score && opts.fuzzy) {
      const q = tokens.join(" ");
      const hay = `${atom.body} ${atom.entry} ${atom.rel}`;
      if (fuzzyHit(q, hay)) score = 1 + fuzzyOverlap(q, hay) * 0.5; // 弱证据：>0 但低于任何严格命中
    }
    if (!score) continue;
    const age = ageDays(atom.date, new Date(`${opts.todayStr}T00:00:00`));
    let stale = age >= opts.config.retention.staleDays;
    if (meta && meta.status === "stale") stale = true;
    if (meta?.pinned) score += 2;
    if (opts.config.retention.halfLifeDays > 0) {
      const h = hotnessOf(meta?.hits ?? 0, age, opts.config.retention.halfLifeDays);
      score *= 0.5 + h * 2;
      if (h < 0.15) stale = true;
    }
    if (opts.conflictRels?.has(atom.rel)) {
      score *= 0.5;
      stale = true;
    }
    if (opts.supersededBy?.has(atom.rel)) score *= 0.7;
    const dp = deprioritizeFactor(atom.rel, atom.entry, opts.config.recall.deprioritize);
    if (dp !== 1) score *= dp;
    out.push({
      atom,
      score,
      tier: tierFor(atom.body),
      deprioritized: dp !== 1,
      stale,
      hits: meta?.hits ?? 0,
      supersededBy: opts.supersededBy?.get(atom.rel),
    });
  }
  out.sort((a, b) => b.score - a.score || b.atom.date.localeCompare(a.atom.date) || a.atom.rel.localeCompare(b.atom.rel));
  return out;
};

/** 同入口按时间取最新；旧的标记 superseded。显式 `> 纠正：` 优先于按入口推断。 */
export const supersededBy = (atoms: ParsedAtom[]): Map<string, string> => {
  const ordered = atoms
    .slice()
    .sort(
      (a, b) =>
        (a.adjudicationSeq ?? 0) - (b.adjudicationSeq ?? 0) ||
        `${a.date} ${a.time} ${a.rel}`.localeCompare(`${b.date} ${b.time} ${b.rel}`),
    );
  const withdrawn = new Set(ordered.map((a) => a.withdraws).filter((x): x is string => Boolean(x)));
  const retained = new Set(ordered.map((a) => a.retains).filter((x): x is string => Boolean(x)));
  const map = new Map<string, string>();
  // 显式纠正：用户/工具写的 correction Atom；被撤回或明确保留多值时不再标取代。
  for (const a of ordered) {
    if (a.corrects && !withdrawn.has(a.rel) && !retained.has(a.corrects)) map.set(a.corrects, a.rel);
  }
  const newest = new Map<string, { rel: string; at: string }>();
  for (const a of ordered) {
    const at = `${a.date} ${a.time}`;
    const cur = newest.get(a.entry);
    if (!cur || at > cur.at) newest.set(a.entry, { rel: a.rel, at });
  }
  for (const a of ordered) {
    const at = `${a.date} ${a.time}`;
    const n = newest.get(a.entry);
    if (n && n.rel !== a.rel && at < n.at && !retained.has(a.rel) && !map.has(a.rel)) map.set(a.rel, n.rel);
  }
  return map;
};

/** 从 Source 记录（`> 置顶：` / `> 取消置顶：`）派生最终 pin 状态；最新记录生效。 */
export const pinStateBySource = (atoms: ParsedAtom[]): Map<string, boolean> => {
  const events = atoms
    .filter((a) => a.pins || a.unpins)
    .sort(
      (a, b) =>
        (a.adjudicationSeq ?? 0) - (b.adjudicationSeq ?? 0) ||
        `${a.date} ${a.time} ${a.rel}`.localeCompare(`${b.date} ${b.time} ${b.rel}`),
    );
  const state = new Map<string, boolean>();
  for (const a of events) {
    if (a.pins) state.set(a.pins, true);
    if (a.unpins) state.set(a.unpins, false);
  }
  return state;
};

/** 只取最终为 pinned 的 rel；保留给调用方做集合判断。 */
export const pinnedBySource = (atoms: ParsedAtom[]): Set<string> =>
  new Set([...pinStateBySource(atoms).entries()].filter(([, pinned]) => pinned).map(([rel]) => rel));

/** 兼容旧调用：只取被取代的 rel 集合。 */
export const supersededRels = (atoms: ParsedAtom[]): Set<string> => new Set(supersededBy(atoms).keys());

export interface BudgetResult {
  text: string;
  matched: number;
  returned: number;
  dropped: number;
  examples: string[];
  rels: string[];
}

export const selectWithinBudget = (
  scored: ScoredAtom[],
  tokens: string[],
  maxChars: number,
  limit: number,
): BudgetResult => {
  const matched = scored.length;
  const top = scored.slice(0, Math.max(1, limit));
  const lines: string[] = [];
  let used = 0;
  let returned = 0;
  const dropped: string[] = [];
  const rels: string[] = [];
  for (const s of top) {
    const entry = renderAtomEntry(s.atom, Math.round(s.score), tokens, snippetFor(s.atom.body, tokens), s.supersededBy);
    const cost = entry.length + 1;
    if (returned > 0 && used + cost > maxChars) {
      dropped.push(s.atom.rel);
      continue;
    }
    lines.push(entry);
    used += cost;
    returned++;
    rels.push(s.atom.rel);
  }
  for (const s of scored.slice(top.length)) dropped.push(s.atom.rel);
  return {
    text: lines.join("\n"),
    matched,
    returned,
    dropped: Math.max(0, matched - returned),
    examples: dropped.slice(0, 5),
    rels,
  };
};

export const renderTopicRecall = (topic: string, result: BudgetResult, staleCount: number): string => {
  const head = `## 主题召回：${topic || "(空)"}\n`;
  const body = result.text || "（无匹配）";
  const stale = staleCount > 0 ? `\n\n> 其中 ${staleCount} 条可能过时/需验证：较早或低热度；引用前先核对证据。` : "";
  return `${head}${body}${stale}`;
};

/**
 * BM25 宽松兜底：仅在严格匹配整体零结果时用于**候选生成与排序**（中文 2-gram + 拉丁词）。
 * 不改写任何既有严格命中排序 ⇒ parity 安全。返回按 BM25 分降序的 ScoredAtom。
 */
export const bm25Fallback = (
  atoms: ParsedAtom[],
  query: string,
  opts: { meta: Map<string, AtomMeta>; minMatched?: number },
): ScoredAtom[] => {
  const docs = atoms.map((a) => ({ id: a.rel, text: `${a.body} ${a.entry} ${a.rel}` }));
  const minMatched = Math.max(2, opts.minMatched ?? 2);
  const ranked = bm25Rank(query, docs).filter((r) => r.matched >= minMatched);
  const byRel = new Map(atoms.map((a) => [a.rel, a] as const));
  const out: ScoredAtom[] = [];
  for (const r of ranked) {
    const atom = byRel.get(r.id);
    if (!atom) continue;
    const meta = opts.meta.get(atom.rel);
    if (meta && meta.status !== "active" && !meta.pinned) continue;
    out.push({ atom, score: r.score, tier: tierFor(atom.body), deprioritized: false, stale: false, hits: meta?.hits ?? 0 });
  }
  return out;
};
