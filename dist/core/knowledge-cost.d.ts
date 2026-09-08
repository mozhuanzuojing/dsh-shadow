import type { KnowledgeTree } from "./knowledge-structure.js";
/** ② 渐进披露：内部节点设 routing 摘要（标题+节数），叶子保留 content=全文；返回新树（不覆盖输入）。 */
export declare const progressiveDisclosure: (tree: KnowledgeTree) => KnowledgeTree;
/** ① 成本感知 refine：链式合并（单叶子孩子吸收）+ 便宜子树折叠（≤minPages 的子树合并，标题存 key_items）。 */
export declare const refineTree: (tree: KnowledgeTree, opts?: {
    minPages?: number;
}) => KnowledgeTree;
