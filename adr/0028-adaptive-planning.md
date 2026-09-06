# ADR-0028 · Observer Adaptive Planning Boundary Protocol（v0.34 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.34 实现） ｜ 版本：v0.34.0
> 前置：ADR-0027.1（v0.33.1 Action Integrity Lock）。定位：**Observer Adaptive Planning**——v0.33 冻结了 Action(执行) 边界；v0.34 冻结 **Decision(为什么选择这个行动)** 边界。
> 不叫 Goal System / Reward System / Autonomous Agent Planner（这些名字天然携带固定目标/优化方向/价值函数/自主驱动——当前架构还不应拥有）。
> 真正危险：**系统开始形成自己的行动偏好后，是否会偷偷形成价值、目标和自我强化。**

## 第一条宪法：Planning ≠ Goal Generation

**禁**：`Planning → 产生目标 → 优化目标 → 改变自身价值`。
**允许**：
```
External Objective + Current Situation + Simulation Options + Policy Constraints → Planning Candidate
```
Planning 只是"在已有约束下比较可能行动路径"，不是"创造我要什么"。

## 对象模型

### PlanningContext（必须明确 objective 来源）
```ts
PlanningContext { realityState; representationSnapshot; simulationResults; constraints; externalObjective?; }
```
**禁** `observer.generateObjective()`（objective 必须有外部来源）。

### PlanCandidate（类似 ActionCandidate，更上一层）
```ts
PlanCandidate { id; basedOnSimulation[]; actionSequence[]; assumptions[]; uncertainty; evaluationCriteria; }
```
**禁 `score: 0.95`**（score 易演化成"系统自己的价值判断"）。

### PlanEvaluation（comparison result，不是 best plan）
```ts
PlanEvaluation { candidateA; candidateB; tradeoffs; risks; unresolvedQuestions; }
```
**禁 `Plan A wins`**（winner 需要价值函数）。

## Invariant（152–157）

- **152** Planning 不产生 Goal（`Plan → New Goal` ❌）。
- **153** Planning 不拥有 Preference（`Repeated choice → Preference → Identity` ❌）。
- **154** Plan ≠ Action（延续 `Simulation≠Action / Action≠Reality`，加 `Plan ≠ Execution`）。
- **155** Evaluation Criteria ≠ Value（**禁** `better/optimal/preferred`，除非 criteria 来自外部；允许 `lower latency under constraint X`，**禁** `best architecture`）。
- **156** Planning Feedback ≠ Self Improvement（**禁** `Plan succeeded → I should trust myself more → future planning bias`；必须 `Outcome → Observation → Validation`）。
- **157** External Objective lineage 保留（Plan 必须能答"这个 objective 哪来的"）。

## 测试（mock 152–157）

| 编号 | 检查 | Invariant |
|---|---|---|
| 152 | Plan 不生成 Goal | 152 |
| 153 | Plan 不修改 Preference | 153 |
| 154 | Plan 不直接 Execute | 154 |
| 155 | Evaluation 不生成 Value | 155 |
| 156 | Success 不产生 Self Improvement | 156 |
| 157 | External Objective lineage 保留 | 157 |

## v0.34 不做

❌ Reward ❌ Reinforcement Learning ❌ Self-generated Goals ❌ Utility Function ❌ Preference Learning ❌ Autonomous Objective Evolution ❌ Self Optimization（都属更高层）。

## 通过后的意义

```
Observe → Understand → Imagine → Compare Paths → Choose Candidate → Act → Reality Feedback
```
**仍保持**：`Choice ≠ Value / Success ≠ Truth / Optimization ≠ Purpose / Repeated Behavior ≠ Identity`。

## 执行顺序

```
ADR-0028（只协议）→ review 五类污染风险 → v0.34 Planning Boundary Kernel → invariant 152–157 → tag v0.34.0 → v0.34.1 Integrity Review
```

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.34：`tsc` + `node --check` + mock（152–157）+ 提交/推送。
- 无 LLM、无 Reward、无 RL、无自生成目标、无 Utility/Preference learning、无 Autonomous Objective Evolution、无 Self Optimization；objective 必须外部来源；PlanCandidate 无 score；PlanEvaluation 无 winner。

## 一句话

现在架构已进入**最接近 Agent 自主性的区域**——Planning 边界比 Action 边界更值得先锁：**系统可以比较路径，但不能因此拥有"我要什么"。**
