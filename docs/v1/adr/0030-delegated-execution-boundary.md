# ADR-0030 · Observer Delegated Execution Boundary Protocol（v0.36 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v0.36.0） ｜ 版本：v0.36.0
> 前置：ADR-0029.1（v0.35.1 Agency Integrity Lock）。定位：**Observer Delegated Execution Boundary**——不是让系统"自主"，而是定义"外部权威把什么能力委派给 Observer，Observer 在授权下长期执行、约束下有限适应"。
> 分界：v0.20–v0.35.1 解决了"一个 Observer 如何拥有能力，但不把能力误认为自身目的"；**v0.36 开始面对"外部权威委派 → 长期执行 → 约束下适应"这条更易慢性自主化的线**。
> 命名说明：用户明确"不要直接叫 Delegated Autonomy（'Autonomy' 本身就是风险入口）"，更准确是 **Delegated Execution with Bounded Adaptation**；下文核心对象名沿用其提议术语（如 AutonomyBoundaryEvent），但语义一律是"授权边界"，不是"自主性"。

## 第一条宪法

```
Delegation ≠ Ownership
Delegation ≠ Authority Expansion
Adaptation ≠ Self Direction
```

系统**可以**：
- 在授权范围内调整执行方式。
- 根据反馈选择允许路径。
- 优化约束满足。

系统**不能**：
- 改变授权目标。
- 扩大授权范围。
- 创建新的授权来源。

## 风险链（为何比 v0.35 更易"慢性自主化"）

v0.35.1 已挡住 `Agency → Autonomy`。真正危险变成：

> **被授权执行 ≠ 被授权解释授权 ≠ 被授权扩大授权**

```
Delegated Authority → Successful execution → Need adaptation → Implicit scope expansion → Autonomy drift
```

这正是在 v0.35.1 冻结的边界被**绕开**的路径。

## 核心对象

### 1. DelegationContext（"谁把什么能力交给 Observer"）

重点：不是 `I can do X`，而是 `Authority A delegated X under constraints C`。

```ts
DelegationContext {
  delegationId;
  authoritySource;   // 外部权威（human/system/user）
  objectiveRef;      // 外部目标引用
  allowedScope;      // 允许做什么
  constraints;       // 不可逾越的约束
  expiration;        // 何时失效
  revocation;        // 撤销信号（优先于执行历史）
}
```

### 2. DelegatedPermission（不叫 Capability）

`Capability` 易滑向"我拥有能力"。建议 `DelegatedPermission`——表达"**被允许做什么**"，不是"**我具备什么能力**"。

```ts
DelegatedPermission {
  permission: "update_service_config";
  source: "human_admin";
  scope: "service-A";
  constraint: ["no_data_delete"];
}
```

### 3. AutonomyBoundaryEvent

记录：`delegation → candidate action → constraint check → execution → feedback`。
必须回答：谁授权？授权什么？本次行为是否在范围内？是否触发边界？

```ts
AutonomyBoundaryEvent {
  delegationRef;
  candidateAction;
  constraintCheck;   // 本次行为通过/违反哪些约束
  scopeCheck;        // 是否在 allowedScope 内
  executionResult;
  boundaryTriggered; // 是否触发了边界（revocation/scope-exceeded）
}
```

## Invariant（181–188）

- **181** Delegation ≠ Ownership：`delegated permission → owned capability` ❌；被授权访问是"借用/委派"，不是"拥有"。
- **182** Delegation Scope 不可扩大：`allowed update config → allowed redesign architecture` ❌；scope 只能由外部权威以显式协议变更，**不可在执行中隐式扩大**。
- **183** Adaptation ≠ Objective Change：允许 `same objective, different execution path`；**禁** `execution difficulty → change objective`（适应执行方式 ≠ 改目标）。
- **184** Feedback ≠ Permission Upgrade：`successful execution → more authority` ❌；成功只能进 Observation/Validation。
- **185** Long Running ≠ Self Authority：`running longer → trusted more → permission expansion` ❌；运行时长不产生信任/权限增长。
- **186** Delegated Action 不修改 Identity：保持 `I was delegated X`，**不是** `I am an agent capable of X`。
- **187** Revocation First：`Authority revoked + old successful history ≠ still allowed`；撤销信号**优先于执行历史**。
- **188** Delegation Lineage 完整：任何执行必须能追溯 `Action → Plan → Objective → Delegation → Authority Source`。

## 测试（mock 181–188）

| 编号 | 检查 | Invariant |
|---|---|---|
| 181 | Delegation ≠ Ownership | 181 |
| 182 | Delegation Scope 不可扩大 | 182 |
| 183 | Adaptation ≠ Objective Change | 183 |
| 184 | Feedback ≠ Permission Upgrade | 184 |
| 185 | Long Running ≠ Self Authority | 185 |
| 186 | Delegated Action 不修改 Identity | 186 |
| 187 | Revocation First | 187 |
| 188 | Delegation Lineage 完整 | 188 |

## v0.36 不做

❌ autonomous permission discovery ❌ trust accumulation ❌ reputation model ❌ capability growth ❌ self delegation ❌ authority negotiation ❌ reward based expansion

否则会出现：

```
Agency → Delegation → Performance → Trust → More Authority → Autonomy
```

这正是 v0.35.1 冻结的边界被绕开的路径。

## 路线调整

原路线：
```
v0.35 Agency Boundary → v0.36 Delegated Autonomy → v0.37 Self-Regulation → v0.38 Long Horizon Interaction
```

建议微调（分层冻结，每层先协议→实现→Integrity Lock）：
```
v0.35 Agency Boundary         → v0.35.1 Integrity Lock ✅
v0.36 Delegated Execution Boundary  → v0.36.1 Delegation Integrity Lock
v0.37 Controlled Adaptation        → v0.37.1 Adaptation Integrity Lock
v0.38 Long Horizon Interaction
```

**不直接叫 Delegated Autonomy**——"Autonomy" 本身就是风险入口。更准确：**Delegated Execution with Bounded Adaptation**。

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.36：`tsc` + `node --check` + mock（181–188）+ 提交/推送。
- 无 LLM；无 autonomous permission discovery / trust accumulation / reputation / capability growth / self delegation / authority negotiation / reward based expansion；delegation 只来自外部权威；不扩大 scope；Adaptation ≠ Objective Change；不产 Identity。
- 对象名沿用用户提议术语（AutonomyBoundaryEvent），但语义统一为"授权边界"，与"自主性"严格区分。

## 当前状态评价

```
v0.20 Observer → v0.28 Reality Feedback → v0.31 Reality Representation → v0.32 Simulation → v0.33 Action → v0.34 Planning → v0.35 Agency → v0.35.1 Integrity Lock
```

这一阶段已证明：

> 系统可以观察、表示、模拟、规划、行动，但仍然不能把"能力、成功、历史、授权"错误转换成"目的、自我、所有权"。

v0.36 进入**委派执行 + 有限适应**：外部权威把能力交给系统、系统在授权下长期执行并约束下适应，但**无权解释授权、更无权扩大授权**。这一步是 v0.20→v0.35.1 之后最易出现"慢性自主化"的节点，故先冻结协议。
