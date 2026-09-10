/** Atom 的产生者。 */
export type CreatedBy = "user" | "agent" | "tool";
/** Atom 的二级分类（memory 专用；非新 type）。 */
export type AtomKind = "experience" | "metadata" | "session" | "task" | "artifact";
/** ShadowNode 的投影类型。来自 lineage.ts 而非 node.ts，避免 lineage-validator ↔ node 类型循环。
 *  resource = 资源卡（tool/agent 写入 .shadow/resources/ 的源文件）的投影；卡片本身是 source（ADR-0043），
 *  节点是派生投影，可重建。 */
export type NodeType = "memory" | "code" | "document" | "decision" | "concept" | "resource";
/** 一条 Atom 证据：指向哪里/哪个片段。type + locator + 可选 fragment（行号/页范围）。 */
export interface AtomEvidenceRef {
    type: "file" | "conversation" | "document" | "commit" | "url";
    locator: string;
    fragment?: {
        start?: number;
        end?: number;
        page?: number;
    };
}
/** AtomLineage：这个 Atom 为什么存在、来自哪里。 */
export interface AtomLineage {
    source: string;
    createdBy: CreatedBy;
    evidence: AtomEvidenceRef[];
    createdAt: string;
}
/** 判断一个 Atom 是否允许成为 ShadowNode（memory metadata 排除 / decision 无证据排除；Atom 仍存在）。 */
export interface AtomProjectionVerdict {
    allowed: boolean;
    reason?: string;
}
