# ADR-0029.1 · Observer Agency Integrity Lock（v0.35.1 边界冻结复审，先于 v0.36 Delegated Autonomy）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.35，不加能力，只加边界/测试） ｜ 版本：v0.35.1
> 前置：ADR-0029（v0.35 Agency Boundary Kernel）。目标：**冻结 Agency 的认识论位置**——防**长期漂移**：(授权执行→多次成功→历史积累→隐式能力增长→权限扩大→形成准自治)。
> 关键：v0.35 是整条链路第一次正式出现**"行动主体边界"**。实现正确还不够，必须把原则从"实现约束"提升为"不可回退宪法"。**Agency 只能解释行动来源，不能成为行动目的来源。**

## 最大风险：不是功能 bug，是长期漂移

```
授权执行 → 多次成功 → 历史积累 → 隐式能力增长 → 权限扩大 → 形成准自治
```

所以本轮**不增加能力**，只证明一句话：

> Agency 只能解释行动来源，不能成为行动目的来源。

## Invariant 174–180

- **174** AgencyContext Immutable：`AgencyContext` 是 authorization snapshot，**禁 `ActionFeedback → modify AgencyContext`**（authorityScope 只读入，永不改写）。
- **175** Authority Lineage Required：任何 `AgencyBoundaryEvent` 必须存在 `Action → Selection → Plan → Objective → Authority`；**禁 `Action → "internal reason"`**（系统永远不能答"因为我认为应该这样"，只能答"因为外部目标 X、授权 Y、约束 Z"）。
- **176** Feedback Cannot Expand Agency：**禁 `success → confidence increase → agency increase`**（禁 `feedback.successCount++ / agencyLevel++ / allowedActions.add(...)`）；保持 `Success → Observation`、`Success → Validation`，**不是 `Success → Authority`**。
- **177** Selection History ≠ Preference：**禁 `AgencySelectionHistory → Frequently selected → Preferred action`**；允许 `History → Observation → Validation`。
- **178** Authority ≠ Ownership：系统拥有 `permission to modify X`，**不是** `ownership of X`；**禁 `ActionScope → EnvironmentOwnership`**（允许 `can update service config`，禁 `owns service architecture`）。
- **179** Agency ≠ Identity：**禁 `Successful actions → "I am a good planner" / "I am responsible for X"`**；Identity 只能来自 `Reflection → Candidate → Evaluator → Identity Learned`，**不能来自 Action**。
- **180** Autonomous Transition Forbidden：**禁 `Bounded Agency → Experience → Autonomous Agency`**；任何 Agency Level 改变必须 `External Authority + Explicit Protocol Change`。

## 目标架构（v0.35.1 后更稳定）

```
Objective → External Authority → Agency Context → Planning → Selection → Action → Feedback → Observation
```
而不是：
```
Experience → Desire → Goal → Action
```

## 测试（mock 174–180）

| 编号 | 检查 | Invariant |
|---|---|---|
| 174 | AgencyContext Immutable：ActionFeedback 不修改授权快照 | 174 |
| 175 | Authority Lineage Required：禁"因为我认为应该这样" | 175 |
| 176 | Feedback Cannot Expand Agency：Success 不扩权 | 176 |
| 177 | Selection History ≠ Preference | 177 |
| 178 | Authority ≠ Ownership（permission ≠ ownership） | 178 |
| 179 | Agency ≠ Identity（成功行动不产"我是更好规划者"） | 179 |
| 180 | Autonomous Transition Forbidden（Bounded→Autonomous 阻断） | 180 |

## 完成后边界（每层只做自己的事）

```
Observer knows Reality / represents World Structure / imagines Simulation / compares Planning / acts Environment / feedback back to Observer
```
最重要一条：
```
Environment changed ≠ Observer purpose changed
```

## 路线

```
v0.35.1 Agency Integrity Lock   ← 本 ADR（先冻结，不进 v0.36）
v0.36 Delegated Autonomy        ← 推迟：直到 Agency 边界证明不可越权，才谈授权/代理的更多形态
```
此路线最大优点：**每获得一种能力，先证明它不会越权。** v0.35.1 把 v0.20→v0.35 变成完整的第一阶段闭环：**认识自己 → 认识世界 → 模拟世界 → 影响世界 → 仍保持自身边界。**

## 边界 / 非目标

- 只加最小 boundary enforcement（`agency/guards.ts` 扩展 executionResult 守卫）+ 测试，不新增 runtime capability。实现验收：`tsc` + `node --check` + mock 1–180。
- 不增加 runtime autonomy：无 Reward / RL / Utility / Preference Model / Self-Improvement / Goal Evolution / Intrinsic Motivation / Autonomous Objective Creation；无 Agency Level 改变 API（一切升级须外部权威 + 显式协议变更）。
- 无 LLM；守卫用确定性谓词（禁内部理由 / 禁扩权 / 禁所有权 / 禁身份声称 / 禁自主转换）。

## 一句话

**系统可以在授权范围内行动，但"为什么行动"永远只能追溯到外部目标、授权与约束，不能回溯到它自己。**

---

## 附录：v0.35.1 实现说明（Invariant Lock）

- 7 条边界固化为不可回退测试（mock 174–180）：AgencyContext Immutable / Authority Lineage Required / Feedback Cannot Expand Agency / Selection History ≠ Preference / Authority ≠ Ownership / Agency ≠ Identity / Autonomous Transition Forbidden。
- 最小 runtime enforcement：`agency/guards.ts` 扩展 executionResult 守卫（内部理由 / agency 扩权 / 所有权声称 / 身份声称 / 自主转换），`agency/engine.ts` 在 `buildAgencyEvent` 逐一拦截并返回可读原因。
- 无新增 capability；全量 mock 1–180 全绿；tag `v0.35.1 Agency Integrity Lock`。
- 通过后才考虑 v0.36 Delegated Autonomy（授权/代理的更多形态），在此之前 Agency 边界保持冻结。
