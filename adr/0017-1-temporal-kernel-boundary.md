# ADR-0017.1 · Observer Temporal Kernel Implementation Boundary（v0.26 实现边界，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.26 实现） ｜ 版本：v0.26.0
> 前置：ADR-0017（Temporal Continuity）。本 ADR 锁定 5 个实现约束，防 v0.27 Dream / v0.29 Multi Observer 出现结构债。
> 定位：v0.26 是 **Observer Temporal Kernel**（时间坐标系），不是"Dream 输入准备"。这是 dsh-shadow 从 AI Memory System 跨到 **Artificial Observer Runtime** 的分水岭。

## 5 条锁定

### 1. Temporal 独立于 Dream（`temporal/`，不是 `dream/`）
Temporal Graph 是：Dream 的输入 + Identity Evolution 的证据来源 + Judgment 的时间上下文 + Multi Observer 的基础。**Temporal 是宇宙时间层，不是意识功能层。**
```
temporal/
├── types.ts        # TemporalNode / TemporalEdge / TemporalGraph / relation
├── node.ts         # TemporalNode 构建
├── edge.ts         # TemporalEdge 构建（关系派生）
├── builder.ts      # TemporalGraph 构建 + timeline resolution
├── query.ts        # queryTemporal（一等能力）
└── persistence.ts  # shadow/temporal/<date>/<id>.json（派生、可重建）
```

### 2. TemporalNode 加 `perceptionSnapshot`
人在时间中变化不只是 Identity，还有"当时怎么看世界"。缺它则无法回答"为什么过去的我没有看到现在我看到的东西"。
```ts
TemporalNode {
  id; observerId; timestamp;
  stateSnapshot: { identityVersion; observerState?; intent };
  perceptionSnapshot: { lens?; visible?; hidden?; distortion? };  // 新增
  evidenceLinks: string[];
}
```

### 3. Edge 不声明真实因果（`followed_by`，非 `caused_by`）
因果是 World Model 层；Temporal 只描述**时间结构关系**。默认 relation = `followed_by`；`caused_by / possible_causal_link` 只作高置信枚举，**不得**以此进入 World Model 当因果断言。
```ts
relation: "followed_by" | "learned_from" | "contradicted_by" | "evolved_into" | "possible_causal_link";
```

### 4. identityVersion 读取时解析，不回写历史
TemporalNode = `Trace(immutable) + Timeline lookup(读时)`。`stateSnapshot.identityVersion = resolvedFromTimelineAtTimestamp`。**绝不回填进 trace**（改过去违反时间单向）。

### 5. Temporal Query 是一等能力
```ts
queryTemporal()
```
v0.26 至少支持：① replay 一个节点（该时刻 身份/intent/projection/evidence/outcome）；② compare 两个时间点（identity v1→v3、projection distortion 变化、judgment confidence 变化、pattern repeated）。这是 Observer continuity 的落地。

## v0.26 范围

**做**：TemporalNode / TemporalEdge / TemporalGraph builder / timeline resolution / temporal query / immutable。
**不做**：Dream、Hypothesis、Prediction、World Model。

## 命名

v0.26 内部名 **Observer Temporal Kernel**；不是"Dream 输入准备"。

## 边界

- 无 LLM、无外部知识；Graph 是派生索引（可重建，保持 Memory ≠ Evidence）。
- 不进入 Identity（经 v0.25 evaluator）。

## 校验

- 实现验收：`tsc` + `node --check` + mock（新增 temporal 场景）+ 提交/推送，每步保持前 61 场景全绿。

## 路线

```
v0.26 Observer Temporal Kernel  ← 本 ADR
v0.27 Dream Compression
v0.28 Hypothesis Validation
v0.29 Multi Observer
v0.30 World Model
```
