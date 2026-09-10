// dsh-shadow —— core/lineage.ts：Evidence Lineage 数据模型（ADR-0044/0045/0046）。
// 这是 dsh-shadow 从「Memory Reader」走向「可证明事实层」的地基。
// 契约：
//   - lineage 是 event-sourced：只记录「产生 Atom 那一刻可观察到的」来源/材料，绝不 LLM 补写/推断。
//   - source ≠ evidence：source=Atom 从哪产生（会话）；evidence=支撑材料（spec/代码/adr 路径）。
//   - evidence 用 AtomEvidenceRef[]（而非 string[]）：为 zg(文件+行号)/PageIndex(文档+页)/Git(commit+diff) 预留统一抽象，
//     避免接入时再迁移。类型仅声明，无运行时依赖。与 Gateway 的 GatewayEvidenceRef{path} 区分（ADR-0050）。
//   - kind 是 memory 的二级属性（避免 type 爆炸）：只影响「是否进入默认认知查询」，不新增 NodeType。

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
  locator: string;                                // 路径 / 会话 id / commit sha / url
  fragment?: { start?: number; end?: number; page?: number };
}

/** AtomLineage：这个 Atom 为什么存在、来自哪里。 */
export interface AtomLineage {
  source: string;            // 从哪产生（session/<date>-<id>）
  createdBy: CreatedBy;
  evidence: AtomEvidenceRef[];   // 支撑材料
  createdAt: string;         // YYYY-MM-DD HH:MM:SS
}

/** 判断一个 Atom 是否允许成为 ShadowNode（memory metadata 排除 / decision 无证据排除；Atom 仍存在）。 */
export interface AtomProjectionVerdict {
  allowed: boolean;
  reason?: string;
}
