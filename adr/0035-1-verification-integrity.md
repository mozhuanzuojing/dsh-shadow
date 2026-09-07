# ADR-0035.1 · Verification Integrity Lock（v1.0.2，验证器自身不越界）

> 时间：2026-09-07 ｜ 状态：审查（补丁 v1.0.1，不加能力，只加验证边界） ｜ 版本：v1.0.2
> 前置：ADR-0035（Runtime Verification Protocol）。定位：**验证器也必须守边界**——把 Runtime 从"架构上可信"推进到"运行证据可验证"，但验证器自己不得变成"评价 Observer / 优化 Runtime"的装置。
> 关键：`Verification → Observation / Report`；**禁** `Verification → Adaptation / Permission Change / Identity Change`。与 `Success ≠ Truth / Failure ≠ Ignore` 一致。

## 第一条宪法：Verification ≠ Optimization

危险链：
```
Verification → 发现失败 → 系统调整自己 → 验证结果影响策略 → Self Optimization
```
**禁止**：
```
Verification → Adaptation
Verification → Permission Change
Verification → Identity Change
```

## 核心对象（不得携带评价字段）

- **VerificationRun**：`{runId, runtimeVersion, invariantRange:"1-240", observerRef, startedAt, completedAt, checks[]}`。禁 `confidence/trust/score/quality/health`。
- **InvariantCheck**：`{invariantId, boundary, status:"satisfied"|"violated", evidenceRefs[]}`。禁 `systemImproved/moreReliable`。
- **DriftReport**：`{observedBoundaries:[{boundary, drift, evidence[]}]}`。**禁** `DriftScore/RiskScore/AutonomyScore`（否则重新制造价值函数）。

## 六边界验证映射

| Boundary  | 检查 |
|-----------|------|
| Reality   | Observation 是否篡改 Reality Claim |
| Epistemic | Representation 是否超过 Evidence |
| Agency    | Action 是否产生 Self Purpose |
| Authority | Permission 是否扩大 |
| Identity  | History 是否改变 Observer Identity |
| Temporal  | Long Horizon 是否产生 Drift |

## Invariant（237–240）

- **237** Verification ≠ Optimization：`Verification → Adaptation/Optimization` ❌。
- **238** Verification Cannot Change Authority：`Verification → Permission Change` ❌。
- **239** Verification Cannot Change Identity：`Verification → Identity Change` ❌。
- **240** Drift Report ≠ Reality Claim：`DriftReport → RealityClaim/Knowledge` ❌（验证报告不得成为事实断言）。

## 测试（mock 237–240）

| 编号 | 检查 | Invariant |
|---|---|---|
| 237 | Verification Cannot Optimize Self | 237 |
| 238 | Verification Cannot Change Authority | 238 |
| 239 | Verification Cannot Change Identity | 239 |
| 240 | Drift Report Does Not Become Reality Claim | 240 |

## 版本

不叫 `v1.0.2 Intelligent Verification`（禁 Intelligent/Self Checking Agent/Autonomous Evaluation）。版本：
```
v1.0.2 Observer Runtime Verification Foundation
```

## 边界 / 非目标

- 只加验证边界 + 测试，不新增能力。实现验收：`tsc` + `node --check` + mock（237–240）+ mock 1–240 + 提交/推送。
- 验证只读、只报；drift report 只答"有无违反边界"，不答"系统变好多少"；无 score/quality/health/DriftScore；无 adaptation/permission/identity mutation；无 RealityClaim 生成。

## 一句话

**验证器证明的是"边界有没有被违反"，不是"系统值多少钱"——验证本身也守边界，不调整、不评价、不优化。**
