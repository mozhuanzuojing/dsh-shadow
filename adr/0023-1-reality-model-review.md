# ADR-0023.1 · Reality Model Integrity Review（v0.30 后架构冻结审查，先于 v0.31）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.30，不改代码） ｜ 版本：v0.30.1
> 前置：ADR-0023（v0.30 Reality Model Kernel）。定位：**确认 Reality Model 描述的是"被观察到的稳定结构"，而不是"世界本体"**。
> 防隐蔽退化：`RealityClaim + Relation + Entity = 看起来像世界模型，但实际只是多个 Observer 投影的集合`。

## Review 重点（5 条锁定）

### 1. RealityClaim predicate 必须属 observable predicate set
允许（观察到的行为）：`exists / exposes / changed / responded / returned / located_at / connected_to`。
**禁止**（评价/决策）：`good / bad / better / should / optimal / recommended`。
- 例：允许 `Service-A exposes API /users`；禁止 `Service-A is reliable`（评价）、`Service-A should become microservice`（决策建议）。
- 冻结 invariant：`RealityClaim.predicate ∈ observablePredicateSet`，否则拒绝生成（status=rejected 或不入 Model）。

### 2. Validated ≠ Truth（再加 epistemicStatus）
`supported` 必须明确 **≠ true**。建议 v0.31 增加：
```
RealityClaim.epistemicStatus: observed_supported | temporally_supported | currently_unresolved
```
而非 `true/false`。原因：科学模型 Newtonian 曾 supported，Relativity 出现后不是 `Newtonian=false`，而是 `scope changed`。

### 3. ObservedEntityCandidate 不升级 Entity
保持 `ObservedEntityCandidate`，**不升级 `RealityEntity`**（Entity 暗含"世界中真实存在的对象"）。v0.31 也不改名。

### 4. Reality Model 不做关系-因果推理
Reality 可记录 `Observation: A requested B API at timestamp T`；**禁** `A depends_on B`（除非 World Model 明确声明为 **Relation Hypothesis**，不是 Reality Claim）。否则已进 World Model。

### 5. Reality Model ≠ World Model（v0.31 入口条件）
**World Model 不拥有**：Identity / Memory / Personality / Knowledge / Truth / Causal Graph。
**World Model 只能拥有**：`Supported RealityClaim + Temporal Context + Uncertainty + Relation Hypothesis`。

## v0.31 推荐定位（内部名）

不叫"世界模型副本"。内部名 **Observer World Representation Layer** 或 **Reality Structure Model**。含义：
```
Observer: "I currently have enough evidence to represent this part of reality like this."
```
不是创造世界副本，而是**观察者当前的现实表征**。

## 路线

```
v0.30.0 Reality Model Kernel  ✅
ADR-0023.1 Integrity Review    ← 本 ADR（冻结 5 条）
v0.31 ADR-0024 World Representation Boundary → v0.31 implementation
```

## 边界 / 非目标

- 本 ADR 只审查、不改代码（RealityClaim.epistemicStatus、observablePredicateSet 校验留 v0.31 实现）。
- 无 LLM、无 Knowledge、无 Truth、无 Causality、无 Entity 本体化、无 Identity/Personality。

## 结论

通过后 v0.31 才有资格。这一层相当于给 World Model 加最后一道"不可僭越边界"。
