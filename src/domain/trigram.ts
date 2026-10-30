/**
 * v2 domain — trigram 倒排用的纯函数（借鉴 Cursor/GitHub Blackbird 的候选集思路）。
 *
 * 文档：取所有长度为 3 的字符窗口；
 * 查询：把词拆成 trigram，用「同词内全含（AND）、多词间取并（OR）」缩小候选。
 * 只做候选裁剪，最终仍由 BM25/精确匹配排序（与 Cursor「先 trigram 查候选、再精确匹配」一致）。
 */

export const trigramsOf = (text: string): string[] => {
  const s = String(text ?? "");
  if (s.length < 3) return [];
  const out: string[] = [];
  for (let i = 0; i + 3 <= s.length; i++) out.push(s.slice(i, i + 3));
  return out;
};

/** 取一个词/标识符的 trigram（去重、保持顺序）。 */
export const termTrigrams = (term: string): string[] => Array.from(new Set(trigramsOf(String(term ?? "").toLowerCase())));

/** 从 query 拆出可用的 trigram 词：按非标识符字符切分，长度 >= 3。 */
export const queryTerms = (query: string): string[] =>
  String(query ?? "")
    .toLowerCase()
    .split(/[^a-z0-9_\u4e00-\u9fff]+/)
    .filter((t) => t.length >= 3);
