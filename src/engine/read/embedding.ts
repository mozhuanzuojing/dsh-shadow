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
import { cosine } from "../../domain/embedding.js";
import { astChunks } from "./ast-chunk.js";
import { languageFor } from "./symbols.js";
import { walkCodeFiles, absOf, snippetOf } from "./walk.js";
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

/** 源签名（**只 stat，不读内容**）：rel+size+mtime。用于廉价判断索引是否过期。 */
export const computeSourceSig = async (deps: { fs: FsPort; ws: string }, opts: EmbeddingOptions = {}): Promise<string> => {
  const maxFiles = Math.max(1, Math.min(20000, Number(opts.maxFiles ?? 1500) || 1500));
  const parts: string[] = [];
  await walkCodeFiles(deps, { ignore: opts.ignore, maxFiles }, async (rel, abs) => {
    const st = await deps.fs.stat(abs);
    if (st.ok) parts.push(`${rel}:${st.value.size}:${Math.floor(st.value.mtimeMs)}`);
  });
  parts.sort();
  return createHash("sha1").update(parts.join("\n")).digest("hex").slice(0, 16);
};

/** 进程内索引缓存：查询时命中即复用，避免每次重读 embeddings.json 与重新 stat 遍历。 */
const indexCache = new Map<string, { model: string; entries: EmbeddingEntry[]; dims: number; sourceSig: string }>();
const bgJobs = new Map<string, Promise<void>>();
const bgErrors = new Map<string, { error: string; at: number }>();
const BG_RETRY_MS = 60_000;
const cacheKey = (ws: string): string => String(ws).replace(/\\/g, "/").replace(/\/+$/, "");

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
    for (const c of await astChunks(rel, read.value, languageFor(rel.slice(rel.lastIndexOf("/") + 1)), 1500)) {
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
    const vecs = await embedder.embed(batch.map((c) => `${embedder.docPrefix ?? ""}${c.text}`));
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
  /** 首次/变更后索引为空：已启动后台构建，本次先不返回向量结果。 */
  building?: boolean;
  built: boolean;
  error?: string;
}

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
    // 只做 stat 遍历（不读内容）；命中内存索引则连索引文件都不读。
    const sig = await computeSourceSig(deps, opts);
    const cached = indexCache.get(key);
    if (cached && cached.model === embedder.id && cached.sourceSig === sig) {
      entries = cached.entries;
      dims = cached.dims;
    } else {
      let usable = false;
      const prev = await deps.fs.readText(indexPath(deps.ws));
      if (prev.ok) {
        try {
          const j = JSON.parse(prev.value) as EmbeddingFile;
          if (j?.model === embedder.id && Array.isArray(j.entries) && j.entries.length && j.sourceSig === sig) {
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
            return {
              hits: [],
              model: embedder.id,
              dims: 0,
              built: false,
              error: `向量索引构建失败：${lastErr.error}（${wait}s 后重试）`,
            };
          }
          if (!bgJobs.has(bgKey)) {
            const job = (async () => {
              try {
                const b = await buildEmbeddingIndex(deps, embedder, opts);
                // 写完索引后（mtime/clock 可能变化）重算签名，保证下一次查询命中缓存
                const postSig = await computeSourceSig(deps, opts);
                indexCache.set(key, { model: embedder.id, entries: b.entries, dims: b.dims, sourceSig: postSig });
                bgErrors.delete(bgKey);
              } catch (e) {
                // 失败要可返回给用户，且 60s 内不反复重试（避免每次查询都触发下载/解析）
                bgErrors.set(bgKey, { error: e instanceof Error ? e.message : String(e), at: Date.now() });
              } finally {
                bgJobs.delete(bgKey);
              }
            })();
            bgJobs.set(bgKey, job);
          }
          return { hits: [], model: embedder.id, dims: 0, built: false, building: true };
        }
        const b = await buildEmbeddingIndex(deps, embedder, opts);
        entries = b.entries;
        dims = b.dims;
        built = true;
      }
      // 写入索引会改变 mtime（内存 fs 的 clock 语义），缓存用写完后的签名
      const postSig = built ? await computeSourceSig(deps, opts) : sig;
      indexCache.set(key, { model: embedder.id, entries, dims, sourceSig: postSig });
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
