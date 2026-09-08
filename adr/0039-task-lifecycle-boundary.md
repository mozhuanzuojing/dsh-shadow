# ADR-0039: Task Lifecycle / Event Sourcing Boundary（任务生命周期·事件溯源边界，提议·暂不实现）

- 状态：**已提出（2026-09-07，先冻结原则，暂不实现）**——这是一次**模型升级**，不是功能添加；实现与否待后续决定。
- 决定日期：2026-09-07
- 关联术语：`../CONTEXT.md`（Memory Atom / Episode / 收口归档 / DecisionEvent）
- 关联 ADR：ADR-0037（Decision Capture）、ADR-0038（Episode Consolidation）
- 修订：2026-09-08 移除 claude-mem 对照段（参考材料下线；小节改名「与『摘要式记忆』的本质区别」，边界未变）

## Context

当前 dsh-shadow 已具备：`Memory Atom → Episode → Decision → Compact → Replay`，比普通 AI Memory 强。但用户 2026-09-07 指出一个**潜在问题**：

> 现在的 Episode / Decision 是"从事件里**推导出来的结构**"，但缺少一个**一等 Task Lifecycle Model（任务生命周期模型）**。

即现在能回答"**发生了什么**"（很好）、"**做了什么决定**"（开始有了），但还缺一个一等结构承载：
- 为什么这个任务开始？（trigger）
- 什么条件代表完成？（objective / status）
- 哪些决策改变了任务方向？（Decision→Task 关系）
- 哪些结果影响后续？（Outcome→后续）

现有模型是 `Event → Episode 投影`，但 **Task 没有成为一等对象**。本 ADR 提出把模型升级为 **Event Sourcing + Task Graph**，并**先冻结其认识论边界**（避免实现时越过既有原则）。

## 提议的模型（方向，未实现）

```text
Observer Runtime
      ↓
Event Sourcing Layer        Observation / Decision / Outcome
      ↓
Task Graph Projection
      ↓
Episode / Replay View
```

- **Memory Atom 不是最高抽象**：286 个 atom 实际是"**一个任务生命周期**"，而非 286 个记忆。新增 **Task** 层来理解。
- **Event（不可变事实）**：`{ id, timestamp, type, source, content, evidence }`。例：`{ type:"file_change", file:"TodoSyncJob.java", action:"deleted" }`。
- **DecisionEvent**：已有（`{ statement, source, reasonRef }`），**保留**。
- **TaskContext（建议新增）**：`{ id, title, trigger, objective, constraints[], status: active|completed|abandoned }`。**注意：objective ≠ identity**，只是任务上下文。
- **OutcomeEvent（ObservedOutcome）**：`{ event, observation, evidenceRef }`——**不要 Success/Failure**（会引入判断）。例 `{ event:"mvn test", observation:"85 tests passed", evidence:"log-xxx" }`。因为 **测试通过 ≠ 方案正确**（呼应 ADR-0037 的 Evidence≠Interpretation）。
- **Episode 降级**：Episode = **人类阅读窗口（human reading window）**，**不是系统理解单位（system understanding unit）**。系统理解单位 = Task Graph。
- **存储**：不推翻"一切皆文件"，但目录可演进：`events/`（事实，不可改）/ `tasks/`（关系）/ `projections/`（可随时重新生成）/ `archive/`。换 Markdown/SQLite/Git/Vector/Graph 都不影响模型——**核心是 `Immutable Event + Lineage Graph + Projection`。**

## 与「摘要式记忆」的本质区别（本 ADR 强调）

> dsh-shadow：`Event → Lineage → Task Graph → Replay`，优化"**证明过去发生了什么**"（可审计的 Experience Lineage System）；而不是 `Observation → Summary → Context` 那种"**给模型更多上下文**"的优化。

dsh-shadow 保留**不可替代的事实层**（Memory Atom / Event），不为"省上下文"用摘要覆盖事实。

## 接受的边界（本 ADR 先冻结，实现时禁止越界）

1. **Task ≠ Episode**：Task 是生命周期一等对象（trigger/objective/constraints/status）；Episode 只是**投影/阅读窗口**，不是系统理解单位。Task 驱动理解，Episode 只做呈现。
2. **Event ≠ Summary**：Event 是不可变事实（source of truth）；Summary/Episode 是派生的投影，**绝不反过来覆盖/替代 Event**。
3. **Outcome ≠ Success**：只记 `ObservedOutcome {event, observation, evidenceRef}`，**禁止** `success:true/false` 或"方案正确"这类**判断/评价**（`测试通过 ≠ 方案正确`）。
4. **Projection ≠ Truth**：Episode/Summary/Task Graph 都是投影，可随时重算；`Representation ≤ Evidence`，投影永远不比证据更可确定。
5. **Replay 必须由 lineage 派生**：任何 Replay 必须能从 `Event Lineage + Task Graph` 追溯，而非依赖"写死的总结"；换存储不得破坏 lineage 可追溯性。

## 明确不做（本 ADR 不批准的内容）

- ❌ 现在实现（先冻结原则，跑真实数据验证方向，再决定是否实现）。
- ❌ 引入 Success/Failure / 正确性判断到 Event 层（只 `ObservedOutcome`）。
- ❌ 用 Episode/Summary 覆盖事实层（Memory Atom 仍是 source of truth）。
- ❌ 为省上下文而省略 lineage（`Replay must derive from lineage` 是不变量）。

## 自检（本 ADR 无代码，仅记录；文档一致性）

- [x] 与 ADR-0037（Evidence≠Interpretation）/ ADR-0038（Episode=投影）自洽，不冲突。
- [x] 明确这是模型升级（非功能），实现与否待后续用真实数据的第二次 Replay 验证后决定。
