import type { ParsedMemory } from "./episode.js";
import type { ShadowNode } from "./node.js";
export interface KnowNode {
    title: string;
    level: number;
    content: string;
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
export declare const buildTree: (doc: ParsedMemory) => KnowNode;
/** TreeKnowledgeEngine：从文档/规范/决策 Atom 派生知识树（保留层级，不转 chunk）。 */
export declare const createKnowledgeEngine: (config: any) => KnowledgeEngine;
/** 渲染知识树（缩进 + 层级）；供 report/查询展示。 */
export declare const renderKnowledgeTree: (tree: KnowledgeTree) => string;
/** 语句检索：在树里按 query 匹配节点（自然章节为单元；LLM 导航是后续 gated 步，此处为确定性走树）。 */
export declare const retrieveKnowledge: (tree: KnowledgeTree, query: string, limit?: number) => KnowNode[];
/** 渲染检索命中节点（可追溯：标题+内容+层级路径）。 */
export declare const renderRetrieved: (nodes: KnowNode[], query: string) => string;
/** 语料级 file-level 树（PageIndex File System）：模块→文件→章节，跨整个项目推理。 */
export declare const buildCorpusTree: (parsed: ParsedMemory[]) => KnowNode[];
