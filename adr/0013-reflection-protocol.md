# ADR-0013 · v0.24 Reflection Engine 协议（锁计算模型，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v0.24.0） ｜ 版本：v0.24.0
> 前置：ADR-0012（v0.23 Observation Trace）。定位：**从多个 ObservationTrace 中发现"观察者自身重复出现的观察模式"**，不是总结 Trace。
> 关键红线：**Reflection 输入只能是 `ObservationTrace[]`**。禁止 Memory / Experience 原文 / 外部知识 / LLM——Reflection 是对自身观察路径的回看，不是知识整理。

## 1. 三条原则

1. **输入只允许 `ObservationTrace[]`**（禁 Memory/Experience 原文/外部知识/LLM）。否则 Reflection 退化成 `Trace A/B/C → LLM summary`，不是人类反思。
2. **输出不是事实**，属于 `Observation → Reflection → Candidate Principle`。必须带 `ReflectionStatus = observed | candidate | confirmed`；**第一版只允许 observed / candidate，不得 confirmed**（confirmed 需 v0.25 人工/规则确认）。
3. **Reflection 不改变过去**（时间方向单向）：`过去→Trace`、`未来→Reflection`；不得修改任何旧 Experience/Trace。

## 2. Reflection DTO（不含 personality/soul/identity——v0.25 才处理）

```ts
type ReflectionStatus = "observed" | "candidate" | "confirmed";
type ReflectionLearning = { statement: string; type: "principle" | "anti_pattern" | "unknown"; evidenceCount: number };
type Reflection = {
  id: string; observerId: string;
  sourceTraces: string[];
  period: { from: string; to: string };
  observation: { repeatedDecisions: string[]; repeatedOutcomes: string[]; deviationPatterns: string[] };
  pattern: { decisionOutcomeCorrelation: { decision: string; outcome: string; count: number; successRate: number }[] };
  learning: ReflectionLearning;
  confidence: { score: number; reasons: string[] };
  status: ReflectionStatus;   // v0.24 只能是 "candidate"
};
```

## 3. Pattern 提取规则（第一版无 AI，纯统计）

- **Pattern 1 重复决策**：统计同一 observer 的 Trace 里 `decision.action` 出现次数 ≥2 → `repeatedDecisions`。
- **Pattern 2 成功率**：对 `(decision, outcome.actual)` 统计 count 与 successRate（**成功= outcome 命中 "正" 标记且无 "负" 标记**，见确定性标记集）。产出 `decisionOutcomeCorrelation[]`。**只输出统计事实 + 规则模板生成的候选原则**，不输出"你喜欢架构设计"这类 LLM 式人格判断。
- **Pattern 3 认知偏差**：`projection.hidden`（当时没看到的）→ `outcome.actual`（后来发生的）。hidden 项的关键词出现在后续 actual → 判"低估/漏看"偏差；worry 被证伪（隐藏担忧未发生）→ 判"高估"。产出 `deviationPatterns`。**这才是接近人的反思**（发现自己当时为什么会这样看）。

## 4. 存储（分层，不写 memory）

```
shadow/
  observation/<date>/<id>.md      # v0.23 观察轨迹
  reflection/<date>/<reflection-id>.md   # v0.24 反思（Reflection ≠ Memory）
  experience/
```
`listMemories` 跳过非日期目录，Reflection 不会被当记忆采集。

## 5. Mock（v0.24 只需 3 个）

- **场景 51 重复成功** → `candidate principle`（decision 多次 + 高 successRate）。
- **场景 52 失败模式** → `anti-pattern candidate`（decision + negative outcome 多次）。
- **场景 53 投影偏差** → `distortion pattern`（hidden 关键词在 actual 中出现 → "低估/漏看"）。

## 6. v0.24 冻结

❌ Identity 写回 ❌ Taste 更新 ❌ Dream ❌ LLM ❌ 自动人格判断 ❌ 情绪分析

## 7. 演进

```
ObservationTrace → Reflection → Identity   （模拟：人不是因记住过去而成长，而是回看自己过去如何观察世界，再改变下一次观察方式）
```
