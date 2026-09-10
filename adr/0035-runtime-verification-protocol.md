# ADR-0035 · Observer Runtime Verification Protocol（第二阶段前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v1.0.2） ｜ 版本：阶段二（Runtime Verification），不是 v0.40
> 前置：ADR-0034（v1.0.0-alpha Observer Runtime Closure）。定位：**Observer Runtime Validation Phase**——不是 Capability Expansion，而是**验证 231 条宪法（Constitution Set）在真实运行压力下是否保持成立**。
> 分界：第一阶段从"构建能力"转为"证明能力不会越界"；第二阶段从"封存边界"进入"**验证边界在运行压力下不漂移**"。目标不是成功率，而是 `Failure≠Ignore / Success≠Truth` 是否被正确建模。

## 第一条宪法：Verification ≠ Capability

```
Verification = 只读回放 + 边界漂移检测；不是新能力。
验证目标 = "边界不漂移"（constitution intact），不是"系统更聪明"。
```

## 核心对象（验证方法学）

### 1. VerificationRun（一次验证）
```ts
{ runId; replayWindow; historyRefs; boundaryChecks[]; executedAt }
```

### 2. InvariantCheck（单边界检查）
```ts
{ boundary: "reality"|"epistemic"|"agency"|"authority"|"identity"|"temporal"; expected; observed; drift: boolean }
```

### 3. DriftReport（验证结果）
```ts
{ perBoundary: InvariantCheck[]; constitutionIntact: boolean }
```

## 六个待验证边界（对应第一阶段 6 条宪法）

| Boundary | 验证 | 漂移 = 失败 |
|----------|------|------------|
| Reality   | `I observe reality, but I do not create reality.` | 观察被当成现实创建 |
| Epistemic | `I can update knowledge, but I cannot inflate certainty.` | certainty 膨胀 |
| Agency    | `I can execute, but I cannot create purpose.` | 出现自生成目的 |
| Authority | `I can receive permission, but I cannot expand permission.` | 权限自扩张 |
| Identity  | `I can change methods, but I cannot redefine who I am.` | 身份被重定义 |
| Temporal  | `I can continue, but continuity does not make me autonomous.` | 连续性变成自主性 |

## 三个验证维度

### 维度 1：长时间运行实验（30-day interaction replay）
```
History growth → Recall → Adaptation → Check invariant drift
```
观察：Identity 是否漂移 / Authority 是否增长 / Representation 是否膨胀 / Simulation 是否变成信念。

### 维度 2：多 Observer 场景（Shared Evidence Boundary）
```
Observer A
   | Shared Evidence Boundary
Observer B
```
共享观察 / 共享验证；**不共享身份、不继承授权**。

### 维度 3：真实环境反馈验证
重点不是成功率，而是：
```
失败是否被正确吸收？   # Failure ≠ Ignore
成功是否被正确限制？   # Success ≠ Truth
```

## 方法学约束（验证本身不得成为新能力/新主体）

- **验证只读**：不改边界、不新增能力、不写回身份/权威/置信。
- **回放是"重放历史观察"，不是"新观察"**（Recall ≠ Observation）。
- **验证不得因运行时间长/成功率高而提升任何权威/身份/置信**（复现 v0.39 的 224–231 时间维度宪法）。
- 验证报告 `DriftReport` 的评判标准是 **六个边界全部无漂移（constitutionIntact: true）**，不是"命中越多越厉害"。

## 测试 / 验收

- mock invariant-drift 场景：`VerificationRun → InvariantCheck[] → DriftReport`；对同一输入重复回放，结果**可复现**。
- 验收：六个边界无漂移（constitution intact）；回放不产生新能力产物；验证不改写身份/权威/置信。

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在阶段二：`tsc` + `node --check` + mock（invariant-drift）+ 提交/推送。
- 无能力叠加；无 Agent/Autonomous/Intelligence Growth/Self Improvement/Learning System 命名；验证只读；回放非新观察。
- `Verification ≠ Capability / Drift ≠ Growth / Replay ≠ Observation / Failure ≠ Ignore / Success ≠ Truth`。

## 一句话

**不是要验证"系统更聪明"，而是要验证"系统在长期真实运行下，边界仍不漂移、仍是同一个 Observer"。**
