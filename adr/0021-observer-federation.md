# ADR-0021 · Observer Federation Protocol（v0.29 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.29 实现） ｜ 版本：v0.29.0
> 前置：ADR-0020（v0.28.1 Epistemic Kernel）。定位：**多个 Observer 在保持独立主体的前提下，如何共同逼近 Reality**。
> 一句话：**Federation 的目标不是让 Observer 达成一致，而是让不同 Observer 在保持主体独立的情况下，共同暴露 Reality 与 Projection 的差异。**
> 防陷阱：不能退化成 `Agent A Memory \ Merge / Agent B Memory`（Multi-Agent RAG）。Federation 建在 **Reality 层交汇**，不是 Memory 层交汇。

## 1. Federation 基本单位是 Perspective，不是 Observer

不交换 Observer、不交换 Identity；交换 **Perspective Instance**（"我在某个时间、某个观察位置，看到了什么"，不是"我是谁"）。
```ts
FederatedPerspective {
  observerId: string;
  temporalReference: string;      // 时间坐标（接 v0.26 Temporal）
  observationClaim: string;       // 我看到什么
  projectionSnapshot: { lens?: string; visible: string[]; hidden: string[]; distortion: string[] };
  validationHistoryRef: string[]; // 接 v0.28 Validation
  confidence: number;
  boundary: { identityExcluded: true; memoryExcluded: true; dreamExcluded: true };
}
```

## 2. Shared Reality Evidence 不属于任何 Observer

```
        Reality Evidence
          /        \
  Observer A     Observer B
```
所有 Observer **只能引用，不能拥有**。`RealityEvidenceRegistry`：
```ts
RealityEvidence { id: string; source: string; timestamp: string; observedFact: string; linkedHypothesis: string[]; }
```
== `Observer A owns evidence` ❌；`Observer B trusts A evidence` ❌。

## 3. Agreement 不追求一致

普通系统 `A:answer X / B:answer Y / choose winner`。你的系统：
```
Reality → Projection A + Projection B → difference → distortion analysis
```
输出不是 `winner=A`，而是：
```
Observer A noticed: security boundary
Observer B noticed: performance impact
Missing from A: operational cost
Missing from B: long term risk
```

## 4. Observer Difference Artifact（v0.29 核心产物）

```ts
ObserverDifference {
  observerA: string; observerB: string;
  sameRealityReference: string;
  projectionDelta: { visibleDifference: string[]; hiddenDifference: string[]; lensDifference: string[] };
  possibleBlindSpot: string[];
}
```
不叫 conflict（两 Observer 不一定冲突，可能只是观察角度不同）。

## 5. 禁止 Federation 产生 Identity 变化

```
Observer B → Alternative Perspective → Reflection → CandidateIdentityChange → Evaluator → Identity
```
Federation 提供**镜子**，不是**修改器**。`Federation → Identity` ❌。

## 6. Federation Validation（Perspective Stability）

```
isolated → shared → reality_supported
```
- `shared`：≥2 Observer 引用同一 RealityEvidence。
- `reality_supported`：有 ValidationResult 支撑。
避免绝对真理（不叫 truth）。

## 7. 结构（ADR-0021）

```
1 Federation Philosophy
2 Observer Independence
3 Perspective Exchange Contract
4 Shared Reality Evidence
5 Distortion Comparison Model
6 Observer Difference Artifact
7 Federation Validation Lifecycle
8 Forbidden Transitions: Federation → Identity/Memory/Knowledge ❌
9 Future: Reality Model / World Model
```

## 8. 路线微调

```
v0.29 Observer Federation Kernel    Perspective Exchange + Difference Analysis + Shared Evidence Reference
v0.30 Reality Model Kernel          Reality Evidence Graph + Cross Observer Validation
v0.31 World Model                   只有 Reality Model 稳定后再做
```
World Model 最大风险：把观察者的投影误认为世界本身——所有 ADR 都在防这个。

## 9. 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.29：`tsc` + `node --check` + mock（新增 federation 场景）+ 提交/推送。
- 无 LLM、无 vote/majority、无 Memory merge、无人格模拟、不产生 Knowledge/Identity/Dream。

## 10. 演进

v0.20–v0.28.1 = **一个灵魂如何观察自己**。v0.29 开始 = **多个有限观察者，如何在不失去自身的情况下，共同接近现实**。

---

## 附录：v0.29 实现说明（4 个工程约束已落地）

1. **RealityEvidenceRegistry 弱事实定位**：`federation/reality.ts` `RealityEvidence{id, observedAt, source, observation, linkedHypothesis[], referencedBy[], status}`——只记录"某事件在某时间被观察到"，**不解释世界规律**（Observation→Projection→Judgment 不是 Evidence）；**append-only**（B 引用不改 A 的 observation）。
2. **FederatedPerspective 不携带推理结果**：`federation/perspective.ts` `confidence{observationConfidence, validationConfidence}` 拆分——"确定看到 X"（高）≠"X 对现实的解释正确"（可低）。`perspectiveIsClean` 拦"validationConfidence 超观察确信"。
3. **ObserverDifference 是核心产物**：`federation/difference.ts` 输出 `projectionDelta{visibleDifference,hiddenDifference,lensDifference} + possibleBlindSpot + unresolvedQuestion`（科学过程=发现"原来不知道什么"），**非 winner**。
4. **Perspective Stability 不叫升级**：`federation/stability.ts` `isolated → corroborated(≥2 Observer 引用) → validated(shared + future validation)`——**shared != correct**（两 Observer 可同时错）。

结构：`federation/{types,perspective,reality,difference,stability}.ts`。modes：`federation-perspective` / `reality` / `real-refer` / `federation-diff` / `stability`。不产生 Knowledge/Identity/Principle。

mock 90–94 验证：Perspective isolation（confidence 拆分） / Evidence Registry ownership（B 引用不改 A 弱事实） / Projection Difference（非 winner） / Stability（isolated→corroborated→validated） / No Identity Pollution。
