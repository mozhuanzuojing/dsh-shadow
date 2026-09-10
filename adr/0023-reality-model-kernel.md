# ADR-0023 · Observer Reality Model Kernel Protocol（v0.30 前置协议，先于实现）

> **勘误（v1.13.0 / ADR-0050）**：正文里的 `mode:"reality"` 查询 RealityClaim **已过时**。现码：Reality Model 用 `model` / `model-claim` / `model-observation`；federation 注册 RealityEvidence 用 `real-evidence`（废止旧名 `reality`）。见 `CONTEXT.md` mode 参考与 ADR-0050。

> 时间：2026-09-07 ｜ 状态：已实现（v0.30.0） ｜ 版本：v0.30.0
> 前置：ADR-0022（v0.29.1 Integrity Review，7 条 Invariant 冻结）。定位：
> **Reality Model 不是世界知识库，而是 Observer 群体基于共享证据、验证历史和时间上下文形成的稳定现实描述层。**

## 核心公式

```
Reality Model = Reality Evidence Registry + Validation History + Temporal Context + Uncertainty
```
**不是** `Temporal Graph + Federation Merge`。

## 1. Reality Model 三层结构

### Layer 1：RealityObservation（取代 RealityEvidence，更中性）
`Evidence` 易被误认为已证明 → 改 `RealityObservation`。
```ts
RealityObservation { id; timestamp; sourcePerspectives: string[]; observation: string; externalReference?: string; }
```
含义：**多个 Observer 指向同一个被观察事件**，不是世界事实。

### Layer 2：RealityClaim（核心 DTO）
```ts
RealityClaim {
  id; subject; predicate; object;
  supportingObservations: string[];
  validationHistory: string[];
  confidence: { evidenceStrength; repetition; temporalConsistency; alternativeSurvival };
  status: "candidate" | "supported" | "unstable" | "rejected";
}
```
**无 true/false**（Reality Model 也不能拥有绝对真理）。

### Layer 3：Stable Entity（非常克制）
- 允许：`Entity: PaymentService → observed properties: exists / exposed API / changed versions`。
- 禁止：`PaymentService is reliable / should use microservice`（已进 judgment / recommendation / knowledge）。

## 2. Temporal → Reality Model 边界

```
TemporalNode + RealityObservation + ValidationHistory → RealityClaim
```
**禁** `TemporalNode → RealityEntity`。Temporal 只能说明"我什么时候看到什么"，不能说明"它长期是什么"。

## 3. Validated ≠ Truth（再强化）

- **Test 102**：`validated hypothesis → RealityClaim → status=supported`，**非 truth**。
- **Test 103**：多 Observer `A:service slow / B:service stable` → 只能 `unresolved / possible context difference`，**禁 majority vote**。

## 4. Reality Model 不拥有 Identity 信息

- 禁 `{entity:"ObserverA", property:"likes architecture"}`。
- 允许 `{observer:"A", observation:{selected_boundary_design}}`。
Reality Model 描述**世界对象**，不是**观察者人格**。

## 5. v0.30 不做什么（冻结）

- ❌ **Knowledge**（`RealityClaim → KnowledgeBase`）。
- ❌ **Reasoning Engine**（`RealityModel → Decision`）。
- ❌ **World Model**（`RealityClaim + Relation = WorldModel`；World Model 属 v0.31）。

## 6. 实现范围

- **G1 Reality Observation Layer**：`reality/{types,observation,registry}.ts`——`RealityEvidenceRegistry → RealityObservation`。
- **G2 Reality Claim Engine**：`reality/claim/`——`Observation[] + ValidationHistory[] → RealityClaim`（只产 candidate/supported）。
- **G3 Reality Query**：`read_shadow({mode:"reality"})`——query entity / claim / evidence lineage，必须支持"**为什么系统认为这个现实描述存在**"（RealityClaim → Observations → Validation → Perspectives）。

## 7. 测试（102–110）

102 RealityClaim != Truth / 103 Temporal cannot create Reality / 104 Federation cannot create Reality alone / 105 Alternative explanation survives / 106 RealityClaim lineage reconstruction / 107 Observer identity leakage blocked / 108 Majority vote rejected / 109 Validated != Knowledge / 110 RealityModel immutable history。

## 8. 路线

```
ADR-0023 Reality Model Kernel → v0.30 Reality Model Kernel → tag v0.30.0 → ADR-0024 World Model Boundary → v0.31 World Model
```

## 9. 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.30：`tsc` + `node --check` + mock（102–110）+ 提交/推送。
- 无 LLM、无 Knowledge、无 Reasoning、无 World Model、无 Identity/人格描述；`Validated ≠ Truth`；Reality Model 不可变（append-only 历史）。

## 10. 一句话

v0.30 最重要的能力不是让 Reality Model"更聪明"，而是**让系统知道哪些东西它仍然不能称为 Reality**。守住这一层，v0.31 World Model 才不会变成"多个 Observer 幻觉的平均值"。

---

## 附录：v0.30 实现说明（Appendix A–D 已落地）

- **A RealityObservation 命名/语义冻结**：`reality/observation.ts` `RealityObservation{id, observedAt, subjectRef?, sourcePerspectives[], observation, temporalContext, validationRefs[]}`；**无 truth/certainty/fact**；`observation`=弱事实"多个 Observer 指向同一被观察事件"。
- **B RealityClaim 保留 lineage**：`reality/claim/engine.ts` `RealityClaim{subjectRef?, subject, predicate, object, supportingObservations, validationHistory, perspectiveRefs, temporalContext, confidence, status, lineage{observations, validations, perspectives}}`——无 lineage 拒绝生成（仅 Temporal/Federation 不足以生成）。
- **C ObservedEntityCandidate（克制）**：只记录 `{entity, observation:{exposedApi, version, changedVersions}}`，不写评估（reliable/should）。
- **D 生命周期冻结**：`candidate → supported → unstable → rejected`，**永不 truth**（World Model 只消费 supported RealityClaim，非 Truth DB）。

实现：`reality/{types, observation, registry}.ts` + `reality/claim/{engine, persist}.ts`。modes：`model-observation` / `model-claim` / `model`（lineage 查询，能答"为什么系统认为它存在"）。`shadow/model/{observations,claims}/`（append-only，不可变历史）。

mock 102–110 验证：Observation≠Truth / Temporal&Federation alone 不产 claim / Alternative survives（unstable）/ lineage 重建 / identity leakage blocked / majority vote rejected / Validated≠Knowledge / immutable history。
