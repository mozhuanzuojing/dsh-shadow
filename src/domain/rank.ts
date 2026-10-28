/**
 * v2 domain — 召回打分与提示（纯函数）。
 *
 * 口径与 v1 `retrieval/rank.ts` 一致：entry 6 / topic 4 / path 3 / body 1，逐 token 取最大；
 * 再加新近度加成；deprioritize 只降权不移除。
 */

import { topicsInText } from "./text.js";

export const scoreMemory = (
  text: string,
  rel: string,
  entry: string,
  tokens: string[],
  todayStr: string,
): number => {
  if (!tokens.length) return 0;
  const low = String(text ?? "").toLowerCase();
  const lowRel = String(rel ?? "").toLowerCase();
  const entryLow = String(entry ?? "").toLowerCase();
  const tags = topicsInText(text, entry);
  let score = 0;
  for (const t of tokens) {
    let hit = 0;
    if (entryLow.includes(t)) hit = Math.max(hit, 6);
    if (tags.some((tag) => tag.toLowerCase().includes(t))) hit = Math.max(hit, 4);
    if (lowRel.includes(t)) hit = Math.max(hit, 3);
    if (low.includes(t)) hit = Math.max(hit, 1);
    score += hit;
  }
  if (!score) return 0;
  const m = String(rel ?? "").match(/(\d{4}-\d{2}-\d{2})/);
  if (m) {
    const days = Math.round((Date.parse(todayStr) - Date.parse(m[1]!)) / 86400000);
    score += Math.max(0, 3 - Math.floor(days / 7));
  }
  return score;
};

export const DEPRIORITIZE_FACTOR = 0.4;

export const deprioritizeFactor = (
  rel: string,
  entry: string,
  patterns?: string[] | string,
): number => {
  const list = typeof patterns === "string" ? [patterns] : Array.isArray(patterns) ? patterns : [];
  if (!list.length) return 1;
  const norm = (s: unknown): string => String(s ?? "").toLowerCase().replace(/\\/g, "/");
  const hay = `${norm(rel)} ${norm(entry)}`;
  for (const p of list) {
    const q = norm(p).trim();
    if (q && hay.includes(q)) return DEPRIORITIZE_FACTOR;
  }
  return 1;
};

export const approxEntries = (query: string, entries: string[], k = 3): string[] => {
  const grams = (s: string): string[] => {
    const t = String(s ?? "").toLowerCase().replace(/\s+/g, " ");
    const out: string[] = [];
    for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
    return out;
  };
  const qg = new Set(grams(query));
  if (!qg.size) return [];
  const seen = new Set<string>();
  const scored: { e: string; s: number }[] = [];
  for (const e of entries) {
    const name = String(e ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const eg = grams(name);
    if (!eg.length) continue;
    let hit = 0;
    for (const g of eg) if (qg.has(g)) hit++;
    if (hit < 2) continue;
    const s = hit / Math.sqrt(qg.size * eg.length);
    if (s >= 0.25) scored.push({ e: name, s });
  }
  scored.sort((a, b) => b.s - a.s || a.e.localeCompare(b.e));
  return scored.slice(0, Math.max(0, k)).map((x) => x.e);
};

export const breakdownOf = (
  text: string,
  rel: string,
  entry: string,
  tokens: string[],
  deprioritized = false,
): { entry: number; topic: number; path: number; body: number; deprioritized: boolean } => {
  const low = String(text ?? "").toLowerCase();
  const lowRel = String(rel ?? "").toLowerCase();
  const entryLow = String(entry ?? "").toLowerCase();
  const tags = topicsInText(text, entry);
  const parts = { entry: 0, topic: 0, path: 0, body: 0, deprioritized };
  for (const t of tokens) {
    if (entryLow.includes(t)) parts.entry += 6;
    if (tags.some((tag) => tag.toLowerCase().includes(t))) parts.topic += 4;
    if (lowRel.includes(t)) parts.path += 3;
    if (low.includes(t)) parts.body += 1;
  }
  return parts;
};

export const snippetFor = (text: string, tokens: string[]): string => {
  const lines = String(text ?? "").split("\n");
  const skip = (l: string): boolean => /^\s*($|#|> )/.test(l);
  const isAction = (l: string): boolean => /改\/读 |调用 /.test(l);
  const low = (l: string): string => l.toLowerCase();
  for (const l of lines) {
    if (skip(l) || !l.trim() || isAction(l)) continue;
    if (tokens.some((t) => low(l).includes(t))) return l.trim().slice(0, 140);
  }
  for (const l of lines) {
    if (skip(l) || !l.trim()) continue;
    if (tokens.some((t) => low(l).includes(t))) return l.trim().slice(0, 140);
  }
  for (const l of lines) {
    if (!skip(l) && l.trim()) return l.trim().slice(0, 140);
  }
  return "";
};

export const memorySummary = (text: string): string =>
  (String(text ?? "").match(/^> 摘要：(.+)$/m) ?? [])[1] ?? "";

export const tierFor = (text: string): "L0" | "L1" | "L2" => {
  const body = String(text ?? "");
  const bodyLines = body.split("\n").filter((l) => /^\s*-\s*\[/.test(l));
  const actionLines = bodyLines.filter((l) => /改\/读 |调用 /.test(l)).length;
  const hasThought = /(用户：|决定 |结论|分析|为什么|注意|边界|坑)/.test(body);
  if (hasThought) return "L2";
  if (bodyLines.length && actionLines / bodyLines.length > 0.6) return "L0";
  return "L1";
};
