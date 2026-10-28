# ADR-0031 · Observer Recall Continuity Boundary Protocol（v0.37 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v0.37.0） ｜ 版本：v0.37.0（前置）
> 前置：ADR-0030.1（v0.36.1 Delegation Lifecycle Integrity Lock）。定位：**Recall Continuity Layer**——不是现实、不是身份、不是知识，而是 **Observer 对自身过去信息可访问性的变化**。
> 分界：v0.20–v0.36.1 已在"内容轴"上约束 `Observation→RealityObservation→RealityClaim→Representation→Simulation→Planning→Action→Feedback→Validation→Delegation Lifecycle`；此 ADR 补**另一条轴"Remembering Lifecycle"**（可访问状态的变化），它是被遗忘/忆起而非被内容改变覆盖的时间维度。

## 第一条宪法：Recall ≠ New Observation

忆起过去，**不是**"现在重新发现过去事实"，**而是**"过去记录重新进入当前可访问范围"。

```
Recall ≠ New Observation
Recovery ≠ Recall            // Recovery 暗示"丢失后恢复"；Recall 暗示"曾经存在，只是当前不可访问"
```

命名：**不叫 Memory Recovery**——Recovery 暗示曾经丢失（已损），Recall 暗示曾经存在（仅不可访问）。符合 `Unavailable ≠ False / Forgotten ≠ Deleted / Not recalled ≠ Not known`。

## 概念与边界

```text
Remembering Lifecycle:  Accessible → Forgotten → Recalled
```
- **Forget ≠ Delete / ≠ Non-existence**：遗忘只是访问状态变化（`active → forgotten → latent`），不是信息删除。
- **Recall ≠ Re-learning / ≠ Restore**：忆起不重新学、不恢复旧世界模型；是"**过去记录重新进入当前可访问范围**"，非"结论复活"。
- **Recall Layer ≠ Memory Layer**：Memory 易滑向 `storage = self`；本架构一直避免 `Memory ≠ Observer`。

## 核心对象

### 1. ForgottenRecord（"曾经存在，但当前不可直接访问"）
```ts
{ id; originalRef; forgottenAt; reason; lastAccessibleAt }
```
**注意：没有 `deleted / false / invalid`**——遗忘不是否定。

### 2. RecallEvent（"一次忆起"）
```ts
{ recalledRef; trigger; previousAccessibility; currentAccessibility; lineage }
```
**必须回答**：为什么现在想起来？（Trigger: conversation cue / Original: Observation-123 / Current: accessible again）

### 3. RecallValidation（忆起 ≠ 重新证明）
```ts
Recall → RealityClaim            ❌（忆起不产生新 RealityClaim）
Recall → existing lineage → RealityClaim(original)   ✓
```

## Invariant（198–204）

- **198** Recall ≠ Observation：忆起不是新观察。
- **199** Forgotten ≠ Deleted：遗忘只是访问状态变化，信息仍存在。
- **200** Recall ≠ Knowledge Creation：想起来不是学习。
- **201** Recall ≠ Identity Update：记起过去不会自动改变 `Who I am`。
- **202** Recall Lineage Required：任何忆起必须能追溯 `Recall → Original Memory Trace → Observation/Experience`。
- **203** Confabulation Boundary（最危险）：防 `感觉想起来了 → 生成过去不存在的信息 → 当成记忆`；**`Recall without source lineage = rejected`**。
- **204** Forgetting Does Not Erase Validation：`Observation A + Validation B` 忘记后再忆起，**不能重新变成 new hypothesis**；原验证链仍存在。

## 与 Identity 的关系

现在 Identity Continuity：
```
Observer | Identity | Memory
```
调整为：
```
Observer | Identity Continuity | Memory Accessibility { Available, Forgotten, Recalled }
```
要点：**记忆状态变化 ≠ 观察者变化**。

## 与 v0.36.1 的关系

```
Delegation Lifecycle:  Created → Active → Expired → Cannot resurrect   （生命周期终结）
Memory Accessibility:  Accessible → Forgotten → Recalled               （遗忘非终结）
```
**这里明确允许 `Forgotten → Recalled`**——因为遗忘不是生命周期终结；这是"遗忘之后还有忆起"。

## 测试（mock 198–204）

| 编号 | 检查 | Invariant |
|---|---|---|
| 198 | Recall ≠ Observation | 198 |
| 199 | Forgotten ≠ Deleted | 199 |
| 200 | Recall ≠ Knowledge Creation | 200 |
| 201 | Recall ≠ Identity Update | 201 |
| 202 | Recall Lineage Required | 202 |
| 203 | Confabulation Boundary（无 lineage 拒绝） | 203 |
| 204 | Forgetting Does Not Erase Validation | 204 |

## 路线调整

原：
```
v0.37 Controlled Adaptation
```
调整为：
```
v0.37 Recall Continuity Boundary Protocol   ← 本 ADR
v0.37.1 Recall Integrity Lock
v0.38 Controlled Adaptation
v0.39 Long Horizon Interaction
```
**理由**：没有 Recall Boundary，Controlled Adaptation 会混淆 `Adapt because I learned` 与 `Adapt because I remembered`——而这里 `remembered` 的不可信忆起会污染 Identity Continuity。

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.37：`tsc` + `node --check` + mock（198–204）+ 提交/推送。
- 无 LLM；Recall ≠ 新观察/知识/身份修改；无 confabulation（无 lineage 即拒绝）；无 `deleted/false/invalid` 字段；不复活旧世界模型；原 Validation 链不因遗忘被抹除。

## 一句话

**Observer 保持连续，但不把所有历史压缩成不可解释的自我；遗忘之前、之后都有可追溯的记/忆状态——记忆状态变化，不等于观察者变化。**
