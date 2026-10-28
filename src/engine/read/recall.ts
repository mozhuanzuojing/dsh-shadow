/**
 * v2 engine/read — 主题召回：打分 → 排序 → limit/预算 → 渲染。
 */

import type { NormalizedConfig } from "../../contract/config.js";
import type { AtomMeta, ParsedAtom } from "../../contract/types.js";
import { ageDays } from "../../contract/time.js";
import { deprioritizeFactor, scoreMemory, snippetFor, tierFor } from "../../domain/rank.js";
import { renderAtomEntry } from "./render.js";

export interface ScoredAtom {
  atom: ParsedAtom;
  score: number;
  tier: "L0" | "L1" | "L2";
  deprioritized: boolean;
  stale: boolean;
  hits: number;
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
}

export const scoreAtoms = (atoms: ParsedAtom[], tokens: string[], opts: ScoreOpts): ScoredAtom[] => {
  const out: ScoredAtom[] = [];
  for (const atom of atoms) {
    if (!atom.body.trim()) continue;
    const meta = opts.meta.get(atom.rel);
    if (opts.config.forget.maxActive > 0 && meta && meta.status !== "active" && !meta.pinned) continue;
    let score = scoreMemory(atom.body, atom.rel, atom.entry, tokens, opts.todayStr);
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
    const dp = deprioritizeFactor(atom.rel, atom.entry, opts.config.recall.deprioritize);
    if (dp !== 1) score *= dp;
    out.push({
      atom,
      score,
      tier: tierFor(atom.body),
      deprioritized: dp !== 1,
      stale,
      hits: meta?.hits ?? 0,
    });
  }
  out.sort((a, b) => b.score - a.score || b.atom.date.localeCompare(a.atom.date) || a.atom.rel.localeCompare(b.atom.rel));
  return out;
};

export interface BudgetResult {
  text: string;
  matched: number;
  returned: number;
  dropped: number;
  examples: string[];
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
  for (const s of top) {
    const entry = renderAtomEntry(s.atom, Math.round(s.score), tokens, snippetFor(s.atom.body, tokens));
    const cost = entry.length + 1;
    if (returned > 0 && used + cost > maxChars) {
      dropped.push(s.atom.rel);
      continue;
    }
    lines.push(entry);
    used += cost;
    returned++;
  }
  for (const s of scored.slice(top.length)) dropped.push(s.atom.rel);
  return {
    text: lines.join("\n"),
    matched,
    returned,
    dropped: Math.max(0, matched - returned),
    examples: dropped.slice(0, 5),
  };
};

export const renderTopicRecall = (topic: string, result: BudgetResult, staleCount: number): string => {
  const head = `## 主题召回：${topic || "(空)"}\n`;
  const body = result.text || "（无匹配）";
  const stale = staleCount > 0 ? `\n\n> 其中 ${staleCount} 条可能过时/需验证：较早或低热度；引用前先核对证据。` : "";
  return `${head}${body}${stale}`;
};
