// dsh-shadow —— core/knowledge-cost.ts：Knowledge Engine · cost seam（ADR-0048 ①/②）。
// 从 knowledge-engine.ts 迁出的「成本感知树优化 + 渐进披露」：refineTree（链式合并 + 便宜子树折叠，
// ≤minPages 的子树合并，标题存 key_items）与 progressiveDisclosure（内部节点设路由摘要，叶子保留全文）。
// 只读正版树、返回新树（不覆盖输入）；无 LLM。
import type { KnowNode, KnowledgeTree } from "./knowledge-structure.js";

/** 子树叶子/内容节点数（≈"页/节"规模，PageIndex 的 S(v)）。 */
const leafCount = (n: KnowNode): number => (n.children.length ? n.children.reduce((a, c) => a + leafCount(c), 0) : 1);

const cloneNode = (n: KnowNode): KnowNode => ({
  title: n.title, level: n.level, content: n.content, children: n.children.map(cloneNode),
  summary: n.summary, keyItems: n.keyItems ? [...n.keyItems] : undefined,
});

/** ② 渐进披露：内部节点设 routing 摘要（标题+节数），叶子保留 content=全文；返回新树（不覆盖输入）。 */
export const progressiveDisclosure = (tree: KnowledgeTree): KnowledgeTree => {
  const clone = (n: KnowNode): KnowNode => {
    const c = cloneNode(n);
    if (n.children.length) c.summary = `${n.title}（${leafCount(n) - 1} 节）`;  // 内部=路由摘要
    return c;
  };
  return { ...tree, root: tree.root.map(clone) };
};

/** ① 成本感知 refine：链式合并（单叶子孩子吸收）+ 便宜子树折叠（≤minPages 的子树合并，标题存 key_items）。 */
export const refineTree = (tree: KnowledgeTree, opts: { minPages?: number } = {}): KnowledgeTree => {
  const minPages = Math.max(1, Number(opts.minPages) || 3);
  const refine = (n: KnowNode): KnowNode => {
    const children = n.children.map(refine);
    // 链式合并：只有 1 个孩子且孩子是叶子 → 吸收（孩子在树上不值得单独路由）
    if (children.length === 1 && !children[0].children.length) {
      return { title: n.title, level: n.level, content: children[0].content || n.content, children: [], summary: n.summary, keyItems: [children[0].title] };
    }
    // 便宜子树折叠：整棵子树规模 ≤ minPages → 折叠进本节点（可线性扫描），子标题存 key_items
    if (children.length && leafCount({ ...n, children }) <= minPages) {
      const kept: string[] = [...(n.keyItems || [])];
      const text = children.map((c) => `${c.title}${c.content ? `：${c.content}` : ""}`).join("；");
      for (const c of children) kept.push(c.title);
      return { title: n.title, level: n.level, content: [n.content, text].filter(Boolean).join("；"), children: [], summary: n.summary, keyItems: kept };
    }
    return { ...n, children };
  };
  return { ...tree, root: tree.root.map(refine) };
};
