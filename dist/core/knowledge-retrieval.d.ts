import type { KnowNode, KnowledgeTree } from "./knowledge-structure.js";
/** 渲染知识树（缩进 + 层级）；供 report/查询展示。 */
export declare const renderKnowledgeTree: (tree: KnowledgeTree) => string;
/** 语句检索：在树里按 query 匹配节点（自然章节为单元；LLM 导航是后续 gated 步，此处为确定性走树）。 */
export declare const retrieveKnowledge: (tree: KnowledgeTree, query: string, limit?: number) => KnowNode[];
/** 渲染检索命中节点（可追溯：标题+内容+层级路径）。接受 KnowNode / KnowledgeSection 形状。 */
export declare const renderRetrieved: (nodes: {
    title: string;
    content: string;
    level: number;
}[], query: string) => string;
/** 候选章节（供 LLM 导航 step：只给编号，事实仍从树派生）。 */
export interface KnowledgeSection {
    id: string;
    title: string;
    content: string;
    level: number;
    summary?: string;
}
/** 计算节点在树中的路径（根→…→node），用作引用/溯源。 */
export declare const sectionPath: (tree: KnowledgeTree, node: KnowNode) => string;
/** 渲染检索结果 + 引用（节路径溯源）。 */
export declare const renderKnowledgeRetrieval: (tree: KnowledgeTree, hits: {
    title: string;
    content: string;
    level: number;
}[], query: string) => string;
/** 把树展平成"章节候选"（含内容的节点 + 叶子）。LLM 导航只在这些里选编号。 */
export declare const flattenSections: (tree: KnowledgeTree, limit?: number) => KnowledgeSection[];
