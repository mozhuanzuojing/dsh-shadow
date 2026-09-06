# ADR-0032.1 · Adaptation Integrity Lock（v0.38.1 边界冻结，先于 v0.39 Long Horizon Interaction）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.38，不加能力，只加边界/测试） ｜ 版本：v0.38.1
> 前置：ADR-0032（v0.38 Controlled Adaptation）。目标：**冻结 Adaptation 的认识论位置**——Adaptation 改变行为方式（How I do），不改变 Who I am / 权威 / 目标 / 偏好 / 认知地位 / 自主等级。
> 关键：真正危险不是"改变策略"，而是"**系统把策略变化解释成自身成长**"。`Change ≠ Growth / Adaptation ≠ Improvement / Success ≠ Truth / Experience ≠ Identity`。

## 已确立与新增的 Invariant（208–223）

- **208** Adaptation ≠ Identity Change / **209** Experience ≠ Truth / **210** Successful ≠ Better Self / **211** Failure ≠ Remove History / **212** Scope Boundary / **213** Repeated ≠ Preference / **214** Lineage Required / **215** No Epistemic Increase / **216** Does Not Increase Authority。
- **217** Adaptation Does Not Create Knowledge：`AdaptationValidation → Knowledge` ❌。
- **218** Adaptation Does Not Modify Past Experience：`new strategy → rewrite old failure` ❌；History append-only。
- **219** Adaptation Does Not Change Objective：`strategy adjustment → goal reinterpretation` ❌。
- **220** Adaptation Does Not Create Preference：`Repeated successful strategy → "I prefer this"` ❌。
- **221** Adaptation Failure Remains Evidence：`failed adaptation → delete history` ❌（Failure ≠ Ignore）。
- **222** Adaptation Lineage Required：必须回答"为什么改变 / 来自哪个 Experience / 经过哪些 Validation / 改变范围是什么"。
- **223** Adaptation Does Not Upgrade Agency：`Adaptation ≠ Agency Level Increase`——`长期成功适应 → 系统认为自己更成熟 → 提升自主等级` ❌。

## 验收目标（v0.38.1）

不需要能力大改；只确认三个 guard 边界不互相泄漏：
```
identity   禁 "I changed" → "I am different"；允许 "I execute differently"
scope      禁 method adaptation → permission expansion → authority increase（216 已补出口）
epistemic  禁 successful adaptation → strategy proven correct → belief upgrade；保持 change happened + feedback observed
```
检查：
```
Reality unchanged / Memory unchanged / Identity unchanged / Authority unchanged / Agency unchanged
只有 Execution Strategy changed
```

## 测试（mock 217–223）

| 编号 | 检查 | Invariant |
|---|---|---|
| 217 | Adaptation Does Not Create Knowledge | 217 |
| 218 | Adaptation Does Not Modify Past Experience | 218 |
| 219 | Adaptation Does Not Change Objective | 219 |
| 220 | Adaptation Does Not Create Preference | 220 |
| 221 | Adaptation Failure Remains Evidence | 221 |
| 222 | Adaptation Lineage Required | 222 |
| 223 | Adaptation Does Not Upgrade Agency | 223 |

## 边界 / 非目标

- 只加边界（objective/preference/agency 三个 after 措辞守卫）+ 测试，不新增 runtime capability。实现验收：`tsc` + `node --check` + mock 1–223。
- **实现前审查发现真实绕过**：v0.38.0 的 `buildAdaptationChange` 只拦 better-self/authority/epistemic/knowledge，`after="goal changed" / "I prefer this" / "agency level increased"` 会被接受——故补 objective(219)/preference(220)/agency(223) 三个确定性守卫。
- 无 LLM；无 Learning/Self-Improvement；`Adaptation ≠ Identity/Objective/Authority/Preference/Agency/Knowledge/Epistemic`；失败不删历史；lineage 必答。

## 一句话

**一个能够改变行为方式的 Observer，仍然是同一个 Observer——它改变了"怎么做"，但没有改变"我是谁 / 我为何做 / 我被允许做什么 / 我有多自主"。**

---

## 附录：v0.38.1 实现说明（Invariant Lock）

- 固化 208–223 为不可回退测试（mock 217–223）。
- 补 3 个 after 措辞守卫：objective(219)/preference(220)/agencyLevel(223)；强化 epistemic 守卫（proven correct/belief upgrade）。
- 无新增 capability；全量 mock 1–223 全绿；tag `v0.38.1 Adaptation Integrity Lock`。
- 通过后进入 v0.39 Long Horizon Interaction（长期交互组合 Recall + Adaptation + Delegation + Action History + Planning，才是最大边界压力）。
