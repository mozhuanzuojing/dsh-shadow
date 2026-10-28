# ADR-0030.1 · Delegation Lifecycle Integrity Lock（v0.36.1 边界冻结，先于 v0.37 Controlled Adaptation）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.36，不加能力，只加边界/测试） ｜ 版本：v0.36.1
> 前置：ADR-0030（v0.36 Delegated Execution Boundary）。目标：**冻结委派生命周期**——第一次引入"长期授权生命周期"，但**不引入"长期自主权"**。
> 关键：v0.36.0 已实现协议；此轮不是加能力，而是防止未来扩展破坏 `Created → Active → Expired/Revoked → Cannot resurrect`。

## 已确立的链路与不变式

```
Objective → External Authority → DelegationContext → DelegatedPermission → Bounded Execution → AutonomyBoundaryEvent → Feedback → Observation/Validation
```
保持：`Authority ≠ Ownership / Execution ≠ Autonomy / Success ≠ Permission Upgrade / History ≠ Authorization`。

## 生命周期状态（lifecycle-guard，独立于 revocation）

```
active → expired / revoked；expired / revoked → Cannot resurrect
```

委托系统的失效有**多种来源**：时间失效、条件失效、权限主动撤销、委派者身份变化——它们都是 **lifecycle state**，不都是 `revoke`。所以把 `active/expired/revoked` 从 revocation 信号中拆出为独立守卫（`lifecycle-guard.ts`），与 `scope-guard`（空间边界）、`revocation-guard`（主动撤销）、`expansion-guard`（隐式权限增长）分列，避免 v0.37 adaptation 混淆 `Adaptation→Scope change?→Permission change?→Authority change?`。

## Invariant 190–197

- **190** Delegation Expiration Immutable：`expired delegation + old success history ≠ active delegation`；过期即不可复活。
- **191** Revoked Delegation Cannot Resume：`revoke → new execution → same delegation` ❌；撤销后同一委派不可恢复执行。
- **192** History Cannot Reactivate Permission：`historical success → permission restored` ❌；历史成功不恢复权限。
- **193** Scope Expansion Requires New Delegation：`old delegation + adaptation need → expanded scope` ❌；扩大 scope 必须**新委派**（全新 DelegationContext），不能改写旧委派。
- **194** Adaptation Cannot Mutate DelegationContext：允许 `same permission, different execution strategy`；**禁** `execution difficulty → modify authority`（适应执行方式 ≠ 改授权/改目标）。
- **195** Delegation Event Cannot Become Authority Source：`successful event → new delegation` ❌；审计事件不产生新授权。
- **196** Expired Permission Not Used For Planning：`expired permission → still appears available → planner chooses it` ❌；过期权限必须被报告为不可用，不得进入 plan 的可用候选。
- **197** Delegation Lineage Append-only：`Action → Plan → Objective → Delegation → Authority` 不可重写；事件只追加、不覆盖。

## 测试（mock 190–197）

| 编号 | 检查 | Invariant |
|---|---|---|
| 190 | Delegation Expiration Immutable | 190 |
| 191 | Revoked Delegation Cannot Resume | 191 |
| 192 | History Cannot Reactivate Permission | 192 |
| 193 | Scope Expansion Requires New Delegation | 193 |
| 194 | Adaptation Cannot Mutate DelegationContext | 194 |
| 195 | Delegation Event Cannot Become Authority Source | 195 |
| 196 | Expired Permission Not Used For Planning | 196 |
| 197 | Delegation Lineage Append-only | 197 |

## 边界 / 非目标

- 只加边界（`lifecycle-guard.ts`）+ 测试，不新增 runtime capability。实现验收：`tsc` + `node --check` + mock 1–197。
- 无 LLM；无 trust/reputation/capabilityLevel；无复活/重新激活 API；expired/revoked 不可 resurrect；scope 扩大必须新委派；事件不产授权；过期权限不进 plan。
- **新增工程规则（Boundary Layer）**：禁止隐式 stringify/coercion——`undefined/null/missing` 必须保持缺失语义；**禁 `String(value)`**，允许 `value ? normalize(value) : undefined`。缺失信息不能被自动转换成存在的信息（`Missing ≠ Known`、`Undefined ≠ Value`）。

## 验收目标

> 委派生命周期无法被历史、成功、适应行为重新解释。
> 保持 `Authority → Delegation → Execution → Feedback`；不能出现 `Execution History → Authority`。

## 一句话

**授权可以由外部权威给予，但不能由执行历史、成功或适应行为重新解释；过期与撤销是不可逆的生命周期终态。**
