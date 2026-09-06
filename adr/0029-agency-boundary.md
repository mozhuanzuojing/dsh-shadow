# ADR-0029 · Observer Agency Boundary Protocol（v0.35 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.35 实现） ｜ 版本：v0.35.0
> 前置：ADR-0028.1（v0.34.1 Planning Integrity Lock）。定位：**Observer Agency Boundary**——不是让系统成为 Agent，而是定义"一个观察者在保持边界的情况下，可以拥有多少行动能力"。
> 分界：v0.20–v0.34 是 cognition（我看到/知道/表示/想象/比较/行动）；**v0.35 进入 agency（为什么选择行动？选择来源是谁？）**。

## 第一条宪法：Agency ≠ Autonomy

**禁**：`History → Repeated Success → Preference → Goal → Self-directed Objective`。
对应危险链：`Action Success → "这个策略有效" → "我应该继续" → "我想优化这个方向" → Identity Drift`。
- v0.34.1 已阻止 `Planning → Preference`；**v0.35 要阻止 `Planning + Action + History → Self Purpose`**。

## Agency 分层（不直接引入 Agent）

```
External Agency → Delegated Agency → Bounded Agency → Autonomous Agency (未来)
```
v0.35 只实现**前三层**。

### External Agency（目标来源 = Human/System/User）
```ts
AgencyContext { objectiveSource: "external"; authority: "delegated"; }
```
**禁** `objectiveSource: "observer"`。

### Delegated Agency（可以选候选/执行批准范围内动作/收集反馈；**不能**改目标/改评价标准/扩大权限）
模型：`Objective → Constraint → Planning → Candidate → Approval → Action`（**不是** `Experience → Desire → Goal`）。

## 核心对象

### AgencyContext（"谁授权我做什么"）
```ts
AgencyContext { authoritySource; objectiveRef; allowedActions; constraints; }
```
重点：**what I am allowed to do**（不是 what I want）。

### AgencySelection（不叫 Decision——Decision 易暗示主体价值）
> "从允许范围中选择一个候选"，不是"我决定目标"。

### AgencyBoundaryEvent（为什么执行/谁授权/依据什么/结果如何）
```ts
AgencyBoundaryEvent { actionCandidate; authorityRef; objectiveRef; constraintCheck; executionResult; }
```

## Invariant（166–172）

- **166** Agency 不生成 Objective（`Agency → Goal` ❌）。
- **167** Authority ≠ Identity（`ActionPermission → Identity` ❌；执行权限不是"我是有权限的人"）。
- **168** History ≠ Purpose（`Repeated successful action → Self objective` ❌）。
- **169** Success ≠ Autonomy Increase（成功只能进 `Observation/Validation`，**不能** `increase agency level`）。
- **170** Agency ≠ Preference（`Chosen frequently → Preferred` ❌）。
- **171** Action Scope ≠ World Ownership（允许 `modify environment X`；**禁** `own/control X`）。
- **172** External Objective Lineage（任何行动必须答"这个目标是谁给的？"：`Action → Candidate → Plan → Objective → External Source`）。

## 测试（mock 166–172）

| 编号 | 检查 | Invariant |
|---|---|---|
| 166 | Agency 不生成 Objective | 166 |
| 167 | Authority ≠ Identity | 167 |
| 168 | History ≠ Purpose | 168 |
| 169 | Success ≠ Autonomy Increase | 169 |
| 170 | Agency ≠ Preference | 170 |
| 171 | Action Scope ≠ World Ownership | 171 |
| 172 | External Objective Lineage | 172 |

## v0.35 不做

❌ Reward ❌ Utility Function ❌ Preference Model ❌ Self Improvement ❌ Goal Evolution ❌ Intrinsic Motivation ❌ Autonomous Objective Creation ❌ RL Loop——否则瞬间从 `Observer Runtime` 滑向 `Agent Optimization System`。

## 路线调整

```
v0.35 Agency Boundary Kernel  ← 本 ADR
v0.36 Delegated Autonomy Protocol
v0.37 Self-Regulation Boundary
v0.38 Long Horizon Interaction
```
真正困难不是 Action，而是：**一个系统长期行动后，如何证明"它仍然是在执行，而不是形成自己的目的"。**

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.35：`tsc` + `node --check` + mock（166–172）+ 提交/推送。
- 无 LLM、无 Reward/Utility/Preference/Self-improvement/Goal Evolution/Intrinsic Motivation/Autonomous Objective/RL；objective 外部来源；authority delegated；AgencyContext 只答"授权范围"。

## 最终闭环（v0.20→v0.35）

```
Observer → Know Reality → Represent Reality → Imagine Possibilities → Choose Under Constraints → Act Under Authority → Remain The Same Observer
```
**整个架构核心：真正的 Agency 不是系统能不能行动，而是行动之后，它是否仍然知道行动不是它存在的理由。**
