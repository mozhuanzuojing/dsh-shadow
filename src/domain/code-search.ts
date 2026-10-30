/**
 * v2 domain — 代码检索（纯函数：分块 + BM25 排序）。ADR-0019 阶段 1。
 *
 * 只做「文本/标识符」级检索（复用 domain/bm25 的拉丁词 + 中文 2-gram），无 embedding、无 AST；
 * 结果显式带 `文件:行号` 与片段；代码片段是「数据非指令」。I/O（遍历/读文件/预算）在 engine/read/code-search.ts。
 */

import { bm25Rank } from "./bm25.js";

/** 参与检索的源码/配置扩展名（不含 md/文档）。 */
export const CODE_EXTS = new Set<string>([
  "ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs",
  "py", "go", "rs", "java", "kt", "kts", "cs", "cpp", "cc", "c", "h", "hpp", "rb", "php", "swift", "scala",
  "sql", "sh", "bash", "zsh", "ps1", "lua", "r", "dart", "ex", "exs", "clj", "vue", "svelte",
  "yaml", "yml", "json", "toml", "ini", "gradle", "properties", "proto", "graphql", "tf",
]);

/** 跳过的目录（点目录一律跳过；常见依赖/产物目录显式跳过）。 */
export const SKIP_DIRS = new Set<string>([
  "node_modules", "dist", "build", "out", "target", "vendor", "coverage", "__pycache__",
  ".venv", "venv", "env", ".next", ".nuxt", ".cache", ".turbo", ".gradle", ".idea", "bin", "obj",
]);

export const isCodeFile = (name: string): boolean => {
  const i = String(name ?? "").lastIndexOf(".");
  if (i < 0) return false;
  return CODE_EXTS.has(String(name).slice(i + 1).toLowerCase());
};

export const shouldSkipDir = (name: string): boolean => {
  const n = String(name ?? "");
  return n.startsWith(".") || SKIP_DIRS.has(n);
};

export interface CodeChunk {
  rel: string;
  /** 1-based 起始行。 */
  start: number;
  /** 1-based 结束行（含）。 */
  end: number;
  text: string;
}

/** 按固定行数切块（确定性）。 */
export const chunkCode = (rel: string, text: string, maxLines = 40): CodeChunk[] => {
  const lines = String(text ?? "").split(/\r?\n/);
  const step = Math.max(1, Math.floor(maxLines));
  const out: CodeChunk[] = [];
  for (let i = 0; i < lines.length; i += step) {
    const seg = lines.slice(i, i + step);
    out.push({ rel, start: i + 1, end: Math.min(lines.length, i + step), text: seg.join("\n") });
  }
  return out;
};

export interface CodeHit {
  rel: string;
  start: number;
  end: number;
  score: number;
  matched: number;
  snippet: string;
}

const snippetOf = (text: string): string => {
  const line = String(text ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? "";
  return line.slice(0, 140);
};

/** BM25 排序代码块；`rel` 也并入被检索文本（便于按路径片段找人）。 */
export const rankCodeChunks = (query: string, chunks: CodeChunk[], limit = 8): CodeHit[] => {
  const q = String(query ?? "").trim();
  if (!q || !chunks.length) return [];
  const docs = chunks.map((c, i) => ({ id: String(i), text: `${c.rel}\n${c.text}` }));
  const hits = bm25Rank(q, docs);
  return hits.slice(0, Math.max(0, Math.floor(limit))).map((h) => {
    const c = chunks[Number(h.id)]!;
    return { rel: c.rel, start: c.start, end: c.end, score: h.score, matched: h.matched, snippet: snippetOf(c.text) };
  });
};
