# ADR-0026 · Observer Counterfactual Simulation Boundary Protocol（v0.32 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.32 实现） ｜ 版本：v0.32.0
> 前置：ADR-0025（v0.31.1 World Representation Integrity Lock）。定位：**从"认识现实"进入"探索可能现实"的分水岭** —— Observer Counterfactual Simulation。
> 不叫 World Simulation Engine：Simulation 不是创造另一个 Reality，而是 **在当前 Representation 基础上生成一个受约束的可能状态空间**。

## 第一条宪法：Simulation ≠ Reality

```
Reality Layer → (supported claims) → Simulation Input → Hypothetical State → Simulation Outcome
```
**禁止**：`Simulation Outcome → RealityClaim`（猜测→模拟→看起来合理→当事实，直接破坏 v0.30/v0.31 全部防线）。

## 对象模型

### SimulationScenario（"如果改变某个条件"）
```ts
SimulationScenario { id; basedOnRepresentationIds; initialState; changedConditions; assumptions; uncertainty; }
```
是 `HypotheticalChange`，不是 `RealityChange`。

### CounterfactualState（模拟状态）
```ts
CounterfactualState { scenarioId; derivedFrom; assumptions: string[]; stateVariables: string[]; uncertainty; }
```
**必须保留 `derivedFrom`**，否则模拟变成凭空世界。

### SimulationOutcome（不叫 Prediction）
Prediction 暗示未来真实值；Simulation 只是"在假设成立时模型内部推演结果"。
- 允许：`Given A changes, system representation suggests B may occur.`
- **禁止**：`A will cause B.`

## RelationHypothesis 第一次发挥作用

- v0.31：不能升级 Reality。
- v0.32：可作为 Simulation 输入——`RelationHypothesis → Simulation assumption → Outcome`；但**结果仍不能证明关系**。
- 例：假设 `A depends_on B` → 模拟 `remove B → A unavailable` → 只能得到 `simulation supports this hypothesis`，**不能得到** `RealityClaim: A depends_on B`。

## 6 条 Invariant

- **131** Simulation 不产生 RealityClaim（`SimulationOutcome ≠ RealityEvidence`）。
- **132** Simulation 不修改 Identity。
- **133** Simulation 输入必须 lineage 完整（必须能答"这个模拟基于什么？"：`Simulation → Representation → RealityClaim → Observation → Validation`）。
- **134** Assumption ≠ Fact（允许 `Assume API latency doubles`；禁 `API latency will double`）。
- **135** Simulation Result 不进入 Knowledge（否则 `Simulation → Knowledge → Decision` 重新退化成传统 Agent）。
- **136** 多个 Simulation 结果允许冲突（不 `choose winner`；保留 `Possible World A/B` 的 uncertainty）。

## 测试（mock 131–136）

| 编号 | 测试 | Invariant |
|---|---|---|
| 131 | SimulationOutcome 不生成 RealityClaim/Evidence | 131 |
| 132 | Simulation 不修改 Identity | 132 |
| 133 | Simulation lineage 完整（基于什么） | 133 |
| 134 | Assumption ≠ Fact（Assume vs will） | 134 |
| 135 | Simulation Result 不入 Knowledge | 135 |
| 136 | 多 Simulation 结果允许冲突（不 winner） | 136 |

## 路线

```
v0.32 Counterfactual Simulation Kernel  ← 本 ADR
v0.33 Environment Interaction Boundary
v0.34 Adaptive Planning Layer
```
真正成熟的 World Model 不是"存一个世界图"，而是闭环：
```
Reality → Representation → Simulation → Action → Reality Feedback
```

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.32：`tsc` + `node --check` + mock（131–136）+ 提交/推送。
- 无 LLM、无 Knowledge、无 RealityClaim 反写、无 Identity 修改、无 Prediction、无 Decision；Simulation 只产 `SimulationOutcome`（含 derivedFrom + assumptions + uncertainty）。

## 一句话

dsh-shadow 已完成"认识自己→认识现实→表示现实"；v0.32 进入"探索可能现实"。这一步是**行动前推演系统**的入口，边界必须先锁。

---

## 附录：v0.32 实现说明（补充 A/B 已落地）

1. **Simulation 是 Representation 的函数（+显式假设+规则），不是 Reality 的函数**：`simulation/engine/simulator.ts`——`SimulationScenario{changedConditions:"Assume X"}` + `SimulationRule{inputPattern, transformation, confidence, source}` → `SimulationOutcome`。`Rule ≠ Reality Relation`（只是模拟器推演规则）。
2. **Outcome 携带 epistemicStatus**：`SimulationOutcome{status: hypothetical|explored|compared, derivedFrom, assumptions, rules, stateAfter("suggests ... may occur"), uncertainty}`——**禁 predicted/confirmed/expected**。
3. 守卫（运行时约束）：`simulation/guard/assumption-guard.ts`（`Assume X` 允许、`X will cause` 拒绝——Assumption ≠ Fact）+ `reality-boundary.ts`（outcome 只 hypothetical、必须 `derivedFrom` lineage、禁 RealityClaim 反写）。

结构：`simulation/{types/{scenario,state,rule,outcome}, engine/simulator, guard/{assumption-guard,reality-boundary}, explain/explain}.ts`。`mode:"simulate"`。

mock 131–138 验证：SimulationOutcome 不产 RealityClaim(仅 hypothetical) / 不改 Identity / lineage 完整(derivedFrom) / Assumption≠Fact / 不入 Knowledge / 多结果允许冲突(不 winner) / Rule≠Reality Relation / 不反向污染 Representation。
