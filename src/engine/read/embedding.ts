/**
 * v2 engine — 代码 embedding 语义检索（派生索引，可重建）。ADR-0019 阶段 3。
 *
 * 设计：
 * - 索引落 `.shadow/indexes/code/embeddings.json`（派生、可重建，不写 atoms）。
 * - 按块（同 code-search 的 40 行切块）计算向量；按内容 hash 复用，只对新增/变更块重新 embed。
 * - Embedder 可注入（测试用假实现）；默认 HTTP（OpenAI 兼容 /embeddings）。**不可用即显式报错**，不静默降级。
 */

import { createHash } from "node:crypto";
import { chunkCode, isCodeFile, shouldSkipDir } from "../../domain/code-search.js";
import { cosine } from "../../domain/embedding.js";
import type { FsPort } from "../../store/fs.js";

export interface Embedder {
  id: string;
  embed(texts: string[]): Promise<number[][]>;
}

export const makeHttpEmbedder = (cfg: { baseURL: string; apiKeyEnv: string; model: string }): Embedder => ({
  id: `http:${cfg.model || "?"}`,
  async embed(texts: string[]): Promise<number[][]> {
    if (!cfg.model) throw new Error("未配置 codeSearch.embedding.model");
    const key = process.env[cfg.apiKeyEnv] ?? "";
    const res = await fetch(`${cfg.baseURL.replace(/\/$/, "")}/embeddings`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: cfg.model, input: texts }),
    });
    if (!res.ok) throw new Error(`embedding HTTP ${res.status}`);
    const j = (await res.json()) as any;
    const arr: number[][] = (j?.data ?? []).map((d: any) => d?.embedding as number[]);
    if (arr.length !== texts.length) throw new Error(`embedding 返回数量不匹配（${arr.length} != ${texts.length}）`);
    return arr;
  },
});

export interface EmbeddingEntry {
  key: string;
  rel: string;
  start: number;
  end: number;
  snippet: string;
  vec: number[];
}

const absOf = (ws: string, rel: string): string =>
  `${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`.replace(/\/+/g, "/");
const indexPath = (ws: string): string => `${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/.shadow/indexes/code/embeddings.json`;
const hashOf = (text: string): string => createHash("sha1").update(text).digest("hex").slice(0, 16);
const snippetOf = (text: string): string => (String(text).split(/\r?\n/).map((s) => s.trim()).find((s) => s) ?? "").slice(0, 140);

interface EmbeddingFile {
  v: 1;
  model: string;
  dims: number;
  builtAt: string;
  entries: EmbeddingEntry[];
}

export interface EmbeddingOptions {
  maxChunks?: number;
  maxFileBytes?: number;
  maxFiles?: number;
  ignore?: (rel: string, isDir: boolean) => boolean;
}

