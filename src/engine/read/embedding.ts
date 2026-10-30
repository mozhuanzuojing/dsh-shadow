/**
 * v2 engine — 代码 embedding 语义检索（派生索引，可重建）。ADR-0019 阶段 3。
 *
 * - 索引 `.shadow/indexes/code/embeddings.json`（派生、可重建）。
 * - 40 行块；按内容 hash 复用，只对新增/变更块重新 embed。
 * - 源文件集合签名（rel+size）变化即触发重建 —— 解决"索引建好后永不刷新"的陈旧问题。
 * - 查询时对索引条目**再次套用 ignore/exclude**，避免改配置后旧索引泄露被排除文件。
 * - Embedder 可注入（测试用假实现）；默认 HTTP（OpenAI 兼容 /embeddings）。不可用即返回 error。
 */

import { createHash } from "node:crypto";
import { chunkCode } from "../../domain/code-search.js";
import { cosine } from "../../domain/embedding.js";
import { walkCodeFiles, absOf, snippetOf } from "./walk.js";
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

const indexPath = (ws: string): string => `${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/.shadow/indexes/code/embeddings.json`;
const hashOf = (text: string): string => createHash("sha1").update(text).digest("hex").slice(0, 16);

interface EmbeddingFile {
  v: 2;
  model: string;
  dims: number;
  sourceSig: string;
  builtAt: string;
  entries: EmbeddingEntry[];
}

export interface EmbeddingOptions {
  maxChunks?: number;
  maxFileBytes?: number;
  maxFiles?: number;
  ignore?: (rel: string, isDir: boolean) => boolean;
}

/** 源文件内容签名（逐文件内容 sha1；能检测同尺寸改动，代价是一次读取遍历）。 */
export const computeSourceSig = async (deps: { fs: FsPort; ws: string }, opts: EmbeddingOptions = {}): Promise<string> => {
  const maxFiles = Math.max(1, Math.min(20000, Number(opts.maxFiles ?? 1500) || 1500));
  const parts: string[] = [];
  await walkCodeFiles(deps, { ignore: opts.ignore, maxFiles }, async (rel, abs) => {
    const read = await deps.fs.readText(abs);
    if (read.ok) parts.push(`${rel}:${createHash("sha1").update(read.value).digest("hex").slice(0, 16)}`);
  });
  parts.sort();
  return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
};

export const buildEmbeddingIndex = async (
  deps: { fs: FsPort; ws: string },
  embedder: Embedder,
  opts: EmbeddingOptions = {},
): Promise<{ entries: EmbeddingEntry[]; embedded: number; reused: number; dims: number; truncated: boolean }> => {
  const maxChunks = Math.max(1, Math.min(50000, Number(opts.maxChunks ?? 2000) || 2000));
  const maxFileBytes = Math.max(1024, Number(opts.maxFileBytes ?? 200_000) || 200_000);
  const maxFiles = Math.max(1, Math.min(20000, Number(opts.maxFiles ?? 1500) || 1500));

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
  let truncated = false;
  await walkCodeFiles(deps, { ignore: opts.ignore, maxFiles }, async (rel, abs) => {
    if (chunks.length >= maxChunks) {
      truncated = true;
      return false;
    }
    const st = await deps.fs.stat(abs);
    if (!st.ok || st.value.size > maxFileBytes) return;
    const read = await deps.fs.readText(abs);
    if (!read.ok) return;
    for (const c of chunkCode(rel, read.value, 40)) {
      const h = hashOf(c.text);
      chunks.push({ key: `${rel}#${c.start}-${c.end}#${h}`, rel, start: c.start, end: c.end, snippet: snippetOf(c.text), text: c.text });
      if (chunks.length >= maxChunks) {
        truncated = true;
        return false;
      }
    }
  });

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

  const sourceSig = await computeSourceSig(deps, opts);
  const file: EmbeddingFile = { v: 2, model: embedder.id, dims, sourceSig, builtAt: new Date().toISOString(), entries };
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
    let usable = false;
    if (prev.ok) {
      try {
        const j = JSON.parse(prev.value) as EmbeddingFile;
        if (j?.model === embedder.id && Array.isArray(j.entries) && j.entries.length) {
          const sig = await computeSourceSig(deps, opts);
          if (sig === j.sourceSig) {
            entries = j.entries;
            dims = j.dims;
            usable = true;
          }
        }
      } catch {
        /* rebuild */
      }
    }
    if (!usable) {
      const b = await buildEmbeddingIndex(deps, embedder, opts);
      entries = b.entries;
      dims = b.dims;
      built = true;
    }
    // 查询时再套一次 ignore（防止改 exclude 后旧条目泄露被排除文件）
    const filtered = opts.ignore ? entries.filter((e) => !opts.ignore!(e.rel, false)) : entries;
    if (!filtered.length) return { hits: [], model: embedder.id, dims, built, error: "索引为空（没有可嵌入的代码）" };
    const qv = (await embedder.embed([q]))[0] ?? [];
    const scored: EmbeddingHit[] = filtered
      .map((e) => ({ rel: e.rel, start: e.start, end: e.end, score: cosine(qv, e.vec), snippet: e.snippet }))
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { hits: scored, model: embedder.id, dims, built };
  } catch (e) {
    return { hits: [], model: embedder.id, dims, built, error: e instanceof Error ? e.message : String(e) };
  }
};
