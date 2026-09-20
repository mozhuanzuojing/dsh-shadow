// dsh-shadow —— decision/types.ts：Decision 原语的**稳定协议**（T1 / ADR-0096）。
//
// 本文件是**纯模块**：零 import（列在 tools/audit-layers.lib.ts 的 PURE_MODULES 里；
// 一旦加 import 就会被结构门判红 —— 那是承诺，不是装饰）。
//
// 两个对象，**永不混同**（ADR-0096 §2）：
//   · captured —— **已经发生的**决定（source = 原文）⇒ 归 adr/0037 的 DecisionEvent，本层**不碰**。
//   · produced —— 引擎在决策那一刻**声明的**选择（source = 引擎名 + 逐字原始输出）⇒ 本文件。
//
// 命名纪律（ADR-0096 §4）：本层的**字段名**里不得出现 confidence / score / best / optimal /
// correct / expectedSuccess / precision / winner / ranking。本仓的线是
// 「**认知不确定性 = 可** / **对成功与正确性的信念 = 禁**」——
// 先例：action/guard.ts 允许 ActionCandidate 带 `uncertainty`，却禁它带 `confidence`。
// 因此引擎自报的数一律叫 `reportedDistribution`：**引擎自报**，不是 shadow 的评分。
export {};