/** 构建/刷新索引（按 hash 复用旧向量）。 */
export const buildEmbeddingIndex = async (
  deps: { fs: FsPort; ws: string },
  embedder: Embedder,
  opts: EmbeddingOptions = {},
): Promise<{ entries: EmbeddingEntry[]; embedded: number; reused: number; dims: number; truncated: boolean }> => {
  const maxChunks = Math.max(1, Math.min(50000, Number(opts.maxChunks ?? 2000) || 2000));
  const maxFileBytes = Math.max(1024, Number(opts.maxFileBytes ?? 200_000) || 200_000);
  const maxFiles = Math.max(1, Math.min(20000, Number(opts.maxFiles ?? 1500) || 1500));

  // 旧索引（仅当 model 相同才复用）
  let old = new Map<string, EmbeddingEntry>();
  const prev = await deps.fs.readText(indexPath(deps.ws));
  if (prev.ok) {
    try {
      const j = JSON.parse(prev.value) as EmbeddingFile;
      if (j?.model === embedder.id && Array.isArray(j.entries)) for (const e of j.entries) old.set(e.key, e);
    } catch {
      /* 坏索引当没有，重建 */
    }
  }

  const chunks: { key: string; rel: string; start: number; end: number; snippet: string; text: string }[] = [];
  const queue: string[] = [""];
  let scanned = 0;
  let truncated = false;
  while (queue.length && chunks.length < maxChunks) {
    const dirRel = queue.shift()!;
    const listed = await deps.fs.listDir(absOf(deps.ws, dirRel));
    if (!listed.ok) continue;
    for (const e of listed.value) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.type === "dir") {
        if (!shouldSkipDir(e.name) && !opts.ignore?.(rel, true)) queue.push(rel);
        continue;
      }
      if (e.type !== "file" || !isCodeFile(e.name)) continue;
      if (opts.ignore?.(rel, false)) continue;
      if (++scanned > maxFiles) {
        truncated = true;
        break;
      }
      const st = await deps.fs.stat(absOf(deps.ws, rel));
      if (!st.ok || st.value.size > maxFileBytes) continue;
      const read = await deps.fs.readText(absOf(deps.ws, rel));
      if (!read.ok) continue;
      for (const c of chunkCode(rel, read.value, 40)) {
        const h = hashOf(c.text);
        chunks.push({ key: `${rel}#${c.start}-${c.end}#${h}`, rel, start: c.start, end: c.end, snippet: snippetOf(c.text), text: c.text });
        if (chunks.length >= maxChunks) {
          truncated = true;
          break;
        }
      }
    }
  }

  const entries: EmbeddingEntry[] = [];
  const toEmbed: typeof chunks = [];
  let reused = 0;
  for (const c of chunks) {
    const o = old.get(c.key);
    if (o) {
      entries.push(o);
      reused += 1;
    } else {
      toEmbed.push(c);
    }
  }
  let dims = 0;
  for (let i = 0; i < toEmbed.length; i += 64) {
    const batch = toEmbed.slice(i, i + 64);
    const vecs = await embedder.embed(batch.map((c) => c.text));
    if (!dims && vecs[0]) dims = vecs[0].length;
    batch.forEach((c, k) => entries.push({ key: c.key, rel: c.rel, start: c.start, end: c.end, snippet: c.snippet, vec: vecs[k]! }));
  }
  if (!dims) for (const e of entries) if (e.vec?.length) { dims = e.vec.length; break; }

  const file: EmbeddingFile = { v: 1, model: embedder.id, dims, builtAt: new Date().toISOString(), entries };
  await deps.fs.writeText(indexPath(deps.ws), JSON.stringify(file));
  return { entries, embedded: toEmbed.length, reused, dims, truncated };
};

export interface EmbeddingHit {
  rel: string;
  start: number;
  end: number;
  score: number;
  snippet: string;
}
export interface EmbeddingSearchResult {
  hits: EmbeddingHit[];
  model: string;
  dims: number;
  built: boolean;
  error?: string;
}

export const searchEmbedding = async (
  deps: { fs: FsPort; ws: string },
  query: string,
  embedder: Embedder,
  opts: EmbeddingOptions & { limit?: number } = {},
): Promise<EmbeddingSearchResult> => {
  const q = String(query ?? "").trim();
  const limit = Math.max(1, Math.min(30, Number(opts.limit ?? 8) || 8));
  if (!q) return { hits: [], model: embedder.id, dims: 0, built: false };
  let entries: EmbeddingEntry[] = [];
  let dims = 0;
  let built = false;
  try {
    const prev = await deps.fs.readText(indexPath(deps.ws));
    let ok = false;
    if (prev.ok) {
      try {
        const j = JSON.parse(prev.value) as EmbeddingFile;
        if (j?.model === embedder.id && Array.isArray(j.entries) && j.entries.length) {
          entries = j.entries;
          dims = j.dims;
          ok = true;
        }
      } catch {
        /* rebuild */
      }
    }
    if (!ok) {
      const b = await buildEmbeddingIndex(deps, embedder, opts);
      entries = b.entries;
      dims = b.dims;
      built = true;
    }
    if (!entries.length) return { hits: [], model: embedder.id, dims, built, error: "索引为空（没有可嵌入的代码）" };
    const qv = (await embedder.embed([q]))[0] ?? [];
    const scored: EmbeddingHit[] = entries
      .map((e) => ({ rel: e.rel, start: e.start, end: e.end, score: cosine(qv, e.vec), snippet: e.snippet }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { hits: scored, model: embedder.id, dims, built };
  } catch (e) {
    return { hits: [], model: embedder.id, dims, built, error: e instanceof Error ? e.message : String(e) };
  }
};
