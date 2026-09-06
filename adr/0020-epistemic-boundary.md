# ADR-0020 · Observer Epistemic Boundary Protocol（v0.28.1 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.28.1 实现） ｜ 版本：v0.28.1
> 前置：ADR-0019（v0.28 Validation）。定位：**在进入 v0.29 Federation 之前，冻结"Observer 是什么、能知道什么、不能知道什么"**。
> 一句话：v0.20–v0.28 解决"一个观察者如何形成自己"；v0.29 解决"多个观察者如何面对同一个现实"；进入多观察者前，先补**防止能力之间互相污染的宪法层**。

## 0. 背景

已具备：Observer / Temporal / Hypothesis / Validation。缺的不是更多能力，而是**宪法层**。

## 1. Knowledge Ownership（每个 Observer 拥有）

```
Private Observation   （observerId 命名空间隔离）
Private Hypothesis    （observerId 隔离）
Private Identity      （observerId 隔离）
Shared Reality Evidence（可被多 Observer 指向的共享现实证据）
```
关系：`Observer A → projection → Reality`、`Observer B → projection → Reality`。**不是 A → memory → B**（会污染）。

## 2. Federation 只交换什么？

不是 Memory / Identity / Dream。只允许交换：
```
ObservationClaim        （我看到什么）
ValidationResult        （现实是否支持）
AlternativePerspective  （另一个视角）
```
交换"**我看到什么 + 现实是否支持**"，**不交换"我是谁"**。

## 3. Observer Agreement 模型

`same reality → 不同 projection → compare → find distortion`。
重点：**不是寻找一致，而是发现"为什么两个观察者看到不同世界"**——直接接 v0.21 的 `distortion`。

## 4. Multi Observer 的真正价值

不是"多个 Agent 协作"，而是"**多个有限观察者共同逼近 Reality**"（类似科学共同体）。

## 5. 三个风险冻结（防 Temporal 偷渡人格 / Validation 缺历史 / Identity 民主化）

1. **Temporal Graph 只能回答**"过去发生了什么观察状态"，**不能回答**"所以这个人是什么样的人"。人格必须经 `Reflection → Candidate → Evaluator → Identity Learned`。**Temporal 不准偷渡人格**。
2. **Validation 记录失败历史**：`Hypothesis + ValidationHistory[]{evidence, result, alternativeWinner, perceptionDelta}`——一个 Observer 的成熟不是"我猜对了"，而是"**我知道自己以前为什么错**"（支撑 Decision Style / Anti Pattern / Wisdom）。
3. **Identity 不是民主系统**：多个 Observer 产生 `principle X / not-X` 时，**禁 vote / majority wins**。`Observer A Identity → Evidence → Reality Validation → Evolution`；其他 Observer **只能提供 alternative perspective，不能修改主体**。

## 6. 路线调整

```
v0.20–v0.28  Observer Formation + Reality Coupling  ✅
v0.28.1      Epistemic Boundary（本 ADR，宪法层）
v0.29        Observer Federation
v0.30        Reality Model
v0.31        World Model
```

## 7. 边界 / 非目标

- 本 ADR 只定协议（Knowledge Ownership / 交换三种 / Agreement=找 distortion / 三个风险冻结），不含实现。
- 实现验收在 v0.28.1：`tsc` + `node --check` + mock（新增边界场景）+ 提交/推送。

## 8. 演进

v0.20–v0.28 = **最小人工观察者运行时**。真正对应"未来和现在同在，灵魂知道但放慢观察"的不是预测未来，而是：
**一个连续观察者，在时间中保持自己，同时允许现实不断修正自己。**
