import type { ParsedMemory } from "./episode.js";
import type { ShadowNode } from "./node.js";
export interface KnowNode {
    title: string;
    level: number;
    content: string;
    children: KnowNode[];
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
/** 判定一行是否为「样板/噪声」（目录、页眉页脚、代码块标记）。确定性，无 LLM。 */
export declare const isBoilerplateLine: (line: unknown) => boolean;
/** ⑦ 按格式结构化抽取：code→包树 / document→标题树 / text→段落树。统一入口。 */
export declare const buildTree: (doc: ParsedMemory) => KnowNode;
/** TreeKnowledgeEngine：从文档/规范/决策 Atom 派生知识树（保留层级，不转 chunk）。 */
export declare const createKnowledgeEngine: (config: any) => KnowledgeEngine;
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
/** ② 渐进披露：内部节点设 routing 摘要（标题+节数），叶子保留 content=全文；返回新树（不覆盖输入）。 */
export declare const progressiveDisclosure: (tree: KnowledgeTree) => KnowledgeTree;
/** ① 成本感知 refine：链式合并（单叶子孩子吸收）+ 便宜子树折叠（≤minPages 的子树合并，标题存 key_items）。 */
export declare const refineTree: (tree: KnowledgeTree, opts?: {
    minPages?: number;
}) => KnowledgeTree;
/** 把树展平成"章节候选"（含内容的节点 + 叶子）。LLM 导航只在这些里选编号。 */
export declare const flattenSections: (tree: KnowledgeTree, limit?: number) => KnowledgeSection[];
/** 语料级 file-level 树（PageIndex File System）：模块→文件→章节，跨整个项目推理。 */
export declare const buildCorpusTree: (parsed: ParsedMemory[]) => KnowNode[];
