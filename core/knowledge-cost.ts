// dsh-shadow —— core/knowledge-cost.ts：Knowledge Engine · cost seam（ADR-0048 ①/②）。
// 从 knowledge-engine.ts 迁出的「成本感知树优化 + 渐进披露」：refineTree（链式合并 + 便宜子树折叠，
// ≤minPages 的子树合并，标题存 key_items）与 progressiveDisclosure（内部节点设路由摘要，叶子保留全文）。
// 只读正版树、返回新树（不覆盖输入）；无 LLM。
//
// ⚠ **接线状态（v1.15.33 / T4 分诊结论：保留，但"未接线"是已知且未决的）**：
//   本文件的 `progressiveDisclosure` / `refineTree` 在生产里**无调用点** —— 生产读路径
//   `query/reads.ts:141-158` 从 `knowledge-structure.js` / `knowledge-retrieval.js` **直接**建树并检索，
//   从不经过这个 cost seam；唯一调用者是 `test/knowledge-engine.test.ts:53,59`。
//   而 `core/knowledge-engine.ts:7-8` 的清单式注释**提到了**这两个名字 —— 那是一处**假调用点**
//   （`audit-wiring` 的 A 类把注释算作命中，故它没报；人工分诊时才发现）。
//   **为什么本轮不删也不接线**：这是 `adr/0048` ①/② 的**目标能力**，是否启用属**产品决策**
//   （默认路径可能刻意不做成本折叠）⇒ 见 `BACKLOG.md` **T1** 的"待决策"项。
//   **不要**因为「零调用」就删除 —— 它与 `auditDrift` 那种空壳不同，它是实现完整的功能面。
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
