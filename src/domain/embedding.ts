/**
 * v2 domain — embedding 纯函数（余弦相似度）。ADR-0019 阶段 3。
 * 向量由外部 Embedder 提供（HTTP/本地）；这里只做数学，便于用假 embedder 离线单测。
 */

export const cosine = (a: number[], b: number[]): number => {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
};
