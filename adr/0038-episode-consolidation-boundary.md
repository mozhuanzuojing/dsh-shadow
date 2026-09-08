# ADR-0038: Episode Consolidation Boundary（Episode 收口归档边界，v1.2.2 冻结）

- 状态：已接受（2026-09-07）
- 决定日期：2026-09-07
- 关联术语：`../CONTEXT.md`（Memory Atom / Episode / 收口归档 / Forget≠Delete）
- 冻结范围：v1.2.2（Episode 收口归档 `compact`）

## Context

dsh-shadow 补上"收口"：一个 episode 结束时，把其 turn 原子合并成 1 个 consolidated 文件，个体原子 `mark compacted` 并移出活跃热集。这解决了"**事实如何长期存储而不爆炸**"（v1.2.2 层）。

但引入收口时，必须想清楚一条边界：**收口是"读取模型"（projection）的变化，不是"事实模型"的变化。** 一旦把「解释层（Episode summary）」当成"事实源"，就会把"Observation → Summary"当成真相（把可读性当事实）——而 dsh-shadow 的目标是 **Observer Runtime verification layer**，**必须保留不可替代的事实层（Memory Atom）**：

```text
错误做法：    Observation → Summary                    （摘要可读 = 事实）
dsh-shadow:   Observation → Memory Atom                （事实源）
                      Memory Atom → Episode Projection （投影/解释，非事实）
                      Episode Projection → Recall/Replay
```

因此本条边界的核心判断（用户 2026-09-07 拍板）：**不做方向 A（写侧直接按 episode 成文件）**，因为那会让"原始事件"与"解释聚合"混在一起，导致无法再回答"为什么当时没删 X"这类细节问题。

## Decision

采用 **Episode 收口归档**（`compact:{enabled,gapMinutes}`，默认关），并**冻结下列边界**。

### 接受的边界（本 ADR 冻结，禁止越界）

1. **Episode ≠ Memory Atom**：Episode 是 **projection（投影/解释），不是 source（事实源）**。Memory Atom = 事实源（source of truth）；Episode 只在其上**派生**，绝不反过来覆盖/替换 Atom。
2. **Compact ≠ Forget**：收口（compact）≠ 遗忘（forget）。收口 = **压缩后仍可回放**（`Compacted ≠ Deleted`）；个体原子 `mark compacted` 只移出**活跃读取**，**文件保留、可重放**。
3. **Summary ≠ Reality**：Episode summary 只能陈述**事实性概括**（"本次完成 Todo 清理"），**禁止**评价性/结论性表述（"系统确认最佳方案 / decision proven correct"）。
4. **Closed Episode ≠ Completed Truth**：一个任务结束只是 **interaction ended**，**不是 decision proven correct**。收口不代表"该任务的决定已被验证为正确"。
5. **Replay 必须活过收口**：compact 前后，`replay(original)` 都必须可行——consolidated 文件（摘要）可读，`archive` 中的原子（原始证据）保留，二者都能回溯原始事件。**这是"可回放的经历投影"的最低要求。**
6. **方向 A（写侧按 episode 成文件）不做**：Episode 是 **derived boundary / 读侧投影**，不是 **write boundary**。写侧仍产 Memory Atom（事实层），Episode 由读侧派生。**理由**：①实时任务可能长时间 Open（8 小时无收口→无文件）；②任务边界无法由 agent 自决（今天"删 Todo+修 U8+调 OpenAPI"是一个还是三个 Episode？）；③Agent 无法知道任务何时结束。

### 类比（Representation ≤ Evidence）

与 Observer Runtime 既有原则一致：`Representation ≤ RealityEvidence`。Episode 是 Representation，Memory Atom 是 Evidence。**解释可以覆盖事实进行可读性投影，但绝不能替代事实本身。**

## 明确不做

- ❌ 方向 A：写侧按 episode 成文件（把解释层当事实源）。
- ❌ episode 级 `deleted` / 物理删除（只 `compacted`/`archived`，`Forget≠Delete`）。
- ❌ 在 consolidated 文件里写入"正确/最佳/已确认"这类**评价/结论**（只记事实性概括）。
- ❌ 把 Episode 提升为 source of truth（动摇 Memory Atom 事实层）。
- ❌ 为降文件数而放弃可回放性（`Replay must survive compaction` 是不变量）。

## 自检

- [x] `npx tsc --noEmit` / `npm run build` 通过
- [x] `node test/episode-lineage.test.ts` ALL PASS（含场景 7：收口生成 consolidated、原子压缩归档、决策可回放）
- [x] `node test/recall-attribution.test.ts` ALL PASS（invariant 1–240 回归）
- [x] `compact.enabled=false`（默认关）时行为不变（纯读取模型变化）
