// dsh-shadow —— core/knowledge-engine.ts：Knowledge Engine 入口（ADR-0046 Phase 3）。
// 定位：从「文档/规范」保留树（规范→章节→条款→约束），**不转 vector/chunks**——与 RAG 的本质区别。
// 纯派生/纯读，不新建事实、不自动总结经验。
// 候选 4（candidate 4）：按 seam 拆成三个聚焦模块，本文件保留原 import 路径作为 re-export barrel，
// 使 query/reads.ts 与测试对 `../core/knowledge-engine.js` 的导入面不变。
//   - structure：建树（buildTree/createKnowledgeEngine/buildCorpusTree/isBoilerplateLine + 类型）
//   - retrieval：检索/渲染/导航（retrieveKnowledge/renderKnowledgeTree/renderRetrieved/…/flattenSections）
//   - cost：成本感知优化 + 渐进披露（refineTree/progressiveDisclosure）
export * from "./knowledge-structure.js";
export * from "./knowledge-retrieval.js";
export * from "./knowledge-cost.js";
