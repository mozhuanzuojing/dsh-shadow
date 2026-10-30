/**
 * v2 domain — BM25 全文检索（中文 2-gram + 拉丁词，纯函数、确定性、无依赖）。
 *
 * 用途：当**严格字面匹配整体零结果**时，作为「宽松兜底」的候选生成与排序。
 * 只作兜底（见 engine/read/modes.ts），不改变既有严格命中排序 ⇒ parity 安全。
 * 中文不分词 ⇒ 用 2-gram 当 term（与 rank.ts 的 cjkBigrams 同一实现）。
 */

import { STOP_BIGRAMS, cjkBigrams } from "./rank.js";

/**
 * 文本 → 检索 term 列表（保留重复，供 TF 统计）：
 * - 拉丁/数字词（≥2 字符，小写）
 * - 中文连续段的 2-gram（去停用 bigram）
 */
export const searchTerms = (text: string): string[] => {
  const s = String(text ?? "");
  const out: string[] = [];
  for (const m of s.toLowerCase().matchAll(/[a-z0-9_]{2,}/g)) out.push(m[0]!);
  for (const b of cjkBigrams(s)) if (!STOP_BIGRAMS.has(b)) out.push(b);
  return out;
};

export interface Bm25Doc {
  id: string;
  text: string;
}

export interface Bm25Hit {
  id: string;
  score: number;
  /** 命中的查询 term 数（去重口径）。 */
  matched: number;
}

/**
 * BM25 排序。`k1`/`b` 取常用默认（1.2 / 0.75）。
 * 返回 `matched > 0` 的文档，按 score 降序（同分按 id 升序，确定性）。
 */
export const bm25Rank = (query: string, docs: Bm25Doc[], k1 = 1.2, b = 0.75): Bm25Hit[] => {
  const qTerms = Array.from(new Set(searchTerms(query)));
  if (!qTerms.length || !docs.length) return [];
  const docTerms = docs.map((d) => searchTerms(d.text));
  const N = docs.length;
  const df = new Map<string, number>();
  for (const terms of docTerms) {
    for (const t of new Set(terms)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const avgdl = docTerms.reduce((a, t) => a + t.length, 0) / Math.max(1, N) || 1;
  const hits: Bm25Hit[] = [];
  docs.forEach((d, i) => {
    const terms = docTerms[i]!;
    if (!terms.length) return;
    const tf = new Map<string, number>();
    for (const t of terms) tf.set(t, (tf.get(t) ?? 0) + 1);
    let score = 0;
    let matched = 0;
    for (const q of qTerms) {
      const f = tf.get(q);
      if (!f) continue;
      matched++;
      const n = df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      const dl = terms.length;
      score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * dl) / avgdl)));
    }
    if (matched > 0) hits.push({ id: d.id, score, matched });
  });
  hits.sort((a, b2) => b2.score - a.score || a.id.localeCompare(b2.id));
  return hits;
};
