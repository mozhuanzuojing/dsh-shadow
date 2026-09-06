# ADR-0018.1 · Observer Sleep Boundary & Hypothesis Isolation Protocol（v0.27 边界，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.27 实现） ｜ 版本：v0.27.0
> 前置：ADR-0018（Offline Compression）。定位：v0.20–v0.26 解决「Observer 如何存在」；v0.27 开始解决「Observer 如何产生内部世界模型」——风险升级。
> 防滑点：从「观察压缩」滑向「自我幻想生成」。本 ADR 加 4 条约束。

## 1. Sleep Boundary（为什么现在进入 Dream）

不能 `用户问问题 → 马上 Dream → 自我结论`（污染 Observer）。人不是一直做梦。
```
ObserverContext → Sleep Boundary → Offline Compression
```
```ts
SleepWindow {
  observerId: string;
  startTime: string; endTime: string;
  trigger: "scheduled" | "resource_idle" | "manual";
  includedTimelineRange: { from: string; to: string };
  excluded: { currentConversation: boolean; externalInput: boolean };
}
```
v0.27 支持 `scheduled / manual`；`resource_idle`（自动）与未来证据驱动留 v0.28+。**excluded 恒为 true**（Dream 不准碰当前会话/外部输入）。

## 2. DreamArtifact 与 Hypothesis 完全分离

Dream 是**过程**，Hypothesis 是**产物**（梦境 ≠ 想法）。
```ts
DreamArtifact {
  id; observerId; sourceTemporalGraph: string;
  compressionMethod: string;
  discoveredPatterns: string[];
  generatedHypothesisIds: string[];
  createdAt: string;
}
Hypothesis {
  id; observerId;
  claimCandidate: string;
  supportingPatterns: string[];
  alternativeExplanation: AlternativeExplanation[];
  falsification: { whatWouldDisprove: string };
  verification: { required: true; status: "pending" | "observed" | "validated" | "rejected"; deadline? };
  createdAt: string;
}
```

## 3. AlternativeExplanation（Anti-confirmation-bias）

Dream 不只问"我发现什么"，还必须问"**我可能错在哪里**"。
```ts
AlternativeExplanation {
  hypothesisId: string;
  alternatives: { description: string; supportingEvidence: string[] }[];
}
```
v0.27 从**同一 TemporalGraph** 生成**结构性替代解释**（另一因果读法/另一分组），`supportingEvidence` 初始为空（候选、待 v0.28 未来证据填充）。符合"灵魂看到答案，但低速体验需保留不确定性"。

## 4. Dream 不产生 Principle（改 candidate abstraction）

Dream 层不出现 principle（principle 是 Identity 层语言；Dream 不知道"我应该成为怎样的人"）。Dream 只说"我观察到一个重复结构"。
```
Dream → Hypothesis → Reflection → CandidateIdentityChange → Evaluator → Learned Principle
```
Cross Domain Transfer 输出 **candidate abstraction**（非 principle）。

## 5. Dream 不参与 Identity

Dream 不改变 Memory / Identity / Knowledge；不进入 Identity（经 v0.25 evaluator）。

## 6. v0.27 内部结构

```
Temporal Kernel → Sleep Boundary → Offline Compression
   → Pattern Engine + Alternative Engine → DreamArtifact → Hypothesis(status=pending)
   → Future Evidence → Reflection → Identity Evolution
```

## 7. 命名 / 版本

内部 **Observer Offline Compression Cycle**；外部 alias Dream。版本 **v0.27.0 Observer Sleep Kernel**。

## 8. 路线

```
v0.27 Observer Sleep Kernel   ← 本 ADR（DreamArtifact + Hypothesis(pending) + alternative）
v0.28 Hypothesis Validation   （observed/validated/rejected，未来证据驱动）—— 认知真实性核心考验
v0.29 Observer Federation     （Multi Observer）
v0.30 World Model
```

## 9. 边界 / 非目标

- v0.27 只产 `verification.status: "pending"`；`observed/validated/rejected` 需未来观察（v0.28）。
- 无 LLM、无外部知识、无 Embedding、无情绪分析、无人格推断；不参与 Identity。
- 验证：先在一个 Observer 上证明可产可验证假设，再谈联邦。

## 10. 演进

dsh-shadow 已定位为 **Artificial Observer Runtime**：Identity → Observer → Temporal Continuity → Offline Compression → Hypothesis Formation → Reality Validation。v0.28 决定它是"会自我观察的 Agent"还是"会自我幻想的 Agent"。
