// dsh-shadow —— core/lineage.ts：Evidence Lineage 数据模型（ADR-0044/0045/0046）。
// 这是 dsh-shadow 从「Memory Reader」走向「可证明事实层」的地基。
// 契约：
//   - lineage 是 event-sourced：只记录「产生 Atom 那一刻可观察到的」来源/材料，绝不 LLM 补写/推断。
//   - source ≠ evidence：source=Atom 从哪产生（会话）；evidence=支撑材料（spec/代码/adr 路径）。
//   - evidence 用 AtomEvidenceRef[]（而非 string[]）：为 zg(文件+行号)/PageIndex(文档+页)/Git(commit+diff) 预留统一抽象，
//     避免接入时再迁移。类型仅声明，无运行时依赖。与 Gateway 的 EvidenceRef{path} 区分（ADR-0050）。
//   - kind 是 memory 的二级属性（避免 type 爆炸）：只影响「是否进入默认认知查询」，不新增 NodeType。
export {};
