# ADR-0032 · Observer Controlled Adaptation Boundary Protocol（v0.38 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.38 实现） ｜ 版本：v0.38.0（前置）
> 前置：ADR-0031.1（v0.37.1 Recall Integrity Lock）。定位：**Controlled Adaptation Boundary**——**第一次允许 `Experience → Change`**（过去经验改变未来行为方式），是从"保持连续"进入"允许变化"的分界线。
> 分界：此前 Planning 比较路径、Action 执行授权、Recall 恢复过去；**v0.38 是第一个允许"基于现实反馈调整行为"的层**。真正风险：`Experience → Adaptation → Behavior change →『我已经变了』`——变成自我优化 Agent。

## 第一条宪法：Adaptation ≠ Identity Evolution

```
Experience → Adaptation → Strategy adjustment     ✓（改变 How I do）
Experience → Adaptation → Behavior change → "I have become different"   ❌（不改变 Who I am）
```
允许改变：`How I do`；不能改变：`Who I am`。

## 三态分离（不互相污染）

三个**完全不同**的"不可见"状态机：
```
Reality    : 未观察 ≠ 不存在        → Reality Epistemic State → Evidence / Validation
Memory     : 遗忘 ≠ 删除            → Memory Accessibility State → Available → Forgotten → Recalled
Delegation : 过期 ≠ 可恢复          → Authority Lifecycle State → Created → Active → Expired/Revoked
```
**`Accessibility ≠ Epistemic Status`**；分界与 `Validated ≠ Truth / Representation ≤ Evidence` 同属一个认识论原则。三个状态机不能互相污染。

## 核心对象

### 1. AdaptationContext（"为什么允许调整"）
```ts
{ sourceExperience; validationRefs; adaptationScope }
```
必须回答：**调整依据是什么？**

### 2. AdaptationChange（不叫 LearningChange）
Learning 易引入 `I learned therefore I know`。`AdaptationChange` 表示**行为策略变化**，字段保持窄：
```ts
AdaptationChange {
  target: "method" | "strategy" | "execution_pattern";
  before;
  after;
  basedOn: ExperienceRef[];   // lineage（214）
  sourceExperience;           // 来源是 Observation/Experience（209），非 Knowledge
  validationRequired: true;   // 恒 true
  // 明确禁止字段：goal / objective / value / preference / identity / belief / confidenceIncrease
}
```
```
允许：retry interval changed / planning order changed
禁止：my value changed / my objective changed / my identity changed
```

### 3. AdaptationValidation（类似 RecallValidation，弱语义）
记录 `change happened`，**不是** `change was correct`：
```ts
AdaptationValidation { changeObserved: true; validationReferences: []; sideEffectsObserved: [] }
```
**禁** `changeWasCorrect: true`（Correct 已进入价值判断）。

## Invariant（208–216）

- **208** Adaptation ≠ Identity Change：调整行为，不改变 Observer。
- **209** Experience ≠ Truth：经验输入是 `Observation`，不是 `Knowledge`。
- **210** Successful Adaptation ≠ Better Self：`Outcome matched expectation`，**不能** `I improved myself`。
- **211** Failure ≠ Remove Adaptation History：失败也是反馈，不能删除。
- **212** Adaptation Scope Boundary：只能改变 `method / strategy / execution_pattern`；**不能** `objective / authority / identity / value`。
- **213** Repeated Adaptation ≠ Preference：防 `Repeated choice → Preference → Value → Identity`（延续 v0.34）。
- **214** Adaptation Lineage Required：必须 `Adaptation → Experience → Observation → Validation`，可解释。
- **215** Adaptation Cannot Improve Epistemic Status Automatically：`Adaptation success` 不得导致 `confidence↑ / truth↑ / certainty↑`。
- **216** Adaptation Does Not Increase Authority（实现前增补）：`Adaptation ≠ Capability Increase / ≠ Permission Increase / ≠ Authority Increase`——`我调整得更好了 → 所以应该允许我更多 → Authority Expansion` 会绕过 v0.35 Agency 与 v0.36 Delegation，故冻结 `Adaptation → more authority`。

## 命名 / 定位

**不叫 Learning Kernel / Self Improvement**。保持：
```
Controlled Adaptation Boundary Kernel
```
目标不是制造"自我优化 Agent"，而是：**一个能根据现实反馈调整行为、同时保持观察者连续性的系统。**

## 测试（mock 208–216）

| 编号 | 检查 | Invariant |
|---|---|---|
| 208 | Adaptation ≠ Identity Change | 208 |
| 209 | Experience ≠ Truth | 209 |
| 210 | Successful Adaptation ≠ Better Self | 210 |
| 211 | Failure ≠ Remove Adaptation History | 211 |
| 212 | Adaptation Scope Boundary | 212 |
| 213 | Repeated Adaptation ≠ Preference | 213 |
| 214 | Adaptation Lineage Required | 214 |
| 215 | Adaptation Cannot Improve Epistemic Status | 215 |
| 216 | Adaptation Does Not Increase Authority | 216 |

## 路线

```
v0.38 ADR-0032 Controlled Adaptation Boundary Protocol   ← 本 ADR（只协议）
v0.38.0 Controlled Adaptation Kernel
v0.38.1 Adaptation Integrity Lock
v0.39 Long Horizon Interaction
```
持续原则：`Change ≠ Growth / Adaptation ≠ Improvement / Success ≠ Truth / Experience ≠ Identity`。

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.38.0：`tsc` + `node --check` + mock（208–215）+ 提交/推送；v0.38.1 再固化 Integrity Lock。
- 无 LLM；无 Learning/Self-Improvement/Reward/RL/Preference-Learning；`Adaptation ≠ Identity/Objective/Authority`；`Success ≠ Truth/Better-Self`；失败不删历史；`AdaptationCannotImproveEpistemicStatus`。

## 一句话

**一个系统可以根据现实反馈改变"怎么做"，但永远不能因此声称"我变成了谁"——适应是行为策略的调整，不是观察者的演化。**
