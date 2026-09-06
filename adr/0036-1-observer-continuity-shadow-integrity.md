# ADR-0036.1 · Observer Continuity Shadow Integrity Lock（v1.0.1，存储边界补丁）

> 时间：2026-09-07 ｜ 状态：审查（补丁 v1.0.0-alpha，不加能力，只加双层存储边界） ｜ 版本：v1.0.1
> 前置：ADR-0036（Global/Workspace 分层）。定位：**把 Observer Runtime 的"连续性承载"从单层 shadow 提升为双层 storage boundary**——不是 v1.1 功能，是 v1.0.0-alpha 的架构补丁。
> 关键：`Global Shadow = Observer Continuity Shadow`（observer 层，谁保持连续）；`Workspace Shadow = World Interaction Shadow`（world 层，这个世界是什么）。**二者不可混合**；关系是 `Constraint ⊃ Context`，**不是** Memory Union。

## 红色陷阱

**不要实现**：
```
Global Shadow + Workspace Shadow → Merged Memory
```
**正确**：
```
Global Shadow  → provides boundary
Workspace Shadow → provides world context
```
`Constraint ⊃ Context`（不是 Memory Union）。

## Invariant（232–236）

- **232** Global Shadow ≠ Workspace Memory：禁 `workspace knowledge → global shadow`（observer 层不进项目代码知识）。
- **233** Global Shadow Cannot Store Objective：禁 `project goal → observer continuity`（observer 层不存目标）。
- **234** Recall Index ≠ Recall Content：禁 `index → knowledge`（recall-index 是导航，只存 `workspace + records{id, location}`）。
- **235** Workspace Isolation：禁 `project-A shadow → project-B context`（workspace shadow 按项目隔离）。
- **236** Global State Cannot Become Preference Model：禁 `interaction history → pattern → preference → identity`（observer/config 是 configuration，非 preference model；禁 likes/更喜欢/比X好）。

## 测试（mock 232–236）

| 编号 | 检查 | Invariant |
|---|---|---|
| 232 | Global Shadow ≠ Workspace Memory | 232 |
| 233 | Global Shadow Cannot Store Objective | 233 |
| 234 | Recall Index ≠ Recall Content | 234 |
| 235 | Workspace Isolation | 235 |
| 236 | Global State Cannot Become Preference Model | 236 |

## 版本

**不叫 v1.1 Observer Memory**（Memory 误导）。版本：
```
v1.0.1 Observer Continuity Storage Boundary
```
这是 `Storage Boundary Fix`，不是 `Capability Expansion`。

## 边界 / 非目标

- 只加双层存储边界 + 测试，不新增能力。实现验收：`tsc` + `node --check` + mock（232–236）+ mock 1–236 + 提交/推送。
- 全局只存 observer 层（config / boundary / recall-index / lineage）；禁项目知识/目标/偏好入 global；workspace 按项目隔离；无 memory merge；无 preference engine；无 Agent/Autonomous 命名。

## 一句话

**全局影子是 Observer 的连续性，不是项目的知识；它是世界交互的约束层，不是世界的记忆联合体。**
