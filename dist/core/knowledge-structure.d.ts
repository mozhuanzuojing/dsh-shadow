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
/** 语料级 file-level 树（PageIndex File System）：模块→文件→章节，跨整个项目推理。 */
export declare const buildCorpusTree: (parsed: ParsedMemory[]) => KnowNode[];
