/**
 * v2 engine — 内置本地向量化（无 provider 也能用）。ADR-0022。
 *
 * 不是神经网络语义模型：用**特征哈希**把「词 + 相邻词 + 字符 3-gram + 中文 2-gram」
 * 映射到固定维度（默认 512），TF 取 1+log，L2 归一。确定性、零依赖、离线。
 * 它提供的是**子词/词袋近似**（对拼写、词形变化更稳），不是同义语义；
 * 需要真语义时在配置里切到 OpenAI 兼容 `/embeddings`（provider: "http"）。
 */

import { cjkBigrams } from "../../domain/rank.js";
import type { Embedder } from "./embedding.js";

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const fnv1a = (s: string): number => {
  let h = FNV_OFFSET;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0;
};

const tokensOf = (text: string): string[] => {
  const s = String(text ?? "").toLowerCase();
  const out: string[] = [];
  for (const m of s.matchAll(/[a-z0-9_]{2,}/g)) out.push(m[0]!);
  for (const b of cjkBigrams(s)) out.push(b);
  return out;
};

const addFeature = (feats: Map<string, number>, key: string, weight: number): void => {
  if (weight <= 0) return;
  feats.set(key, (feats.get(key) ?? 0) + weight);
};

/** 把一段文本转成确定性向量（512 维、L2 归一）。 */
export const localEmbedText = (text: string, dims = 512): number[] => {
  const feats = new Map<string, number>();
  const tokens = tokensOf(text);
  for (const tok of tokens) {
    addFeature(feats, `w:${tok}`, 1);
    if (tok.length >= 3) {
      for (let i = 0; i + 3 <= tok.length; i++) addFeature(feats, `c:${tok.slice(i, i + 3)}`, 0.3);
    }
  }
  for (let i = 0; i + 1 < tokens.length; i++) addFeature(feats, `b:${tokens[i]}_${tokens[i + 1]}`, 0.5);

  const vec = new Array<number>(dims).fill(0);
  for (const [key, weight] of feats) {
    const h = fnv1a(key);
    const idx = h % dims;
    const sign = (h >>> 1) % 2 === 0 ? 1 : -1;
    vec[idx]! += sign * (1 + Math.log(weight));
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < dims; i++) vec[i] = vec[i]! / norm;
  return vec;
};

/** 内置 embedder（无需网络/模型文件）。id 固定，便于索引复用。 */
export const makeLocalEmbedder = (dims = 512): Embedder => ({
  id: `local:hash-${dims}`,
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((t) => localEmbedText(t, dims));
  },
});
