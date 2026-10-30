/**
 * v2 engine — 语法感知分块（借鉴 Cursor：按语法块切分，而不是按固定行数）。
 *
 * 用 tree-sitter 把文件切成「函数/类/接口/方法/import/const」等块：
 * - 单块超过字符上限 → 递归按子声明拆（如 class → methods）；
 * - 无语法树/解析失败 → 退回按行切块（chunkCode）。
 * 只读；块文本进入 BM25/embedding 索引，不写 atoms。
 */

import { chunkCode } from "../../domain/code-search.js";
import { ensureInit, getParserClass, loadLanguage } from "./symbols.js";

export interface AstChunk {
  rel: string;
  /** 1-based 起始行。 */
  start: number;
  /** 1-based 结束行（含）。 */
  end: number;
  kind: string;
  name: string;
  text: string;
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
  lexical_declaration: "const",
  variable_declaration: "var",
  variable_declarator: "const",
  import_statement: "import",
  import_declaration: "import",
  namespace_definition: "namespace",
  module: "module",
};

const kindOf = (t: string): string =>
  KIND[t] ?? (/(function|method)/.test(t) ? "function" : /(class|struct|trait|impl)/.test(t) ? "class" : /(interface|type|enum)/.test(t) ? "type" : "block");

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

const lineFallback = (rel: string, text: string, maxChars: number): AstChunk[] => {
  const lines = String(text ?? "").split(/\r?\n/);
  const out: AstChunk[] = [];
  let start = 0;
  while (start < lines.length) {
    let end = Math.min(lines.length, start + 40);
    while (end > start + 1 && lines.slice(start, end).join("\n").length > maxChars) end -= 1;
    const seg = lines.slice(start, end).join("\n");
    if (seg.trim()) out.push({ rel, start: start + 1, end, kind: "block", name: "", text: seg });
    start = end;
  }
  return out;
};

/** 语法感知分块；失败时退回按行切块（不抛错，保底可用）。 */
export const astChunks = async (rel: string, text: string, lang: string | null, maxChars = 1500): Promise<AstChunk[]> => {
  const src = String(text ?? "");
  if (!lang) return lineFallback(rel, src, maxChars);
  let parser: any;
  try {
    const P = await getParserClass();
    await ensureInit();
    const L = await loadLanguage(lang);
    parser = new P();
    parser.setLanguage(L);
  } catch {
    return lineFallback(rel, src, maxChars);
  }
  const lines = src.split(/\r?\n/);
  const out: AstChunk[] = [];
  const pushRange = (startRow: number, endRow: number, kind: string, name: string): void => {
    const seg = lines.slice(startRow, endRow + 1).join("\n");
    if (!seg.trim()) return;
    out.push({ rel, start: startRow + 1, end: endRow + 1, kind, name, text: seg });
  };
  const emit = (node: any): void => {
    const startRow = node.startPosition?.row ?? 0;
    const endRow = node.endPosition?.row ?? startRow;
    const seg = lines.slice(startRow, endRow + 1).join("\n");
    const kind = kindOf(String(node.type ?? ""));
    if (seg.length <= maxChars) {
      pushRange(startRow, endRow, kind, nameOf(node));
      return;
    }
    // 太大 → 优先按子声明递归拆
    const declChildren = (node.namedChildren ?? []).filter((c: any) => String(c?.type ?? "") in KIND || /function|method|class|interface|enum|struct|trait|impl/.test(String(c?.type ?? "")));
    if (declChildren.length >= 2) {
      for (const c of declChildren) emit(c);
      return;
    }
    // 子声明不足 → 按行切这一段的文本
    const segLines = seg.split(/\r?\n/);
    for (let i = 0; i < segLines.length; i += 40) {
      const part = segLines.slice(i, i + 40);
      if (part.join("\n").trim()) {
        out.push({ rel, start: startRow + i + 1, end: startRow + i + part.length, kind, name: nameOf(node), text: part.join("\n") });
      }
    }
  };
  try {
    const tree = parser.parse(src);
    const root = tree.rootNode;
    const top = root.namedChildren ?? [];
    for (const node of top) {
      let n = node;
      if (String(n.type) === "export_statement" && n.namedChildren?.length) n = n.namedChildren[0];
      const t = String(n.type ?? "");
      if (t in KIND || /function|method|class|interface|enum|struct|trait|impl/.test(t)) emit(n);
    }
    try {
      tree.delete?.();
    } catch {
      /* ignore */
    }
  } catch {
    return lineFallback(rel, src, maxChars);
  } finally {
    try {
      parser.delete?.();
    } catch {
      /* ignore */
    }
  }
  if (!out.length) return lineFallback(rel, src, maxChars);
  return out;
};
