/**
 * v2 engine — 代码 embedding 语义检索（派生索引，可重建）。ADR-0019/0021/0022。
 *
 * 与代码索引**共用 AST 块**：向量索引直接复用 `code-index` 的 chunks 与根签名，
 * 不再二次 walk/解析/存储全文（避免冗余与口径漂移）。
 * - 索引 `.shadow/indexes/code/embeddings.json`：只存 id/位置/片段/向量，不存全文。
 * - `sourceSig` = 代码索引 root（内容 hash 聚合），内容变才重建。
 * - 异步构建（Cursor 式）：首次/变更后后台建，查询先返回 building；失败可见 + 60s 退避。
 */

import { cosine } from "../../domain/embedding.js";
import { refreshCodeIndex, type IndexChunk } from "./code-index.js";
import { snippetOf } from "./walk.js";
import type { FsPort } from "../../store/fs.js";

export interface Embedder {
  id: string;
  /** 查询侧前缀（如 e5 的 "query: "）。 */
  queryPrefix?: string;
  /** 文档/代码块侧前缀（如 e5 的 "passage: "）。 */
  docPrefix?: string;
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
  /** = 代码索引 chunk.id（rel#start-end#hash）。 */
  key: string;
  rel: string;
  start: number;
  end: number;
  snippet: string;
  vec: number[];
}

const indexPath = (ws: string): string => `${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/.shadow/indexes/code/embeddings.json`;
const cacheKey = (ws: string): string => String(ws).replace(/\\/g, "/").replace(/\/+$/, "");

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
  maxBytes?: number;
  maxFiles?: number;
  ignore?: (rel: string, isDir: boolean) => boolean;
  /** 复用代码索引已解析的块（工具层传入，避免二次 walk/解析）。 */
  chunks?: IndexChunk[];
  /** 与 chunks 配套的代码索引根签名。 */
  sourceSig?: string;
}

const getChunks = async (
  deps: { fs: FsPort; ws: string },
  opts: EmbeddingOptions,
): Promise<{ chunks: IndexChunk[]; root: string }> => {
  if (opts.chunks && opts.sourceSig) return { chunks: opts.chunks, root: opts.sourceSig };
  const r = await refreshCodeIndex(deps, {
    maxChunks: opts.maxChunks,
    maxBytes: opts.maxBytes,
    maxFiles: opts.maxFiles,
    ignore: opts.ignore,
  });
  return { chunks: r.chunks, root: r.file.root };
};

export const buildEmbeddingIndex = async (
  deps: { fs: FsPort; ws: string },
  embedder: Embedder,
  opts: EmbeddingOptions = {},
): Promise<{ entries: EmbeddingEntry[]; embedded: number; reused: number; dims: number; truncated: boolean }> => {
  const { chunks, root } = await getChunks(deps, opts);
  const maxChunks = Math.max(1, Math.min(50000, Number(opts.maxChunks ?? 2000) || 2000));
  const selected = chunks.slice(0, maxChunks);
  const truncated = chunks.length > selected.length;

  // 旧索引（仅当 model 相同才复用）
  const old = new Map<string, EmbeddingEntry>();
  const prev = await deps.fs.readText(indexPath(deps.ws));
  if (prev.ok) {
    try {
      const j = JSON.parse(prev.value) as EmbeddingFile;
      if (j?.model === embedder.id && Array.isArray(j.entries)) for (const e of j.entries) old.set(e.key, e);
    } catch {
      /* 坏索引当没有，重建 */
    }
  }

  const entries: EmbeddingEntry[] = [];
  const toEmbed: IndexChunk[] = [];
  let reused = 0;
  for (const c of selected) {
    const o = old.get(c.id);
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
    const vecs = await embedder.embed(batch.map((c) => `${embedder.docPrefix ?? ""}${c.text}`));
    if (!dims && vecs[0]) dims = vecs[0].length;
    batch.forEach((c, k) =>
      entries.push({ key: c.id, rel: c.rel, start: c.start, end: c.end, snippet: snippetOf(c.text), vec: vecs[k]! }),
    );
  }
  if (!dims) for (const e of entries) if (e.vec?.length) { dims = e.vec.length; break; }

  const file: EmbeddingFile = { v: 2, model: embedder.id, dims, sourceSig: root, builtAt: new Date().toISOString(), entries };
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
  /** 首次/变更后索引为空：已启动后台构建，本次先不返回向量结果。 */
  building?: boolean;
  built: boolean;
  error?: string;
}

