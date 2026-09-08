# ADR-0041: Context Reconstruction Boundary（上下文重建边界，实体/状态/规则/重建，提议·暂不实现）

- 状态：**已提出（2026-09-07，先冻结边界；暂不实现**——用户未要求立刻实现）
- 决定日期：2026-09-07
- 关联术语：`../CONTEXT.md`（Memory Atom / Episode / ContextReference）
- 关联 ADR：ADR-0037（Evidence≠Interpretation）、ADR-0038（Episode=投影）、ADR-0039（Task）、ADR-0040（Context Recovery）

## Context

dsh-shadow 已解决"**过去发生了什么**"（Memory Atom→Episode→Decision→Compact→Task→ContextReference）。下一阶段应解决"**为什么当前任务需要这些历史？如何最小成本恢复工作状态？**——不只是记住过去，而是在未来**重新构造当时工作的世界**"。用户 2026-09-07 提出吸收 Cursor（但**不直接照搬**），做成 **Observer Context Reconstruction Layer**。

但 **记住路径/实体 ≠ 记忆本身**——补丁目录、文件、模块、服务是**实体**（Entity），不是"一次 memory"。因此新增四个概念：

- **Entity（实体内存）**：路径/文件/模块/服务等**可复用对象**（`observed`，非 LLM 创造）。
- **Task State Snapshot（当前状态快照）**：`state/current-task`——**Context Resume Point**（恢复点），不是 Memory。
- **Rule（规则）**：`rules/workspace`——"永远约束什么"，与"曾经发生什么"（Memory）**分离**。
- **Context Reconstruction Engine**：`planner(LLM 选择) → resolver → builder → Context Bundle`。

LLM 只在 **Context Planning（选择）** 参与；**绝不** 判断事实 / 生成 memory / 补 reason。

## Decision

把方向冻结为 **Context Reconstruction Boundary**，并入下列允许/禁止集。**暂不实现**。

### 允许 / 禁止（本 ADR 冻结）

| 允许 | 禁止 |
|---|---|
| `Observation → Entity`（观察到实体/对象） | `LLM 创造 Entity` |
| `Episode → Context` | `LLM 补事实` |
| `Context Bundle` 带证据引用 | `Summary 替代 Atom` |
| `State = Context Resume Point` | `State 替代 Memory` |
| `Rule` 独立于 Memory（永远约束 vs 曾经发生） | `Memory → Truth` |

### 关键原则

1. **Entity ≠ Memory**：Entity 是**观察到的可复用对象**（`{type, name, value, status, last_seen, evidence:[atom/episode], source:"observed"}`）。例：补丁目录 `D:\U8\u8-20260908\OpenAPI适配` 是实体，不是"修改了xxx目录"的记忆。**绝不能** `LLM认为这是补丁目录`；只能 `观察到用户称它为补丁目录`（Observer 原则）。
2. **State ≠ Memory**：`state/current-task` = **Context Resume Point**（任务/已完成/关键决定/保留/未处理/相关/下一步），不是 Memory；是"恢复工作状态"的入口。
3. **Rule ≠ Memory**：Rule = "**永远约束什么**"（如 Java8 / 禁改生成代码）；Memory = "**曾经发生什么**"。不混。
4. **Context Reconstruction = Planner + Resolver + Builder → Context Bundle**：Planner(LLM) 判断"用户的话指哪个 Entity/Episode/Task"→ 选上下文 → Builder 产出 `Context Bundle {task, entities, decisions, evidence, current_state}`（**带证据来源**）→ 交给 LLM 回答。**不读全量 atom（500 个）**，只取所需。
5. **LLM 的边界**：只在 **Context Planning** 参与（把"昨天那个接口问题"映射到 Entity/Episode/Task）。**禁**：判断事实 / 生成 memory / 补 reason / 创造实体。
6. **差异化**：dsh-shadow 的 Context Reconstruction 比 Cursor 多一个东西——**每一次恢复都能指出证据来自哪里（provenance）**。这正是 Observer Runtime 的差异化。

## 参考存储演进（方向，暂不实现）

```text
.shadow/
├── atoms/       事实（不可改）
├── episodes/    投影（可重算）
├── decisions/   决策
├── entities/{paths,files,modules,services}/
├── state/current-task.md   恢复点
├── rules/workspace.md      约束
└── index/{memory,entity,context}-index.json
```

## 明确不做

- ❌ 现在实现（先冻结边界；实现与否待后续，并按 P0 优先级推进）。
- ❌ LLM 创造实体 / 补事实 / 生成 memory / 补 reason。
- ❌ Summary 替代 Atom / State 替代 Memory / Rule 混入 Memory。
- ❌ 照搬 Cursor"记住路径"式（dsh-shadow 是**可验证 Observer 连续性**，每次恢复都能指证据来源）。

## 自检（本 ADR 无代码，仅记录）

- [x] 与 ADR-0037/0038/0039/0040 自洽（Evidence≠Interpretation / Episode=投影 / Task生命周期 / ContextReference），不冲突。
- [x] 只吸收 Cursor 思路，不照搬：核心 = `Memory + Entity + State + Context Reconstruction（带证据来源）`。
