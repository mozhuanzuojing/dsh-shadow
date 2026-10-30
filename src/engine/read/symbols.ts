/**
 * v2 engine — tree-sitter 符号抽取（真 AST）。ADR-0019 阶段 2 / ADR-0020。
 *
 * 依赖：`web-tree-sitter`（MIT）+ `tree-sitter-wasms`（Unlicense）提供的预编译 `.wasm`。
 * 失败（依赖缺失 / wasm 不兼容）**显式返回 error**，由调用方以 `unavailable` 披露，绝不静默降级。
 * 只读：不写任何文件；符号是「代码结构」，不是记忆。
 */

import Parser from "web-tree-sitter";
import { createRequire } from "node:module";
import { isCodeFile, shouldSkipDir } from "../../domain/code-search.js";
import type { FsPort } from "../../store/fs.js";

const req = createRequire(import.meta.url);
const P: any = Parser as any;

let initPromise: Promise<void> | null = null;
const langCache = new Map<string, any>();
const parserCache = new Map<string, any>();

const EXT_LANG: Record<string, string> = {
  ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "javascript", mjs: "javascript", cjs: "javascript",
  py: "python", go: "go", rs: "rust", java: "java", cs: "c_sharp",
  cpp: "cpp", cc: "cpp", c: "c", h: "cpp", hpp: "cpp",
  rb: "ruby", php: "php", swift: "swift", scala: "scala", kt: "kotlin", kts: "kotlin",
  lua: "lua", sh: "bash", bash: "bash", vue: "vue", dart: "dart",
  ex: "elixir", exs: "elixir", zig: "zig",
};

export const languageFor = (name: string): string | null => {
  const i = name.lastIndexOf(".");
  if (i < 0) return null;
  return EXT_LANG[name.slice(i + 1).toLowerCase()] ?? null;
};

const ensureInit = async (): Promise<void> => {
  if (!initPromise) initPromise = P.init();
  await initPromise;
};

const loadLanguage = async (lang: string): Promise<any> => {
  const cached = langCache.get(lang);
  if (cached) return cached;
  const wasm = req.resolve(`tree-sitter-wasms/out/tree-sitter-${lang}.wasm`);
  const L = await P.Language.load(wasm);
  langCache.set(lang, L);
  return L;
};

export interface SymbolHit {
  rel: string;
  kind: string;
  name: string;
  /** 1-based 行号。 */
  line: number;
}

const KIND: Record<string, string> = {
  function_declaration: "function",
  function_definition: "function",
  method_definition: "method",
  method_declaration: "method",
  class_declaration: "class",
  class_definition: "class",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
  struct_specifier: "struct",
  trait_item: "trait",
  impl_item: "impl",
  module: "module",
  mod_item: "module",
  namespace_definition: "namespace",
  lexical_declaration: "const",
  variable_declaration: "var",
  variable_declarator: "const",
  const_item: "const",
  public_method_definition: "method",
};

const isSymbolType = (t: string): boolean => t in KIND || /(function|method|class|interface|enum|struct|trait|impl)/.test(t);
const kindOf = (t: string): string =>
  KIND[t] ?? (/(function|method)/.test(t) ? "function" : /(class|struct|trait|impl)/.test(t) ? "class" : /(interface|type|enum)/.test(t) ? "type" : "symbol");

const nameOf = (node: any): string => {
  try {
    const n = node.childForFieldName?.("name");
    if (n?.text) return String(n.text);
  } catch {
    /* ignore */
  }
  for (const c of node.namedChildren ?? []) {
    const t = String(c?.type ?? "");
    if (/identifier|property_identifier|type_identifier|field_identifier/.test(t)) return String(c.text ?? "");
  }
  return "";
};

/** 解析一段源码，抽取顶层/嵌套的符号（函数/类/接口/type/enum/struct…）。 */
export const extractSymbols = async (rel: string, text: string, lang: string): Promise<SymbolHit[]> => {
  await ensureInit();
  const L = await loadLanguage(lang);
  let parser = parserCache.get(lang);
  if (!parser) {
    parser = new P();
    parser.setLanguage(L);
    parserCache.set(lang, parser);
  }
  const tree = parser.parse(text);
  const hits: SymbolHit[] = [];
  const walk = (node: any, depth: number): void => {
    if (!node || depth > 60) return;
    const t = String(node.type ?? "");
    if (isSymbolType(t)) {
      const name = nameOf(node);
      if (name) hits.push({ rel, kind: kindOf(t), name, line: (node.startPosition?.row ?? 0) + 1 });
    }
    for (const c of node.namedChildren ?? []) walk(c, depth + 1);
  };
  walk(tree.rootNode, 0);
  try {
    tree.delete?.();
  } catch {
    /* ignore */
  }
  return hits;
};

