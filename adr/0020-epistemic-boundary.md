# ADR-0020 · Observer Epistemic Boundary Protocol（v0.28.1 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v0.28.1） ｜ 版本：v0.28.1
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

---

## 附录：v0.28.1 实现说明（认知边界 Enforcement，非权限层）

1. **Federation 是 Projection Contract 不是 Access**：`federation/{types,contract,guard}.ts`。`FederatedObservationPacket{sourceObserverId, observationClaim, projectionSnapshot{lens,visible,hidden,distortion}, validationReference, boundary{identityExcluded:true, memoryExcluded:true, dreamExcluded:true}}`——**不是隐藏 Identity，而是明确"Identity 不属于可交换现实证据"**。`mode:federation`。
2. **Temporal Epistemic Render**：`temporal/render.ts`（`renderNodePerception` 只报 visible/hidden/distortion/lens；`renderNodeIdentityContext` 显式返回 `identityVersion`，非 personality）。`mode:temporal{perceptionOnly|identityContext}`。**Temporal 永不输出人格结论。**
3. **Validation Timeline 一等对象**：`validation/history.ts` `ValidationTimeline{hypothesisId, events: ValidationEvent[]{time,evidenceIds,result,alternativeWinner,perceptionDelta}}`——`Hypothesis immutable + Validation append-only`（智慧=能记住自己什么时候错过）。`mode:validate` 自动 append；`mode:timeline` 读取。
4. **跨 Observer distortion**：`federation/guard.ts` `compareProjections`（同一 Reality 不同投影→找出"谁漏看什么"）。`mode:distortion`。

mock 86–89 验证：Federation packet 只交换 observationClaim 不交换 Identity/Memory/Dream / Temporal 不泄漏人格（报 visible/version） / Validation history append-only（observed→rejected） / 跨 Observer distortion（同一 Reality 找 distortion）。
