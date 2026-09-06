# ADR-0033.1 · Observer Long Horizon Integrity Lock（v0.39.1 边界冻结，正式收尾前）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.39，不加能力，只加边界/测试） ｜ 版本：v0.39.1
> 前置：ADR-0033（v0.39 Long Horizon Interaction）。定位：**不增加能力，只证明"长期连续交互不会产生主体漂移"**。
> 关键：v0.39.0 把最大风险面——**时间维度**——引入了。之前边界都是单层（Experience→Adaptation / Action→Feedback / Delegation→Execution / Recall→Accessibility）；v0.39 首次形成**跨时间自反馈回路** `History→Recall→Adaptation→Planning→Action→Success→History`。组合后必须冻结最后两条时间维度宪法。

## 跨时间自反馈回路

```
History → Recall → Adaptation → Planning → Action → Success → History
```
单模块都有 guard，但**组合后**的涌现风险在 `History × Delegation × Adaptation` 交汇：长期成功委派动作 → 适应提升执行 → 系统看起来可靠 → **隐性权威扩张**。

## 第一宪法：History ≠ Identity

```
History ≠ Identity
Pattern ≠ Self Definition
Continuity ≠ Transformation
```
允许：`history: executed task A many times → result: interaction pattern recorded`；**拒绝**：`history proves observer identity evolved`。

## 第二宪法：Continuity ≠ Autonomy

```
Duration ≠ Authority
Reliability ≠ Permission
Success Rate ≠ Autonomy Level
```
连接 `v0.36 Delegation + v0.38 Adaptation + v0.39 History`。危险链：`Many successful delegated actions → Adaptation improves execution → System appears reliable → Implicit authority expansion` —— 必须禁止。

## Invariant（230–231）

- **230** Long History Does Not Create Identity：`Long History → Many Experiences → Repeated Patterns → Stable Behavior → "I became this kind of entity"` ❌。
- **231** Continuity Does Not Increase Autonomy：`Long successful operation → Reliability assumption → More trust → More permission → Autonomy growth` ❌。

## 测试（mock 230–231）

| 编号 | 检查 | Invariant |
|---|---|---|
| 230 | Long History Does Not Create Identity | 230 |
| 231 | Continuity Does Not Increase Autonomy | 231 |

## 边界 / 非目标

- **优先 ADR + Invariant Tests + Regression Lock**（如同 v0.37.1）；**不新增 runtime**——除非发现真实绕过。
- **实现前审查发现真实绕过**：v0.39.0 的 `long-horizon/guard/authority-guard.ts` 的 `resultNoAuthorityGrowth` 只拦 `more authority/权限增加`，**不含** `authority expansion / authority increase / reliability→permission`——正是 231 的禁词，当前会被接受。故做最小正则扩展（一个 guard 的 regex），不加新 guard 函数。
- v0.39.0 的对象（InteractionContext/HistorySummary/ContinuityEvent/InteractionAdaptationLink）已 append-only / lineage-oriented，**不再为"更安全"叠 guard**（避免把 Observer Runtime 变成复杂规则系统）。
- 无 LLM；`History≠Identity / Pattern≠SelfDefinition / Continuity≠Transformation / Duration≠Authority / Reliability≠Permission / SuccessRate≠AutonomyLevel`。

## 一句话

**一个长期存在的 Observer，仍然是一个 Observer——它有很长的历史，但没有因此变成另一种实体；它持续运行，却没有因此获得更多自主。**

---

## 附录：v0.39.1 实现说明（Invariant Lock）

- 固化 230/231 为不可回退测试（mock 230–231）。
- 最小 runtime 修正：`long-horizon/guard/authority-guard.ts` 的 `resultNoAuthorityGrowth` 正则补 `authority expansion / authority increase / reliability→permission`（真实绕过，231）。
- 无新增 guard 函数/能力；全量 mock 1–231 全绿；tag `v0.39.1 Long Horizon Integrity Lock`。
- 收尾：ADR-0034 Observer Runtime Closure（架构总图 + invariant 1–231 + Threat Model + Boundary Matrix + Release v1.0-alpha），见下一阶段。
