# ADR-0027 · Observer Action Boundary Protocol（v0.33 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.33 实现） ｜ 版本：v0.33.0
> 前置：ADR-0026（v0.32 Counterfactual Simulation）。定位：**把系统性质从"我如何理解世界"转变为"我如何影响世界"**——但**Action Boundary Kernel**（不叫 Action Engine）。
> 核心思想：**Action 不是 Simulation 的执行结果，而是一个经过约束、授权、反馈闭环的现实交互提议。**

## 第一条宪法：Simulation Outcome ≠ Action Command

```
SimulationOutcome
      |
      X
      |
      v
Action
```
**禁**：`Simulation says "If API removed, impact may increase" → execute remove API`（最危险路径）。
**正确**：
```
SimulationOutcome → ActionCandidate → Evaluation → Permission/Policy → Execute → Reality Feedback
```

## 对象模型

### ActionCandidate（不是 Action——生成行动建议 ≠ 执行动作）
```ts
ActionCandidate { id; basedOnSimulation; intendedEffect; assumptions; risk; uncertainty; }
```
关键词：candidate。

### ActionExecution（真正的外部改变——首次产生 Reality Change，但它只是一个事件，不是 RealityClaim）
```ts
ActionExecution { id; candidateId; environment; executedAt; executor; result; }
```

### ActionFeedback（执行后的现实反馈）
```ts
ActionFeedback { actionId; observationRefs; validationRefs; unexpectedEffects; }
```
路径：`Action → Observation → RealityObservation → Validation`；**禁** `ActionResult → RealityClaim`。

## Invariant（139–144）

- **139** Simulation 不直接执行 Action（`SimulationOutcome X→ ActionExecution`）。
- **140** ActionCandidate ≠ ActionApproval（生成建议允许；执行需 approval/policy）。
- **141** Action 不修改 Identity（禁 `Action success → I am better → Identity change`；必须经 Observation→Reflection→CandidateIdentityChange→Evaluator，保持 v0.25 规则）。
- **142** Action Result 不自动成为 Knowledge（禁 `Action succeeded → Knowledge: this action always works`；必须 `Reality Evidence + Validation`）。
- **143** Environment Feedback 必须进入 Observation（环境不是 Memory：`Environment → ObservationTrace → Reality Layer`）。
- **144** 失败 Action 也是 Reality Evidence（禁 `failure → discard`；失败意味着 `Simulation assumption 可能错误`，应进入 `ValidationHistory`）。

## v0.33 最大风险：Agent 自我强化循环

```
Simulation → Action → 成功 → 我预测正确 → 提高自己信任 → 更多行动
```
这绕过 Validation / Alternative Explanation / Reality Boundary。必须保持：**`Action success ≠ Model truth`**。

## v0.33 不做

❌ 自动执行 ❌ 自主目标生成 ❌ Reward 优化 ❌ Policy Learning ❌ Self Improvement —— 属更后 Agent Layer。
v0.33 只做 **Action Boundary Kernel**。

## 测试（mock 139–144）

| 编号 | 测试 | Invariant |
|---|---|---|
| 139 | Simulation 不直接执行 Action | 139 |
| 140 | ActionCandidate ≠ ActionApproval | 140 |
| 141 | Action 不修改 Identity | 141 |
| 142 | ActionResult 不自动成为 Knowledge | 142 |
| 143 | Environment Feedback 进入 Observation | 143 |
| 144 | 失败 Action 也是 Reality Evidence | 144 |

## 路线

```
v0.32 Counterfactual Simulation  ✅
v0.33 Environment Interaction Boundary  ← 本 ADR（Action Boundary Kernel）
v0.34 Adaptive Planning Boundary
v0.35 Autonomous Loop（如果需要）
```
v0.33 目标不是"会行动"，而是：**证明 Observer 可以影响现实，同时不会把自己的行动结果误认为世界规律**。

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.33：`tsc` + `node --check` + mock（139–144）+ 提交/推送。
- 无 LLM、无自动执行、无 Policy/Reward/Self-improvement、无 Identity 修改、无 Knowledge 生成；`ActionCandidate` 需 approval/policy；`ActionExecution` 是事件非 RealityClaim；`ActionFeedback` 进入 Observation/Validation。

## 一句话关键冻结

```
Simulation ≠ Action
Action ≠ Reality
Action Result ≠ Knowledge
Success ≠ Truth
Failure ≠ Ignore
```
v0.33 是继 v0.28 Reality Feedback 之后**第二个真正的"现实闭环"节点**。
