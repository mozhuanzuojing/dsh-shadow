// dsh-shadow —— core/knowledge-retrieval.ts：Knowledge Engine · retrieval seam（ADR-0047）。
// 从 knowledge-engine.ts 迁出的「检索/渲染/导航」：在保留树上确定性走树检索 + 展示（缩进/命中/引用），
// 以及把树展平为「候选章节」供 LLM 导航只选编号。只读树，不新建事实。
import type { KnowNode, KnowledgeTree } from "./knowledge-structure.js";

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

/** 渲染检索命中节点（可追溯：标题+内容+层级路径）。接受 KnowNode / KnowledgeSection 形状。 */
export const renderRetrieved = (nodes: { title: string; content: string; level: number }[], query: string): string => {
  if (!nodes.length) return `（knowledge retrieval 未命中：${query}）`;
  return `# Knowledge Retrieval · ${query}\n\n` + nodes.map((n) => `- [${n.level}] ${n.title} — ${n.content || "（节点）"}`).join("\n");
};

/** 候选章节（供 LLM 导航 step：只给编号，事实仍从树派生）。 */
export interface KnowledgeSection { id: string; title: string; content: string; level: number; summary?: string }

// ── ADR-0048 ④：树即 agent 工具 + 引用（PageIndex `agent_tools.py`）──
/** 计算节点在树中的路径（根→…→node），用作引用/溯源。 */
export const sectionPath = (tree: KnowledgeTree, node: KnowNode): string => {
  const walk = (nodes: KnowNode[], trail: string[]): string[] | null => {
    for (const n of nodes) {
      if (n === node) return [...trail, n.title];
      if (n.children.length) { const r = walk(n.children, [...trail, n.title]); if (r) return r; }
    }
    return null;
  };
  return walk(tree.root, [])?.join(" / ") || node.title;
};

/**
 * 渲染检索结果 + 引用（节路径溯源）。
 *
 * v1.15.62：声明补 `__path?: string`。此前声明比**真实契约**窄 —— 实现里读 `(h as any).__path`，
 * 而生产调用方 `query/reads.ts:162,167` 确实构造并传入 `__path`（`:168/:171` 喂给本函数）。
 * 生产没被 `tsc` 拦，是因为 `.map` 回调的返回值**没有上下文类型** ⇒ 不触发 excess property 检查；
 * 而测试面一旦做类型检查，这个声明缺口就会以「夹具多了一个属性」的形式暴露出来。
 * **声明要写真实契约**，否则类型检查会反过来逼调用方去 cast（那是把缺口搬到下游）。
 */
export const renderKnowledgeRetrieval = (tree: KnowledgeTree, hits: { title: string; content: string; level: number; __path?: string }[], query: string): string => {
  if (!hits.length) return `（knowledge retrieval 未命中：${query}）`;
  const lines = [`# Knowledge Retrieval · ${query}`, ""];
  for (const h of hits) {
    const path = h.__path || "";
    lines.push(`- [${h.level}] ${h.title}${path ? `  (${path})` : ""} — ${h.content || "（节点）"}`);
  }
  return lines.join("\n");
};

/** 把树展平成"章节候选"（含内容的节点 + 叶子）。LLM 导航只在这些里选编号。 */
export const flattenSections = (tree: KnowledgeTree, limit = 50): KnowledgeSection[] => {
  const out: KnowledgeSection[] = [];
  const walk = (nodes: KnowNode[]) => {
    for (const n of nodes) {
      if (out.length >= limit) return;
      out.push({ id: String(out.length), title: n.title, content: n.content || "", level: n.level });
      if (n.children.length) walk(n.children);
    }
  };
  walk(tree.root);
  return out;
};
