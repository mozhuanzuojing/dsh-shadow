# ADR-0027.1 · Action Integrity Lock（v0.33.1 边界冻结复审，先于 Adaptive Planning）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.33，不改功能优先，只加边界/测试） ｜ 版本：v0.33.1
> 前置：ADR-0027（v0.33 Action Boundary Kernel）。目标：**证明 Action 可以改变环境，但不能改变 Observer 对自己的定义**。
> 特殊性：v0.28 允许现实修正自己 / v0.32 允许模拟可能世界 / **v0.33 允许影响现实**——Action 层是目前最大"外溢风险点"。

## 6 条 Invariant（冻结）

### 146 · ActionExecution ≠ RealityClaim
```
ActionExecution → Observation → RealityObservation → Validation → RealityClaim
```
**禁** `ActionExecution.success → RealityClaim`（否则"我做了→成功了→所以我的模型正确→现实就是这样"=行动自证）。

### 147 · ActionFeedback ≠ Model Validation
Feedback 只能提供 `Observed Result`，不能直接提供 `Hypothesis Validated`。
- 允许：`修改配置后 API 延迟下降`。
- **禁**：`修改配置证明架构优化方向正确`（已跨入解释层）。

### 148 · Failure Must Persist
失败不能丢弃：`ActionExecution(failed) → ActionFeedback → ObservationTrace → ValidationHistory`。
否则系统自然形成"成功留下/失败删除 = 人为制造正确率"。

### 149 · Action Cannot Rewrite Past
禁 `Action Result → 修改历史 Observation → 重新解释过去`，**必须 append-only**。
- 过去：`API 在 T1 返回 timeout`；未来：`修复后正常` → 正确 = 两个 Observation；错误 = `API 从未异常`。

### 150 · Action Success ≠ Identity Update
（强化 145）禁 `ActionSuccess → "I am good at architecture" → Identity`；必须 `ActionHistory → Reflection(candidate) → Evaluator → Identity Candidate`（走 v0.25 人格闸门）。

### 151 · Action Scope ≠ Reality Ownership（新增重要边界）
Action 改变的是 `environment fragment`，不是 `Reality Model ownership`。
- 禁 `Action: deploy service → Reality: this architecture is correct`。
- Action 只能产生 `changed_at_time_T`，不能产生 `should_exist`。

## 测试（mock 146–151）

| 编号 | 测试 | Invariant |
|---|---|---|
| 146 | ActionExecution 不生成 RealityClaim | 146 |
| 147 | Feedback 不直接 validate hypothesis | 147 |
| 148 | Failure append-only（保留） | 148 |
| 149 | Action 不修改历史 Observation | 149 |
| 150 | Success 不改 Identity | 150 |
| 151 | Action 不拥有 Reality（不产 should_exist/correct） | 151 |

## v0.33.1 后架构状态（闭环）

```
Observer → Reality Feedback(v0.28) → Simulation(v0.32) → Action(v0.33) → Feedback → Reality Update
Observe → Understand → Imagine → Act → Observe Again
```
**仍保持**：`Act ≠ Learn / Success ≠ Truth / Change ≠ Knowledge`。

## 边界 / 非目标

- 本 ADR 只加 boundary enforcement + 测试，**不新增 runtime capability**。实现验收：`tsc` + `node --check` + mock 1–151。
- 无 LLM、无自动执行、无 Policy/Reward/Self-improvement、无 Identity 修改、无 Knowledge 生成、无 Reality 所有权。

## 一句话

Action 可以改变环境，但**不能改变 Observer 对自己的定义**；Action 是影响现实，**不是拥有现实**。

---

## 附录：v0.33.1 实现说明（Invariant Lock）

- 6 条边界固化为不可回退测试（mock 146–151）：ActionExecution 不生成 RealityClaim / Feedback 不 direct validate hypothesis / Failure 保留 / Action 不改历史 Observation / Success 不改 Identity / ActionScope ≠ RealityOwnership。
- 最小 boundary enforcement：`action/guard.ts` 扩展 `EXECUTION_FORBIDDEN`(RealityClaim/Evidence/should_exist/is correct/proves) 与 `FEEDBACK_FORBIDDEN`(validated/proves/方向正确)——Action 是影响现实不是拥有现实。
- 全量 mock 1–151 全绿；tag `v0.33.1 Action Integrity Lock`。通过后进入 Adaptive Planning Boundary Protocol（Planning 会引入新危险："选择行动的机制"会不会偷偷变成"目标、价值、奖励、人格"——需比 Action 更严格）。