export interface SymbolSearchResult {
  hits: SymbolHit[];
  scannedFiles: number;
  parsedFiles: number;
  truncated: boolean;
  error?: string;
}

const absOf = (ws: string, rel: string): string =>
  `${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`.replace(/\/+/g, "/");

/**
 * 在代码里找符号（定义/入口）：先按文本是否包含查询词做**廉价预筛**，只对命中的代码文件做 tree-sitter 解析。
 * 有界（maxFiles/maxTotalBytes）、只读；依赖/wasm 问题以 `error` 显式返回。
 */
export const searchSymbols = async (
  deps: { fs: FsPort; ws: string },
  query: string,
  opts: { limit?: number; maxFiles?: number; maxFileBytes?: number; maxTotalBytes?: number } = {},
): Promise<SymbolSearchResult> => {
  const q = String(query ?? "").trim();
  const limit = Math.max(1, Math.min(50, Number(opts.limit ?? 12) || 12));
  const maxFiles = Math.max(1, Math.min(5000, Number(opts.maxFiles ?? 500) || 500));
  const maxFileBytes = Math.max(1024, Number(opts.maxFileBytes ?? 200_000) || 200_000);
  const maxTotalBytes = Math.max(50_000, Number(opts.maxTotalBytes ?? 4_000_000) || 4_000_000);
  const empty: SymbolSearchResult = { hits: [], scannedFiles: 0, parsedFiles: 0, truncated: false };
  if (!q) return empty;
  const needles = Array.from(new Set((q.toLowerCase().split(/[^a-z0-9_]+/).filter((t) => t.length >= 2) || []).concat(q.toLowerCase())));

  const hits: SymbolHit[] = [];
  const stats = { scannedFiles: 0, parsedFiles: 0, truncated: false };
  const queue: string[] = [""];
  let error: string | undefined;
  try {
    await ensureInit();
  } catch (e) {
    return { ...empty, error: `tree-sitter 初始化失败：${e instanceof Error ? e.message : String(e)}` };
  }
  while (queue.length) {
    if (stats.scannedFiles >= maxFiles) {
      stats.truncated = true;
      break;
    }
    const dirRel = queue.shift()!;
    const listed = await deps.fs.listDir(absOf(deps.ws, dirRel));
    if (!listed.ok) continue;
    for (const e of listed.value) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.type === "dir") {
        if (!shouldSkipDir(e.name)) queue.push(rel);
        continue;
      }
      if (e.type !== "file" || !isCodeFile(e.name)) continue;
      const lang = languageFor(e.name);
      if (!lang) continue;
      if (stats.scannedFiles >= maxFiles) {
        stats.truncated = true;
        break;
      }
      const st = await deps.fs.stat(absOf(deps.ws, rel));
      if (!st.ok || st.value.size > maxFileBytes) continue;
      const read = await deps.fs.readText(absOf(deps.ws, rel));
      if (!read.ok) continue;
      stats.scannedFiles += 1;
      const lower = read.value.toLowerCase();
      if (!needles.some((n) => lower.includes(n))) continue; // 廉价预筛：只解析可能命中的文件
      stats.parsedFiles += 1;
      try {
        const syms = await extractSymbols(rel, read.value, lang);
        for (const s of syms) {
          const nm = s.name.toLowerCase();
          if (needles.some((n) => nm.includes(n))) hits.push(s);
          if (hits.length >= limit * 4) break;
        }
      } catch (err) {
        error ??= `解析 ${rel} 失败：${err instanceof Error ? err.message : String(err)}`;
      }
      if (hits.length >= limit * 4) {
        stats.truncated = true;
        break;
      }
    }
  }
  hits.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line);
  return { hits: hits.slice(0, limit), scannedFiles: stats.scannedFiles, parsedFiles: stats.parsedFiles, truncated: stats.truncated, error };
};
