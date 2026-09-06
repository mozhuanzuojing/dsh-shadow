# ADR-0024 · Observer World Representation Layer Protocol（v0.31 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.31 实现） ｜ 版本：v0.31.0
> 前置：ADR-0023.1（v0.30.1 Reality Integrity Lock，Invariant 111–115 已固化为运行时约束）。
> 命名：**Observer World Representation Layer Protocol**（不叫 World Model Protocol——"World Model" 天然暗示 世界实体库/因果模型/知识图谱/预测引擎/环境模拟器，而我们构建的不是这些）。
> 定位：`Reality Model → World Representation Layer → Observer 当前可维护的世界结构表示`。

## 1. 第一条：继承 Reality Integrity

```
World Representation Layer MUST satisfy Invariant 111-115.
```
任何进入 World Representation 的东西必须已经经过：
```
Observation → RealityObservation → RealityClaim → supported
```
**禁止**：`TemporalGraph → WorldObject`、`FederationPerspective → WorldEntity`、`DreamHypothesis → WorldRelation`。

## 2. 输入边界

- 允许：`Supported RealityClaim / Validation History / Temporal Context / Uncertainty / Relation Hypothesis`。
- 禁止：`Memory / Identity / Personality / Preference / Dream / Raw Trace / Chat Text / Embedding Similarity`。
- 尤其：**Dream ≠ World Observation**——Dream 仍是"Observer 对自身轨迹的压缩假设"，不能变成 World knowledge source。

## 3. 三层对象模型（避免 WorldEntity/WorldRelation/WorldFact 的误导）

### RepresentationObject
> Observer 当前认为某个现实结构值得维护。
```ts
RepresentationObject { id; basedOnClaims: RealityClaim[]; temporalScope; uncertainty; status; }
```

### RelationHypothesis（关系必须保持假设）
- 允许：`{ from:"Service-A", to:"Service-B", relation:"depends_on", status:"hypothesis" }`。
- **禁止**：`{ ..., status:"reality" }`（关系永远是假设，除非未来经 validation）。

### RepresentationGraph（不叫 WorldGraph）
> Graph 表示结构，不表示宇宙本身。
```ts
RepresentationGraph { id; objects; relations: RelationHypothesis[]; }
```

## 4. v0.31 第一版不做（冻结）

- ❌ **因果发现**（`A happened B happened ≠ A causes B`）。
- ❌ **预测**（`Current World Representation → Future Simulation`；预测属 `Hypothesis + Validation`）。
- ❌ **知识生成**（`RealityClaim → Knowledge`）。
- ❌ **Agent 决策**（`World Representation → Action Recommendation`；否则重新进入 Agent Planning）。

## 5. v0.31 真正目标

不是"构建一个世界模型"，而是"构建一个观察者能**持续维护、修正、解释来源**的现实结构表示"。核心能力——回答"**为什么系统认为这个世界结构存在？**"：
```
RepresentationObject → RealityClaim → RealityObservation → Observer Perspective → Validation History
```
而不是 `Database lookup`。

## 6. Mock（116–120，验证边界而非加 pattern）

- **116** supported RealityClaim → RepresentationObject。
- **117** candidate RealityClaim 不能进入 Representation（拒绝）。
- **118** Relation Hypothesis isolation（允许 `possible_relation`；拒绝 `confirmed causal relation`）。
- **119** Identity leakage 拒绝（Observer A identity 不入 Representation）。
- **120** Dream leakage 拒绝（Dream hypothesis 不入 Representation）。

## 7. 执行顺序

```
v0.30.1 Reality Integrity Lock ✅
ADR-0024 Observer World Representation Layer Protocol  ← 本 ADR
v0.31 World Representation Kernel
v0.31.1 Integrity Review
后续才考虑真正 World Model / Simulation
```

## 8. 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.31：`tsc` + `node --check` + mock（116–120）+ 提交/推送。
- 无 LLM、无 Knowledge、无因果、无预测、无 Agent 决策、无 Identity/Personality/Preference/Dream；`RelationHypothesis.status` 恒 hypothesis；`RepresentationObject.basedOnClaims` 只接受 supported。

## 9. 一句话

v0.31 的任务：**一个观察者在不拥有世界、不拥有真理的情况下，如何维护一个可修正的世界表示**。
