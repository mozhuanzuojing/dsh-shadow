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
/** TreeKnowledgeEngine：从文档/规范/决策 Atom 派生知识树（保留层级，不转 chunk）。
 *
 *  ⚠ **参数已删除（v1.15.34，D8）**：原签名是 `createKnowledgeEngine(config: any)`，
 *  而**函数体从不引用 `config`** —— 它是个**死形参**。这个死形参的危害不是「多一个参数」，
 *  而是它**构成一个假象**：调用方写 `createKnowledgeEngine(deps.config)` 时，
 *  读代码的人会以为「知识引擎是受 config 驱动的」；而 `ShadowConfig.knowledgeEngine.enabled`
 *  （`core/types.ts:37`）因此看起来像个**已接线的闸门** —— 实际上**生产从不读它**。
 *  同一处缺陷的另一半在 `core/types.ts:36` 的注释（声称「默认 off」）与 README 的表
 *  （声称「默认 关 / `enabled: true` 启用」）—— 三处都在描述一个**不存在的开关**。
 *  真实情况：读路径**无条件**建树（`query/reads.ts:141`），**唯一的闸门是 `llmNavigate`**
 *  （`core/writer.ts:79-80`，默认关、且它确实被读）。
 *  ⇒ 删掉死形参，让「它不吃配置」这件事在**签名层面**显式。 */
export declare const createKnowledgeEngine: () => KnowledgeEngine;
/** 语料级 file-level 树（PageIndex File System）：模块→文件→章节，跨整个项目推理。 */
export declare const buildCorpusTree: (parsed: ParsedMemory[]) => KnowNode[];
