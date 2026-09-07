# ADR-0037: Decision Capture Boundary（决策捕获边界，v1.1.0 + v1.1.1 冻结）

- 状态：已接受（2026-09-07）
- 决定日期：2026-09-07
- 关联术语：`../CONTEXT.md`（DecisionEvent / DecisionReason / Confirmation / Memory Atom）
- 冻结范围：v1.1.0（Episode / Decision Lineage）+ v1.1.1（Decision Capture Boundary）

## Context

对真实 OpenAPI-Gateway 的 `.shadow` 做 Shadow Replay（286 个 Memory Atom，平均 734B）后，问题被精确定位闭环：

```text
286 Atoms → (聚合) 3 Episodes → (决策) 1 Decision(误报「好」) → 证明 Decision Capture 在源头缺失
```

- **聚合层可用**：Episode/Decision Lineage 能把 Event/Turn 级碎片串成连续任务（286→3），"碎片怎么串"已解决。
- **事实层缺失**：历史数据里"我为什么这么决定"根本没有作为一等事件进入 Memory（旧采集只记动作/背景，决策≈0，且唯一一条是 `「好」〔decision〕` 误报）。
- **所以**：继续优化 `deriveDecisions()`（读侧派生）没有意义——真正缺的是**决策在发生的瞬间没有进入 Memory**，而非 Recall 或 Episode 的问题。

## Decision

在 `v1.0.x` Observer Runtime Foundation 之上，新增**两层派生/捕获层**并**冻结**：

1. **Episode / Decision Lineage（v1.1.0）**：把记忆原子按「项目/会话 + 时间间隔」聚合成连续任务（Episode），并把「决策」从 `概况：N 决策` 统计字段提升为可追踪血缘。**派生式、纯读、不改写采集流**。
2. **Decision Capture Boundary（v1.1.1）**：决策在发生瞬间作为**一等事件**进入 Memory——goal 事件 / 用户拍板 / assistant 明确决策，在写侧被采集为 `DecisionEvent`，并**分离「决策事实」与「决策理由」**。

### 「决策事实」与「决策理由」分离（本 ADR 锁定的最关键边界）

```text
DecisionEvent = 发生了一个决定     → `> 决策：〔source〕statement`
DecisionReason = 决定时明确表达的理由 → `> 决策理由：〔source〕reason`
```

两者不同。关键不变量：

> **Reason = 原文明确存在的事实；绝不等于"系统认为当时应该是什么原因"。**

- assistant 说「保留 RetryWorker，因为它仍然承担失败重试职责」→ `Reason = 它仍然承担失败重试职责`（原文从句）。
- assistant 只说「RetryWorker 保留。」→ `Reason = 未明确`。
- **绝不生成** `Reason = 因为 RetryWorker 仍承担失败重试职责`（这会把采集变成推理）。

这正是 `Evidence ≠ Interpretation` 的落地：**有 Decision ≠ 一定有 Reason**。

## 接受的边界（本 ADR 冻结，禁止越界）

1. **捕获明确的 Decision**（goal 事件 / 用户拍板 / assistant 明确决策）。
2. **捕获明确表达的 Reason**（仅当原文明确存在）。
3. **建立 sourceRef**（goal / user / assistant）+ lineage。
4. **建立 evidenceRef / contextRef**（沿用同回合的背景材料/动作，派生提供）。
5. **Confirmation 不误判为 Decision**（「好/可以/行/ok/嗯/收到/继续」→ 单独 `confirmation` 类，不进 DecisionEvent）。
6. **不做 LLM 事后推理**（Decision 不从上下文补写理由）。
7. **不生成缺失 Reason**（缺则显示「未明确」，宁可漏、不可编）。
8. **不修改历史 Memory**（写侧只对未来采集生效；过去数据不回填）。
9. **不改变 Episode 机制**（Episode 派生保持不变）。
10. **不引入 Preference / Value / Learning**（无奖惩、无偏好学习、无经验自动形成）。

### 事实源与派生关系（保持单事实源）

```text
Memory = Source of Truth
Episode = Continuity Projection
Decision = Captured Fact
Reason = Explicit Source Text
Recall = Access Transition
Replay = Verification / Inspection
```

**无 DecisionStore / Decision Repository / Decision DB / Decision Manager**——Memory 是唯一事实源，Decision/Episode 全是派生关系，避免两套事实源。`reason` 是 `sourceRef` 指向的原始文本语义，不落独立存储。

## 下一阶段评估（5 个指标，供真实数据再次 Replay）

不只看 Decision 数量。第二次 Replay（v1.1.1 新数据）重点看：

| # | 指标 | 定义 | 关注 |
|---|------|------|------|
| ① | **Decision Precision** | 明确 Decision / 所有被标记 Decision | 有没有「好/可以/嗯/收到/继续」这类 Confirmation 混进 |
| ② | **Decision Recall** | 人工抽查实际明确发生的 Decision / 系统捕获的 Decision | 正则是否漏掉大量真实决策 |
| ③ | **Reason Coverage** | 有明确 Decision 的记录中，有明确 Reason 的比例（例：100 决策中 37 有理由 / 63 未明确） | 诚实反映"Agent 当时到底有没有表达理由"，**不是**要求 100% |
| ④ | **Source Traceability** | Decision → sourceRef → 原始 Memory Atom → 原始 Event/Message | 应接近 100%，否则 Decision 变成"二手事实" |
| ⑤ | **Task Replay Completeness** | Goal→Observation→Evidence→Decision→Reason→Action→Result 是否可追溯 | **存在的东西能追溯，不存在的明确显示缺失**（≠ 要求完整率 100%） |

## 明确不做（本阶段排除，避免拉回 Verification / Epistemic Boundary）

- ❌ DecisionStore / Decision DB / Decision Repository
- ❌ LLM 自动补 Reason / LLM 抽取 Decision（会把"采集"变成"判断"）
- ❌ Preference / Value / Learning / Reward / RL
- ❌ Decision Score / Quality
- ❌ Confidence（决策置信度）
- ❌ 自动判断"正确决策"
- ❌ 自动形成经验 / Decision → Goal

**理由**：一旦引入 LLM，必须回答「抽取结果是不是事实？」「source 指原文还是模型？」「LLM 是否把上下文推断成理由？」「同一段话不同模型是否得到不同 Decision？」「如何验证无 hallucination？」「失败怎么办？」——这一整套问题会重新打开 Verification / Epistemic Boundary。**当前正则虽然笨，但确定性最强：宁可漏，不可编。** v1.1.x 阶段坚决保持。

## 自检

- [x] `npx tsc --noEmit` 通过
- [x] `npm run build` 通过（dist 与源码同步）
- [x] `node test/episode-lineage.test.ts` ALL PASS（含 Decision Capture 场景）
- [x] `node test/recall-attribution.test.ts` ALL PASS（invariant 1–240 回归）
- [x] 真实 OpenAPI-Gateway `.shadow` 回放：聚合生效（286→3），旧数据 1 条误报决策（v1.1.1 只对未来生效）
