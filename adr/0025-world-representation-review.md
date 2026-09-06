# ADR-0025 · Observer World Representation Integrity Review（v0.31.1 架构冻结，先于 v0.32 Simulation）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.31，不改功能） ｜ 版本：v0.31.1
> 前置：ADR-0024（v0.31 World Representation Kernel）。定位：**证明 Representation Layer 永远低于 Reality Layer**。
> 新风险：v0.30 风险=把自己的观察当成事实；v0.31 新风险=**把对事实的结构表示当成世界本身**（很多 World Model / Knowledge Graph 系统的滑点）。

## 5 条 Invariant（冻结）

### Invariant 116 · Representation 不能超越 Evidence
```
RepresentationObject.certainty <= RealityClaim.epistemicStatus
```
- 禁：`RealityClaim: Service-A exposes /users` → `Representation: Service-A is a stable user service / should handle authentication`（第二层已加入解释）。
- **Representation 可以组织结构，但不能创造意义**。测试：supported claim→OK；candidate→reject。

### Invariant 117 · Graph ≠ Reality Graph
- 名称**必须保持 `RepresentationGraph`**（禁改名）。
- **禁任何字段** `worldGraph / realityGraph / entityGraph / causalGraph`（命名本身会污染未来设计）。
- 允许 `sourceClaims/sourceValidations`；禁 `discoveredEntities/causalEdges`。

### Invariant 118 · RelationHypothesis 永不升级
- 即使 多 Observer / 高 confidence / 多次 Validation，**也不能自动升级** `hypothesis → confirmed_relation → reality_relation`。
- 正确路径：`RelationHypothesis → Future Validation → 新的 RealityClaim`——**关系本身仍不是事实**。

### Invariant 119 · Explain 必须可追溯
- `world explain` 必须返回 `RepresentationObject → RealityClaim → RealityObservation → Perspective → ValidationHistory`。
- **禁** `generated_reason / inferred_knowledge`（那是"系统在猜"，不是"系统为什么这样表示"）。

### Invariant 120 · World Representation 不参与决策
- 禁 `Representation → Agent decision`（如 `Service-A exposes API → use Service-A`，那是 Planning/Policy 层）。
- 未来：`Representation → Decision Hypothesis → Validation`。

## 测试（mock 124–130）

| 编号 | 测试 | 对应 Invariant |
|---|---|---|
| 124 | unsupported RealityClaim 不生成 Representation | 116 |
| 125 | Representation 不增加 predicate（不加解释/评价） | 116 |
| 126 | Graph 不产生 Reality Entity（无 causalGraph/entityGraph/worldGraph） | 117 |
| 127 | RelationHypothesis 不升级（恒 hypothesis） | 118 |
| 128 | Explain lineage 完整（RealityObservation→Perspective→Validation） | 119 |
| 129 | Representation 不进入 Identity | 120 |
| 130 | Representation 不直接驱动 Decision | 120 |

## 通过后路线（不直接叫 v0.32 World Model）

```
v0.31.1 World Representation Integrity Lock  ← 本 ADR
v0.32 Simulation Boundary Protocol
v0.33 Counterfactual Model
v0.34 Environment Interaction
```
理由：真正的 World Model 不是"拥有世界结构"，而是"**能在保持 Reality / Hypothesis / Projection 分离的情况下，对可能世界进行模拟**"：
```
Reality: 发生了什么
Representation: 我目前如何表示它
Simulation: 如果条件变化，会怎样？
```
第三层最容易污染前两层。这条路线最大价值：**避免做出一个"很聪明但不知道自己不知道什么"的系统**。

## 边界 / 非目标

- 本 ADR 只审查、不改功能。实现验收在 v0.31.1：`tsc` + `node --check` + mock 1–130。
- 无 LLM、无 Knowledge、无因果、无 Simulation、无 Decision；Representation 永远低于 Reality Layer。
