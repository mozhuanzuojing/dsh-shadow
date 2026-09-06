# ADR-0018 · Observer Offline Compression Protocol（v0.27 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.27 实现） ｜ 版本：v0.27.0
> 前置：ADR-0017.1（v0.26 Temporal Kernel）。定位：v0.27 是第一次让 Observer 在**没有外界输入**的情况下观察自己——Offline Compression Cycle。
> 关键：Dream **第一次允许系统提出"未发生但可能存在的结构"**，所以边界必须先锁死（否则退化成"高级总结器"/RAG）。

## 1. Dream = Offline Compression，不是生成器

名字：内部 **Observer Offline Compression**；外部 alias Dream。链路：
```
Observer Temporal Kernel → Offline Compression Cycle → Hypothesis Generation
```

## 2. Dream 输入只能是 TemporalGraph

- 允许：`TemporalNode[] / TemporalEdge[] / Reflection(candidate) / Judgment / IdentityTimeline`。
- 禁止：`Memory / Experience / Chat Text / Embedding / External Knowledge`。
- **Dream 只能观察"我过去如何观察世界"，不能直接观察"世界是什么"。**

## 3. Dream 输出不是知识

```
Dream → Hypothesis → Future Evidence → Reflection → CandidateIdentityChange → Evaluator → Identity
```
**绝不 Dream → Knowledge**（否则马上退化成 RAG）。Dream 不改变 Memory / Identity / Knowledge（时间单向、旁支）。

## 4. Hypothesis DTO 冻结（永远可证伪）

```ts
Hypothesis {
  id: string; observerId: string;
  statement: string;
  source: { temporalNodes: string[]; temporalEdges: string[] };
  confidence: { frequency: number; consistency: number; alternativeCount: number };
  falsification: { whatWouldDisprove: string };
  verification: { required: true; status: "pending" | "observed" | "validated" | "rejected"; deadline? };
  createdAt: string;
}
```
**无 `truth:true`、无 `insight:true`**——只有 candidate structure。

## 5. 三个 Pattern（各防一处幻觉）

- **A Latent Recurrence Loop**：发现 `Situation→Decision→Outcome→Repeated Situation` 循环重复。**不说 "A causes B"**（causal 改 recurrence，避免提前进入 World Model）。
- **B Expectation Reality Gap**：`expected outcome vs actual outcome` → Prediction Error Pattern（Observer 常低估某因素）。
- **C Cross Domain Transfer**：两域同决策结构 → **candidate principle**（措辞为"在多个领域观察到 X 候选模式"，不是断言"应该先抽象边界"）；**不进入 Identity**（经 v0.25 evaluator）。

## 6. Offline Compression Cycle

```
dream(): 1 select temporal window → 2 build compression view → 3 detect recurrence → 4 generate hypothesis → 5 persist dream artifact
```
不是实时。存储 `shadow/dream/<date>/dream.json`（不是 memory）。

## 7. Dream Artifact 与 Hypothesis 分离

```ts
Dream {
  id; observerId; timeRange;
  compression: { nodeCount; edgeCount; removedNoise };
  hypotheses: Hypothesis[];
  sourceTemporalGraph: string;
  createdAt: string;
}
```
Dream = 一次离线观察过程；Hypothesis = 观察后的候选结构。分离以便回答"为什么梦产生这个想法"。

## 8. 反幻觉测试（mock 69–72）

- **69** 无足够结构不产生 Hypothesis（single event → `[]`）。
- **70** 时间重复产生 candidate（`A→B→C` ×5 → status=generated）。
- **71** 偶然共现不产生规律（`A发生+B发生` 一次 → none）。
- **72** falsification 存在（`verification.required:true` + `falsification.whatWouldDisprove`）。

## 9. 路线（微调）

```
v0.26 Observer Temporal Kernel  ✅ ADR-0017.1
v0.27 Offline Compression         ← 本 ADR（Hypothesis generation，只产 pending/generated）
v0.28 Hypothesis Validation       （observed/validated/rejected transition，未来证据驱动）
v0.29 Observer Federation (Multi Observer)
v0.30 World Model
```
Multi Observer 之前必须先证明：**一个 Observer 可以产生可验证假设**。

## 10. 边界 / 非目标

- v0.27 只产 `verification.status: "generated"/"pending"`（offline cycle 一次跑出）；`observed/validated/rejected` 需未来观察（v0.28）。
- 无 LLM、无外部知识、无 Embedding、无情绪分析、无人格推断。
- Dream 不改变 Memory / Identity / Knowledge；不进入 Identity（经 v0.25 evaluator）。

## 11. 演进

v0.26 之后 dsh-shadow 已是 **Artificial Observer Runtime**（Perception/Experience/Evidence/Judgment/Identity/Temporal/Offline Reflection）。
v0.27 = 第一次让这个 Observer 在**无外界输入**下观察自己。
