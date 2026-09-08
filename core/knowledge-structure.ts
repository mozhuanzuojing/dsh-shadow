// dsh-shadow —— core/knowledge-structure.ts：Knowledge Engine · structure seam（ADR-0046 Phase 3 / ADR-0047）。
// 从 knowledge-engine.ts 迁出的「建树」部分：从文档/规范/代码 Atom 派生保留树（规范→章节→条款→约束），
// 不转 vector/chunks（与 RAG 本质区别）。纯派生/纯读，不新建事实。
// 只依赖 node/episode 类型；本 seam 提供 KnowNode/KnowledgeTree 类型，供 retrieval/cost 两 seam 引用。
import type { ParsedMemory } from "./episode.js";
import type { ShadowNode } from "./node.js";
import { nodeTypeOf } from "./node.js";

export interface KnowNode {
  title: string;
  level: number;                 // 章节层级（0=根规范）
  content: string;               // 该节点正文（简短）；叶子=全文（渐进披露）
  children: KnowNode[];
  // ADR-0048：渐进披露（①/②）——内部节点摘要（路由用）+ 被 merge 掉的子标题（key_items）。
  summary?: string;
  keyItems?: string[];
}
export interface KnowledgeTree {
  provider: string;
  root: KnowNode[];
  sourceCount: number;
}

export interface KnowledgeEngine {
  build(parsed: ParsedMemory[], nodes?: ShadowNode[]): Promise<KnowledgeTree>;
}

// ── ADR-0048 ③：内容分类去噪（PageIndex `flash/classification`：TOC/页眉页脚剔除，只留正文/标题）──
/** 判定一行是否为「样板/噪声」（目录、页眉页脚、代码块标记）。确定性，无 LLM。 */
export const isBoilerplateLine = (line: unknown): boolean => {
  const l = String(line || "").trim();
  if (!l) return false;
  if (/^(#{0,6}\s*)?(目录|contents|toc|页眉|页脚|附录)\s*$/i.test(l)) return true;
  if (/^第\s*\d+\s*页$/i.test(l) || /^\s*page\s+\d+\s*$/i.test(l)) return true;
  if (/^```/.test(l)) return true;                    // 代码块标记（非正文）
  if (/^.{2,6}\s*(\.\s*){2,}\s*\d+$/.test(l)) return true; // TOC 形：章节…页码
  return false;
};

const cleanLines = (body: unknown): string[] => {
  const out: string[] = [];
  let inCode = false;
  for (const raw of String(body || "").split("\n")) {
    const l = raw.trim();
    if (/^```/.test(l)) { inCode = !inCode; continue; }   // 跳代码块标记，代码内容也不入树
    if (inCode) continue;
    if (isBoilerplateLine(l)) continue;                    // 剔除 TOC/页眉页脚
    out.push(l);
  }
  return out;
};

/** ⑦ doc 标题树：按 `#/##/###…` 层级建树（纯标题，无 LLM）。 */
const buildHeadingTree = (doc: ParsedMemory): KnowNode => {
  const root: KnowNode = { title: doc.entry || (doc.goal ? `目标：${doc.goal}` : "规范"), level: 0, content: "", children: [] };
  const stack: KnowNode[] = [root];
  const pushLine = (line: string, level: number) => {
    const heading = line.replace(/^#+\s*/, "").trim();
    const node: KnowNode = { title: heading || line, level, content: "", children: [] };
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  };
  for (const l of cleanLines(doc.body)) {
    const m = l.match(/^(#{1,6})\s+(.+)$/);
    if (m) { pushLine(l, m[1].length); continue; }
    const top = stack[stack.length - 1];
    if (top && l !== top.title) top.content = (top.content ? top.content + "；" : "") + l.slice(0, 60);
  }
  return root;
};

/** ⑦ code 包树：按 entry 路径（package/class）建模块树。 */
const buildCodeTree = (entry: string, content: string): KnowNode => {
  const segs = String(entry || "").split(/[\\/]/).filter(Boolean);
  const root: KnowNode = { title: segs[0] || entry || "code", level: 0, content: "", children: [] };
  let cur = root;
  for (let i = 1; i < segs.length; i++) {
    const node: KnowNode = { title: segs[i], level: i, content: "", children: [] };
    cur.children.push(node);
    cur = node;
  }
  if (content) cur.content = content;
  return root;
};

/** ⑦ text 段落树：按空行分段落作为子节。 */
const buildTextTree = (doc: ParsedMemory): KnowNode => {
  const root: KnowNode = { title: doc.entry || "text", level: 0, content: "", children: [] };
  const paras = cleanLines(doc.body).join(" ").split(/\s{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  for (const p of paras) root.children.push({ title: p.slice(0, 24) || "节", level: 1, content: p.slice(0, 80), children: [] });
  if (!root.children.length && doc.goal) root.content = doc.goal;
  return root;
};

/** ⑦ 按格式结构化抽取：code→包树 / document→标题树 / text→段落树。统一入口。 */
export const buildTree = (doc: ParsedMemory): KnowNode => {
  const type = nodeTypeOf(doc);
  const content = [...(doc.goal ? [doc.goal] : []), ...(doc.thinkLines || [])].join(" ");
  if (type === "code") return buildCodeTree(doc.entry, content);
  if (type === "document") return buildHeadingTree(doc);
  return buildTextTree(doc);
};

/** TreeKnowledgeEngine：从文档/规范/决策 Atom 派生知识树（保留层级，不转 chunk）。 */
export const createKnowledgeEngine = (config: any): KnowledgeEngine => ({
  async build(parsed: ParsedMemory[], nodes: ShadowNode[] = []) {
    const docs = (parsed || []).filter((p) => nodeTypeOf(p) === "document" || /规范|spec|docs?/i.test(String(p.entry || "")));
    const sourceCount = docs.length;
    const root: KnowNode[] = docs.map((d) => buildTree(d));
    return { provider: "tree", root, sourceCount };
  },
});

/** 语料级 file-level 树（PageIndex File System）：模块→文件→章节，跨整个项目推理。 */
export const buildCorpusTree = (parsed: ParsedMemory[]): KnowNode[] => {
  const modules: KnowNode[] = [];
  const find = (title: string) => modules.find((m) => m.title === title);
  for (const p of parsed || []) {
    const type = nodeTypeOf(p);
    if (type !== "document" && type !== "code") continue;   // 只对文档/代码建文件树
    const segs = String(p.entry || "").split(/[\\/]/).filter(Boolean);
    const mod = segs[0] || "root";
    const file = segs.slice(1).join("/") || p.entry || "file";
    let modNode = find(mod);
    if (!modNode) { modNode = { title: mod, level: 0, content: "", children: [] }; modules.push(modNode); }
    const fileNode: KnowNode = { title: file, level: 1, content: "", children: buildTree(p).children };
    if (!fileNode.children.length && p.goal) fileNode.content = p.goal;
    modNode.children.push(fileNode);
  }
  return modules;
};
