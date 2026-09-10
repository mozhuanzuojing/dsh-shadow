# ADR-0051: Resource Card → `resource` NodeType（源层卡片 + 派生投影，v1.14.0）

- 状态：**已接受（2026-09-10）**——边界先冻结，再决定实现。
- 决定日期：2026-09-10
- 关联 ADR：ADR-0001（不引向量库）、ADR-0042（Shadow Knowledge Graph，提议未实现）、ADR-0043（Shadow Contract）、ADR-0044/0045/0046（Evidence Lineage / Validation Gate）、ADR-0049（缺件不静默）
- 关联术语：`../CONTEXT.md`（Resource Card / resource 节点 / ShadowNode Projection / AtomKind）

## Context

投影模式要新增一个上游角色（资源侦察员）：把外部资源（GitHub / 论文 / 官方文档 / 工具 / 文章 / 案例 / 数据集）收成卡片，标星后沉淀，供后续创意发散引用。这需要一个可被 `shadow_query` 检索、且带证据的类型。

但现有 5 个 `NodeType`（`memory|code|document|decision|concept`）**全部从记忆原子（Memory Atom）派生**——外部资源根本不存在对应的记忆原子。直接加一个枚举值会得到「没有任何生产者」的死类型。

ADR-0043（Shadow Contract）要求先回答分类：它算 **Atom（source，human/code/tool 写）** 还是 **Projection（系统派生、可重建）**？

答案是**两者都有**，且必须分开：

| 面 | 是什么 | 谁写 | 可否 rm -rf |
|----|--------|------|-------------|
| **Resource Card** | `.shadow/resources/<name>.md` 普通文件（固有层 + 按问题的投影段） | tool/agent（符合 ADR-0043 的 source 定义） | **否**（是事实源） |
| **`resource` 节点** | 从卡片确定性派生出的 ShadowNode | 系统 | **是**（派生投影，可重建） |

分析时还确认了两条既有纪律可以直接复用，不需要新机制：**证据门**（ADR-0044/0045 对 decision 的那道门）与 **缺件不静默**（ADR-0049）。

## Decision

1. **两层分离**：Resource Card = **source**（写在 `SHADOW_ROOT/resources/`，与其余 shadow 写入同受既有安全边界约束）；`resource` 节点 = **Projection**（派生、可重建、不覆盖卡片）。

2. **NodeType 增 `resource`**（第 6 个）；`shadow_query` 的 `scope` 收 `resource`；工具描述同步。

3. **证据门与 decision 同一道门**：卡片必须给出 `source`（链接或路径）才允许上投影；没有则卡片保留在磁盘、**不进认知查询**。理由：**收进库 ≠ 有出处**。

4. **纯派生、无 LLM**：字段只从卡片原文读；解析不出来（无标题 / 无 source）返回「不投影」，**不猜一个**。所以没有 LLM 补写、没有推断的关系。

5. **不做 Store**：不建 `nodes.jsonl`、不引向量库（沿用 ADR-0001）；投影缓存沿用既有 `projectionStore`（默认关）。

6. **一条卡片 → 一个节点**：卡片里「按问题」的投影段以 `content` 行呈现（`投影 @ 问题：relevance=… inspiration=…`），v1 不按问题拆成多节点。

7. **版本**：`1.14.0`（新增能力，非破坏性改名；mode 总数不变）。

## Consequences

- `resource` 节点**不设 `kind`**（`kind` 是 memory 的二级属性，见 ADR-0044）；`createdBy` 固定为 `tool`（卡片由 tool 写入）。
- **已知边界**：`projectionStore` 开启且缓存命中时，缓存不感知资源目录的变化——新增/修改卡片后需 `invalidate`/`rebuild` 才能进投影。默认关闭，故不影响默认路径。
- 卡片的活跃度等属性是**原文快照**：过期由人或 agent 改卡片，系统不自动重抓（与「不 LLM 补写」一致）。
- 投影模式预设里「资源侦察员 / 创意专家」的**工作方式**不属本 ADR（那是预设平面），本 ADR 只冻结插件的类型与门。
