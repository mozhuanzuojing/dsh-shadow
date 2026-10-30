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

// ── 宽松匹配（CJK 字形近似，非语义）─────────────────────────────────
// 由来：中文不分词，`tokenize` 按标点/空格切词，于是一个查询词（如「后端入口」）
// 与原文（如「后端工程入口是 …」）字面不相交 ⇒ 严格匹配 score=0，召回为空。
// 这里用 2-gram 覆盖率做**兜底**：只在严格匹配**零结果**时才启用（见 engine/read/modes.ts），
// 因此不改变既有排序、不触碰 parity 的 19 条既有命中。它是字面近似，不是语义/向量召回。
export const STOP_BIGRAMS = new Set<string>([
  "我们", "你们", "他们", "这个", "那个", "什么", "怎么", "可以", "一个", "一下", "现在", "已经",
  "因为", "所以", "但是", "如果", "就是", "不是", "没有", "知道", "自己", "时候", "然后", "并且",
  "以及", "还是", "这样", "那样", "需要", "进行", "通过", "对于", "关于", "由于", "于是", "可是",
  "只是", "这些", "那些", "一种", "一些", "可能", "应该", "必须", "能够", "不能", "不会", "不要",
  "不用", "之前", "之后", "当前", "上面", "下面", "里面", "外面", "东西", "事情", "问题", "地方",
  "方式", "方法", "存在", "是的", "的了",
]);

/** 中文（CJK）连续段的 2-gram 列表（不跨非中文边界）。 */
export const cjkBigrams = (text: string): string[] => {
  const out: string[] = [];
  for (const run of String(text ?? "").matchAll(/[\u4e00-\u9fff]+/g)) {
    const s = run[0]!;
    for (let i = 0; i + 1 < s.length; i++) out.push(s.slice(i, i + 2));
  }
  return out;
};

/** 查询里「有内容」的 CJK bigram 有多少出现在 hay 中（去重计数，忽略停用 bigram）。 */
export const fuzzyOverlap = (query: string, hay: string): number => {
  const q = new Set(cjkBigrams(query).filter((b) => !STOP_BIGRAMS.has(b)));
  if (!q.size) return 0;
  const h = new Set(cjkBigrams(hay));
  let hit = 0;
  for (const b of q) if (h.has(b)) hit++;
  return hit;
};

/** 兜底命中判据：至少 2 个内容 bigram 命中（宽松召回优先；只在严格零结果时启用，乱命中面由调用方限制）。 */
export const FUZZY_MIN_HIT = 2;
export const fuzzyHit = (query: string, hay: string): boolean => {
  const total = new Set(cjkBigrams(query).filter((b) => !STOP_BIGRAMS.has(b))).size;
  if (total < FUZZY_MIN_HIT) return false;
  return fuzzyOverlap(query, hay) >= FUZZY_MIN_HIT;
};
