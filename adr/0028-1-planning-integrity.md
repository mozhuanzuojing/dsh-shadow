# ADR-0028.1 · Adaptive Planning Integrity Lock（v0.34.1 边界冻结复审，先于 v0.35 Agency）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.34，不加能力，只加边界/测试） ｜ 版本：v0.34.1
> 前置：ADR-0028（v0.34 Adaptive Planning）。目标：**冻结 Planning 的认识论位置**——防**隐性主体性漂移**。
> 关键：**系统没有显式定义价值，但通过长期规划行为，逐渐形成了自己的价值函数**——比单纯 Knowledge 污染更隐蔽。

## Invariant 159–165

- **159** Planning 不产生 Objective：`PlanningResult ❌→ Objective`；禁 `planningHistory.objective = generatedObjective`；只允许 `PlanningContext.objective.source === "external"`。
- **160** PlanCandidate 不产生 Preference：禁 `Plan A 经常成功 → 喜欢 Plan A → 未来自动倾向 Plan A`。
- **161** Evaluation 不产生 Value Model：允许 `constraint: latency < 100ms → candidate A satisfies constraint`；**禁** `candidate A is better/preferred/optimal`。
- **162** Planning 不改变 Identity：禁 `我经常选择架构方案A → 我是偏向架构A的人`。
- **163** Planning Success ≠ Planning Capability：禁 `Successful execution → "I am better planner"`；必须 `ActionFeedback → Observation → Validation`。
- **164** Plan Failure 不删除路径：禁 `失败方案→删除`；保留 `PlanCandidate + Outcome + Failure Evidence`（"为什么这个路径在当时条件下失败"）。
- **165** Planning Lineage 完整：任何计划必须能答"为什么产生这个计划？"——`PlanCandidate → PlanningContext → External Objective → Simulation Options → Constraints`；**禁** `System thought this is good`。

## 核心对象：PlanningComparison（非 PlanPreference/PlanScore）

```ts
PlanningComparison {
  candidates: [ { id; satisfiedConstraints[]; violatedConstraints[]; uncertainty } ];
}
```
强调：不是"谁最好"，而是"**哪些约束被满足/违反**"。

## 测试（mock 159–165）

| 编号 | 检查 | Invariant |
|---|---|---|
| 159 | Planning 不产生 Objective | 159 |
| 160 | PlanCandidate 不产生 Preference | 160 |
| 161 | Evaluation 不产生 Value Model | 161 |
| 162 | Planning 不改变 Identity | 162 |
| 163 | Success ≠ Planning Capability | 163 |
| 164 | Plan Failure 不删除路径 | 164 |
| 165 | Planning Lineage 完整 | 165 |

## 完成后边界（每层只做自己的事）

```
Reality→Evidence / Representation→Structure / Simulation→Possibility / Planning→Comparison / Action→Event / Feedback→Observation
```

## 路线

```
v0.34.1 Planning Integrity Lock  ← 本 ADR
v0.35 Agency Boundary Protocol   ← 真正危险：Planning+Action+Feedback+History 组合后产生 self-directed behavior
v0.36 Long Horizon Adaptation
v0.37 Controlled Autonomy
```
继续 v0.34.1 先冻结，会让后面的 Agency 层有坚实底座。**此路线最大优点：每获得一种能力，先证明它不会越权。**

## 边界 / 非目标

- 只加 boundary enforcement + 测试，不新增 runtime capability。实现验收：`tsc` + `node --check` + mock 1–165。
- 无 LLM、无 Reward、无 RL、无自生成目标/偏好、无价值模型、无 Identity 修改、无路径删除；objective 外部来源；PlanningComparison 用 satisfied/violated constraints（非谁最好）。

## 一句话

**系统可以比较路径，但不能因此拥有"我要什么"；系统是一个可以比较的观察者，不是一个会形成偏好的行动者。**

---

## 附录：v0.34.1 实现说明（Invariant Lock）

- 7 条边界固化为不可回退测试（mock 159–165）：Planning 不产生 Objective / PlanCandidate 不产生 Preference / Evaluation 不产生 Value Model / Planning 不改变 Identity / Success ≠ Planning Capability / Plan Failure 不删除路径 / Planning Lineage 完整。
- **PlanningComparison 非谁最好**：`planning/render.ts` 输出 `satisfiedConstraints/violatedConstraints`（哪些约束被满足/违反），不是 best/preferred。
- 无新增 runtime capability（只加边界/测试）；全量 mock 1–165 全绿；tag `v0.34.1 Planning Integrity Lock`。
- 通过后进入 v0.35 Agency Boundary Protocol（真正危险：Planning+Action+Feedback+History 组合 → self-directed behavior——"系统什么时候只是执行外部目标，什么时候开始形成自己的目标"）。
