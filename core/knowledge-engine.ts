// dsh-shadow —— core/knowledge-engine.ts：Knowledge Engine（ADR-0046 Phase 3）。
// 定位：从「文档/规范」保留树（规范→章节→条款→约束），**不转 vector/chunks**——这是与 RAG 的本质区别。
// 纯派生/纯读：输入文档/规范 Atom，输出树结构；不新建事实、不自动总结经验。
// provider：仅占位（tree/db/…），当前默认 tree（从 parsed 文档派生标题层级）。配置 knowledgeEngine.enabled 才启用。
import type { ParsedMemory } from "./episode.js";
import type { ShadowNode } from "./node.js";
import { nodeTypeOf } from "./node.js";

export interface KnowNode {
  title: string;
  level: number;                 // 章节层级（0=根规范）
  content: string;               // 该节点正文（简短）
  children: KnowNode[];
}
export interface KnowledgeTree {
  provider: string;
  root: KnowNode[];
  sourceCount: number;
}

export interface KnowledgeEngine {
  build(parsed: ParsedMemory[], nodes?: ShadowNode[]): Promise<KnowledgeTree>;
}

/** 把一条规范/文档的内容按「标题层级」建成树（标题行 #/##/###/… → 层级）。纯派生，不补充事实。 */
export const buildTree = (doc: ParsedMemory): KnowNode => {
  const root: KnowNode = { title: doc.entry || (doc.goal ? `目标：${doc.goal}` : "规范"), level: 0, content: "", children: [] };
  const stack: KnowNode[] = [root];
  const pushLine = (line: string, level: number) => {
    const heading = line.replace(/^#+\s*/, "").trim();
    const node: KnowNode = { title: heading || line, level, content: "", children: [] };
    // 压栈：只保留 <= level 的祖先
    while (stack.length > 1 && stack[stack.length - 1].level >= level) stack.pop();
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  };
  // 正文行：`- [time] ...`。`# ` 开头为标题，其余作为上一节点内容。
  for (const raw of String(doc.body || "").split("\n")) {
    const l = raw.trim();
    if (!l) continue;
    const m = l.match(/^(#{1,6})\s+(.+)$/);
    if (m) { pushLine(l, m[1].length); continue; }
    // 普通行归入栈顶节点
    const top = stack[stack.length - 1];
    if (top && l !== top.title) top.content = (top.content ? top.content + "；" : "") + l.slice(0, 60);
  }
  return root;
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

/** 渲染知识树（缩进 + 层级）；供 report/查询展示。 */
export const renderKnowledgeTree = (tree: KnowledgeTree): string => {
  if (!tree.root.length) return "（knowledge: 尚无文档/规范树）";
  const lines: string[] = [`# Knowledge Tree · ${tree.provider} · 来源 ${tree.sourceCount}`, ""];
  const walk = (nodes: KnowNode[], depth: number) => {
    for (const n of nodes) {
      lines.push(`${"  ".repeat(depth)}- ${n.title}${n.content ? ` — ${n.content}` : ""}`);
      if (n.children.length) walk(n.children, depth + 1);
    }
  };
  walk(tree.root, 0);
  return lines.join("\n");
};

// ── ADR-0047：吸收 PageIndex/zg 思想（免向量树 + 推理检索 + 语料树）──

/** 语句检索：在树里按 query 匹配节点（自然章节为单元；LLM 导航是后续 gated 步，此处为确定性走树）。 */
export const retrieveKnowledge = (tree: KnowledgeTree, query: string, limit = 10): KnowNode[] => {
  const q = String(query || "").toLowerCase();
  const tokens = Array.from(new Set(q.split(/[\s,，。、；:：]+/).filter(Boolean)));
  if (!tokens.length) return tree.root.slice(0, limit);
  const out: KnowNode[] = [];
  const walk = (nodes: KnowNode[]) => {
    for (const n of nodes) {
      const hay = `${n.title} ${n.content} ${n.children.map((c) => c.title).join(" ")}`.toLowerCase();
      if (tokens.every((t) => hay.includes(t))) out.push(n);
      if (n.children.length) walk(n.children);
    }
  };
  walk(tree.root);
  return out.slice(0, limit);
};

/** 渲染检索命中节点（可追溯：标题+内容+层级路径）。 */
export const renderRetrieved = (nodes: KnowNode[], query: string): string => {
  if (!nodes.length) return `（knowledge retrieval 未命中：${query}）`;
  return `# Knowledge Retrieval · ${query}\n\n` + nodes.map((n) => `- [${n.level}] ${n.title} — ${n.content || "（节点）"}`).join("\n");
};

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
