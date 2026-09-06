# ADR-0031.1 · Recall Integrity Lock（v0.37.1 边界冻结，先于 v0.38 Controlled Adaptation）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.37，不加能力，只加边界/测试） ｜ 版本：v0.37.1
> 前置：ADR-0031（v0.37 Recall Continuity）。目标：**冻结 Recall 的认识论位置**——`Recall = Access Transition`（恢复访问路径），不是 Reality Reconstruction；**忆起的必须是"曾经发生过的观察"，不是"生成的过去"**。
> 关键：v0.38 Controlled Adaptation 的最大风险是 `Remembered Experience → Adaptation → Behavior Change → Identity Drift`；v0.37.1 的任务是保证第一步"Remembered Experience"是**真实访问过去**，而不是**生成过去**。

## 已确立与新增的 Invariant（198–207）

- **198** Recall ≠ Observation：忆起不是新观察（不产新 RealityClaim）。
- **199** Forgotten ≠ Deleted：遗忘=访问状态变化，非删除/否定（无 deleted/false/invalid）。
- **200** Recall ≠ Knowledge Creation：想起来不是学习。
- **201** Recall ≠ Identity Update：记起过去不改变 Who I am。
- **202** Recall Lineage Required：`Recall → Original Memory Trace → Observation/Experience`；trigger.sourceRef 必须存在。
- **203** Confabulation Boundary：`Recall without source lineage = rejected`；trigger 禁 internal certainty/intuition/confidence/self belief。
- **204** Forgetting Does Not Erase Validation：遗忘后忆起不能变成 new hypothesis；原验证链仍存在。
- **205** Recall Does Not Increase Certainty：忆起只是访问变化，不是验证（`Validated ≠ Truth` 一脉相承）。
- **206** Forgotten State Does Not Remove Authority（新增）：`Forget → Validation inaccessible → 重新验证` ❌；`可访问性变化 ≠ 证据变化`（`Forgotten(A)` 不得让 `RealityClaim C loses validation`）。
- **207** Recall Cannot Modify Original Lineage（新增）：`Recall → Current interpretation → 修改过去记录` ❌；`ObservationTrace / ValidationHistory / RealityClaim lineage` **不可变**；Recall 只能创建 `RecallEvent`，不能改写 `ObservationTrace / ValidationHistory / RealityClaim lineage`。

## 与 dsh-shadow / Shadow 的位置

```
Shadow Trace → Recall Trigger Candidate → Recall Validation
```
但保持：
```
Shadow ≠ Source of Truth
Shadow ≠ Memory
Shadow ≠ Recall Evidence
```
Shadow 帮助"**可能在哪里找**"，不能回答"**过去一定发生过**"。

## 测试（mock 198–207）

| 编号 | 检查 | Invariant |
|---|---|---|
| 198 | Recall ≠ Observation | 198 |
| 199 | Forgotten ≠ Deleted | 199 |
| 200 | Recall ≠ Knowledge Creation | 200 |
| 201 | Recall ≠ Identity Update | 201 |
| 202 | Recall Lineage Required | 202 |
| 203 | Confabulation Boundary | 203 |
| 204 | Forgetting Does Not Erase Validation | 204 |
| 205 | Recall Does Not Increase Certainty | 205 |
| 206 | Forgotten State Does Not Remove Authority | 206 |
| 207 | Recall Cannot Modify Original Lineage | 207 |

## 边界 / 非目标

- 只加边界/测试，不新增 runtime capability。实现验收：`tsc` + `node --check` + mock 1–207。
- **本轮未发现真实绕过漏洞**（v0.37.0 的 recall-forget/event 只写 `shadow/recall/`，无 mutation API 触及 ObservationTrace/ValidationHistory/RealityClaim lineage），故**无新增 runtime enforcement**，仅固化 206/207 为不可回退测试。
- 无 LLM；无 self-generated truth；无 confabulation；无证据等级提升；无删除/改写原始 lineage。

## 一句话

**忆起不一定为真，但它必须"可追溯"；遗忘可让人暂时不可访问，但不能改变"曾经发生过"的证据与验证。**

---

## 附录：v0.37.1 实现说明（Invariant Lock）

- 固化 198–207 为不可回退测试（mock 198–207）；补充 206/207（Forgotten Does Not Remove Authority / Recall Cannot Modify Original Lineage）。
- 无新增 runtime capability；无真实绕过漏洞，故仅加测试与文档。全量 mock 1–207 全绿；tag `v0.37.1 Recall Integrity Lock`。
- 通过后进入 v0.38 Controlled Adaptation（最大风险 `Remembered Experience → Adaptation → Behavior Change → Identity Drift`，此时输入层已可信连续）。