const indexCache = new Map<string, { model: string; entries: EmbeddingEntry[]; dims: number; sourceSig: string }>();
const bgJobs = new Map<string, Promise<void>>();
const bgErrors = new Map<string, { error: string; at: number }>();
const BG_RETRY_MS = 60_000;

export const searchEmbedding = async (
  deps: { fs: FsPort; ws: string },
  query: string,
  embedder: Embedder,
  opts: EmbeddingOptions & { limit?: number; asyncBuild?: boolean } = {},
): Promise<EmbeddingSearchResult> => {
  const q = String(query ?? "").trim();
  const limit = Math.max(1, Math.min(30, Number(opts.limit ?? 8) || 8));
  if (!q) return { hits: [], model: embedder.id, dims: 0, built: false };
  const key = cacheKey(deps.ws);
  let entries: EmbeddingEntry[] = [];
  let dims = 0;
  let built = false;
  try {
    const { chunks, root } = await getChunks(deps, opts);
    const cached = indexCache.get(key);
    if (cached && cached.model === embedder.id && cached.sourceSig === root) {
      entries = cached.entries;
      dims = cached.dims;
    } else {
      let usable = false;
      const prev = await deps.fs.readText(indexPath(deps.ws));
      if (prev.ok) {
        try {
          const j = JSON.parse(prev.value) as EmbeddingFile;
          if (j?.model === embedder.id && Array.isArray(j.entries) && j.entries.length && j.sourceSig === root) {
            entries = j.entries;
            dims = j.dims;
            usable = true;
          }
        } catch {
          /* rebuild */
        }
      }
      if (!usable) {
        // 首次/变更后：神经模型建索引很贵 → 后台构建，本次先返回 building（Cursor 式异步索引）。
        if (opts.asyncBuild) {
          const bgKey = `${key}|${embedder.id}`;
          const lastErr = bgErrors.get(bgKey);
          if (lastErr && Date.now() - lastErr.at < BG_RETRY_MS) {
            const wait = Math.ceil((BG_RETRY_MS - (Date.now() - lastErr.at)) / 1000);
            return { hits: [], model: embedder.id, dims: 0, built: false, error: `向量索引构建失败：${lastErr.error}（${wait}s 后重试）` };
          }
          if (!bgJobs.has(bgKey)) {
            const job = (async () => {
              try {
                const b = await buildEmbeddingIndex(deps, embedder, { ...opts, chunks, sourceSig: root });
                indexCache.set(key, { model: embedder.id, entries: b.entries, dims: b.dims, sourceSig: root });
                bgErrors.delete(bgKey);
              } catch (e) {
                bgErrors.set(bgKey, { error: e instanceof Error ? e.message : String(e), at: Date.now() });
              } finally {
                bgJobs.delete(bgKey);
              }
            })();
            bgJobs.set(bgKey, job);
          }
          return { hits: [], model: embedder.id, dims: 0, built: false, building: true };
        }
        const b = await buildEmbeddingIndex(deps, embedder, { ...opts, chunks, sourceSig: root });
        entries = b.entries;
        dims = b.dims;
        built = true;
      }
      if (!cached || built) indexCache.set(key, { model: embedder.id, entries, dims, sourceSig: root });
    }
    // 查询时再套一次 ignore（防止改 exclude 后旧条目泄露被排除文件）
    const filtered = opts.ignore ? entries.filter((e) => !opts.ignore!(e.rel, false)) : entries;
    if (!filtered.length) return { hits: [], model: embedder.id, dims, built, error: "索引为空（没有可嵌入的代码）" };
    const qv = (await embedder.embed([`${embedder.queryPrefix ?? ""}${q}`]))[0] ?? [];
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
