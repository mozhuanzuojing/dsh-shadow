/**
 * v2 engine — tree-sitter 符号抽取（真 AST）。ADR-0019 阶段 2 / ADR-0020。
 *
 * 依赖 `web-tree-sitter`（MIT）+ `tree-sitter-wasms`（Unlicense）的预编译 `.wasm`。
 * **动态加载**：依赖缺失/加载失败 → `searchSymbols` 返回 `error`（优雅降级，不拖垮插件）。
 * 只读：不写任何文件；符号是「代码结构」，不是记忆。
 */

import { createRequire } from "node:module";
import { walkCodeFiles } from "./walk.js";
import type { FsPort } from "../../store/fs.js";

const req = createRequire(import.meta.url);

let parserClass: any = null;
export const getParserClass = async (): Promise<any> => {
  if (parserClass) return parserClass;
  let mod: any;
  try {
    mod = await import("web-tree-sitter");
  } catch (e) {
    throw new Error(`tree-sitter 依赖不可用：${e instanceof Error ? e.message : String(e)}`);
  }
  const P = mod?.default ?? mod;
  if (!P || typeof P.init !== "function") throw new Error("tree-sitter 依赖不可用：模块无 init()");
  parserClass = P;
  return P;
};

let initPromise: Promise<void> | null = null;
export const ensureInit = async (): Promise<void> => {
  const P = await getParserClass();
  if (!initPromise) initPromise = P.init();
  await initPromise;
};

const langCache = new Map<string, any>();

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

export const loadLanguage = async (lang: string): Promise<any> => {
  const cached = langCache.get(lang);
  if (cached) return cached;
  const P = await getParserClass();
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

/** 解析一段源码，抽取符号（函数/类/接口/type/enum/struct…）。 */
export const extractSymbols = async (rel: string, text: string, lang: string): Promise<SymbolHit[]> => {
  const P = await getParserClass();
  await ensureInit();
  const L = await loadLanguage(lang);
  // 每次调用新建 Parser：避免共享实例的并发交叉（Parser.parse 非并发安全）。
  const parser = new P();
  parser.setLanguage(L);
  let hits: SymbolHit[] = [];
  try {
    const tree = parser.parse(text);
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
  } finally {
    try {
      parser.delete?.();
    } catch {
      /* ignore */
    }
  }
  return hits;
};

export interface SymbolSearchResult {
  hits: SymbolHit[];
  scannedFiles: number;
  parsedFiles: number;
  /** 预算截断（maxFiles）。 */
  truncated: boolean;
  /** 命中达到上限而提前停止（不是预算截断，单独区分）。 */
  hitsCapped: boolean;
  error?: string;
}

/**
 * 在代码里找符号（定义/入口）：廉价文本预筛后只对候选文件做 tree-sitter 解析。有界、只读；
 * 依赖/wasm 问题以 `error` 显式返回（但若同时已有命中，调用方应展示命中 + 部分失败提示）。
 */
export const searchSymbols = async (
  deps: { fs: FsPort; ws: string },
  query: string,
  opts: { limit?: number; maxFiles?: number; maxFileBytes?: number; ignore?: (rel: string, isDir: boolean) => boolean } = {},
): Promise<SymbolSearchResult> => {
  const q = String(query ?? "").trim();
  const limit = Math.max(1, Math.min(50, Number(opts.limit ?? 12) || 12));
  const maxFiles = Math.max(1, Math.min(5000, Number(opts.maxFiles ?? 500) || 500));
  const maxFileBytes = Math.max(1024, Number(opts.maxFileBytes ?? 200_000) || 200_000);
  const empty: SymbolSearchResult = { hits: [], scannedFiles: 0, parsedFiles: 0, truncated: false, hitsCapped: false };
  if (!q) return empty;
  const tokens = q.split(/[^A-Za-z0-9_\u4e00-\u9fff]+/).filter(Boolean);
  const needles = Array.from(
    new Set(
      tokens
        .filter((t) => (/[\u4e00-\u9fff]/.test(t) ? t.length >= 2 : t.length >= 3))
        .map((t) => t.toLowerCase())
        .concat(q.length >= 3 && !/\s/.test(q) ? [q.toLowerCase()] : []),
    ),
  );
  if (!needles.length) return empty;

  const hits: SymbolHit[] = [];
  const stats = { scannedFiles: 0, parsedFiles: 0, truncated: false, hitsCapped: false };
  let error: string | undefined;
  try {
    await ensureInit();
  } catch (e) {
    return { ...empty, error: e instanceof Error ? e.message : String(e) };
  }
  const walked = await walkCodeFiles(deps, { ignore: opts.ignore, maxFiles }, async (rel, abs) => {
    const lang = languageFor(rel.slice(rel.lastIndexOf("/") + 1));
    if (!lang) return;
    const st = await deps.fs.stat(abs);
    if (!st.ok || st.value.size > maxFileBytes) return;
    const read = await deps.fs.readText(abs);
    if (!read.ok) return;
    stats.scannedFiles += 1;
    const lower = read.value.toLowerCase();
    if (!needles.some((n) => lower.includes(n))) return;
    stats.parsedFiles += 1;
    try {
      const syms = await extractSymbols(rel, read.value, lang);
      for (const s of syms) {
        const nm = s.name.toLowerCase();
        if (needles.some((n) => nm.includes(n))) hits.push(s);
      }
    } catch (err) {
      error ??= `解析 ${rel} 失败：${err instanceof Error ? err.message : String(err)}`;
    }
    if (hits.length >= limit * 4) {
      stats.hitsCapped = true;
      return false;
    }
  });
  stats.scannedFiles = stats.scannedFiles || walked.scanned;
  stats.truncated = walked.truncated;
  hits.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line);
  return { hits: hits.slice(0, limit), scannedFiles: stats.scannedFiles, parsedFiles: stats.parsedFiles, truncated: stats.truncated, hitsCapped: stats.hitsCapped, error };
};
