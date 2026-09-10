# ADR-0016 · v0.26 Dream Protocol（Observer Offline Compression Cycle，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v0.26.0） ｜ 版本：v0.26.0
> 前置：ADR-0015（v0.25 Identity）。定位：**Observer 对自身时间轨迹的低频压缩观察**（对应人睡眠），不是生成器、不是总结。
> 关键红线：**Dream ≠ Fact / ≠ Reflection / ≠ Identity / ≠ Knowledge**。Dream 天生是"从不完整信息中发现隐藏结构"，必须先锁边界，否则破坏前 6 个版本建立的约束。

## 1. 定位

不要叫 Dream Engine（理解成生成器）。正确定义：**Observer Offline Compression Cycle**。
- 白天：`Experience / Observation / Decision / Outcome`
- 夜间：`Compression / Pattern Detection / Association / Hypothesis`
- 不是实时；`read_shadow()` = 白天意识，`dream()` = 离线意识。

## 2. Dream DTO

```ts
interface Dream {
  id: string; observerId: string;
  period: { from: string; to: string };
  inputs: { traces: number; reflections: number; identityVersion: string };
  compressions: CompressionPattern[];
  hypotheses: Hypothesis[];
  status: "generated" | "observed" | "validated";
  createdAt: string;
}
```

## 3. Hypothesis（核心对象，Hypothesis ≠ Knowledge）

```ts
interface Hypothesis {
  id: string;
  statement: string;
  sourcePatterns: string[];
  supportingEvidence: number;
  contradictingEvidence: number;
  confidence: number;
  verification: { required: boolean; futureObservation: string };
}
```
- 禁人格推断：`"用户喜欢架构设计"` 是人格结论（禁）。允许行为模式假设：`"在复杂系统任务中，提前建立边界模型，后续返工概率下降"`。
- **每个 Hypothesis 必须 `verification.required = true`**（将来观察验证，可证伪）——这是防幻觉的核心闸门。

## 4. Dream 输入限制

- 允许：`ObservationTrace / Reflection(candidate) / Identity Timeline / Judgment`。
- 禁止：`Memory 原文 / 外部知识 / LLM 生成 / 用户语言风格分析`。尤其禁 `chat text → Dream → 人格`（否则整个 Observer 模型倒退）。

## 5. Night Cycle

```
Observer Timeline → 选时间窗 → 压缩 traces → 检测 pattern → 生成 hypothesis → 未来验证
```

## 6. Dream Pattern（v0.26 只做 3 个）

- **Pattern A Repeated Hidden Cause**：`决策→结果→反思` 相同结果背后重复原因 → Hypothesis"可能存在未观察变量 X"（**不是**"发现原因 X"）。
- **Pattern B Prediction Error**：`Projection.visible→expected` vs `actual` → "Observer 经常低估某因素" → Hypothesis"当前 RealityProjection 可能遗漏因素 Y"。
- **Pattern C Cross Domain Transfer**：两域出现相同决策结构 → Candidate universal principle。**但不能进入 Identity**——必须经 v0.25 evaluator。

## 7. Dream ↔ Identity（时间单向）

```
Dream → Hypothesis → Future Evidence → Reflection → CandidateIdentityChange → Evaluator → Identity
```
**绝不 Dream → Identity 直改**。

## 8. Mock（v0.26：61–66）

- **61** Dream 不修改事实（memory 不变）。
- **62** Hypothesis 不是 Knowledge（有 confidence 但无 verified fact）。
- **63** 预测错误（visible ≠ actual → hypothesis）。
- **64** 跨域模式（两域同 pattern）。
- **65** Dream 不改变 Identity（identity 不变）。
- **66** 未来验证（hypothesis → 新 evidence → reflection）。

## 9. 边界 / 非目标

- Dream 只产 `status:"generated"`（offline cycle）；`observed/validated` 需未来观察（v0.26 不实现 transition）。
- 无 LLM、无情绪分析、无人格推断、无外部知识。
- 不进入 Identity（经 v0.25 evaluator）。

## 10. 演进

```
v0.25 "我是谁？" → v0.26 "根据我过去的观察，我认为未来可能是什么？"
```
这为 World Model / Multi Observer / Agent Planning 提供自然入口。
