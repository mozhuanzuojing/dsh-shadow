# ADR-0017 · Observer Temporal Continuity Protocol（v0.26 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.26 实现） ｜ 版本：v0.26.0
> 前置：ADR-0016（Dream Protocol）。定位：**"未来-现在-过去是同一轨迹"**——一个 Observer 在时间上的**连续状态**，不是离散点。
> 核心：工程对应你的"灵魂知道未来，但为体验放慢观察视角"不是预测，而是 **Temporal Topology（时间拓扑）**。先建时间，再建梦。

## 1. 为什么 Dream 之前必须补 Temporal Layer

ObservationTrace 目前是离散点（event/observer/projection/decision/outcome）。但"灵魂观察"的核心是**时间中的连续状态**：
```
过去 ─── 现在 ─── 未来
  \        |        /
   ────── 同一轨迹 ──────
```
所以插入：`ObservationTrace → Temporal Graph → Dream`。

## 2. TemporalNode（一次观察状态，不是事件）

```ts
TemporalNode {
  id: string;
  observerId: string;
  timestamp: string;
  stateSnapshot: { identityVersion: string; observerState?: ObserverState; intent: Intent };
  evidenceLinks: string[];
}
```
含义："那个时间点，我是谁，我看到什么。"

## 3. TemporalEdge（连接两次观察）

```ts
TemporalEdge {
  from: string; to: string;
  relation: "caused_by" | "learned_from" | "contradicted_by" | "evolved_into";
  confidence: number;
}
```
例：`第一次设计API --failed--> 增加边界检查 --success--> 形成原则`。

## 4. 关系派生规则（确定性，不虚构连接）

- `decision+outcome` in trace → `caused_by`（决策导致结果）。
- Reflection candidate accepted → `evolved_into` / `learned_from`（反思演进为原则）。
- Judgment verdict=stale/superseded → `contradicted_by`（旧结论被后续否定）。
- **Graph 是派生索引（非新 truth 源），可在重建时从 traces 重算——保持 Memory ≠ Evidence 边界。**

## 5. Dream 真正输入改为 Temporal Graph（不是 raw Trace/Reflection/Identity/Judgment）

```
Temporal Graph → Compression → Pattern Detection → Hypothesis
```
梦不是看事件，是看**事件之间隐藏的结构**。

## 6. v0.26 Dream 三个 Pattern 升级（落 v0.27）

- **A Latent Causal Loop**：`A发生→B决策→C结果` 重复出现 → Hypothesis"可能存在隐藏变量 X 导致 ABC 链"。
- **B Expectation Reality Gap**：`我认为世界怎样 ↓ 世界实际怎样 ↓ 修正模型`（不是预测，是修正）。
- **C Cross Domain Transfer**：`边界隔离(软件架构) / 职责隔离(管理) / 认知边界(成长)`——"灵魂经验压缩"。

## 7. Hypothesis 升级（防"将偶然连接误认为规律"）

```ts
Hypothesis {
  claim: string; originPattern: string;
  confidence: { frequency: number; consistency: number; alternativeCount: number };
  falsification: { whatWouldDisprove: string };
  verification: { required: boolean; deadline: string };
}
```
梦最大风险不是错误，而是把**偶然连接误认为规律**——用 `alternativeCount`（替代解释数量）+ `falsification`（如何证伪）+ `verification.deadline` 约束。

## 8. 命名

内部名 **Observer Offline Compression**；外部 alias **Dream**（类似 Garbage Collector 非垃圾，是 Memory Reorganization）。

## 9. 路线调整

```
v0.25 Identity Continuity  ✅ ADR-0015
v0.26 Temporal Continuity  ← 本 ADR（时间拓扑：TemporalNode/Edge/Graph）
v0.27 Dream Compression    （3 个 pattern 跑在 Temporal Graph 上）
v0.28 Hypothesis Validation（observed/validated 的 transition）
v0.29 Multi Observer
v0.30 World Model
```

## 10. 边界 / 非目标

- v0.26 只建 Temporal Graph（nodes from traces + edges from relation 派生规则），不跑 Dream。
- 无 LLM、无外部知识、无人格推断；Graph 是派生索引可重建。
- 不进入 Identity（经 v0.25 evaluator）。

## 11. 演进

v0.25 回答"我是谁"；v0.26 搭建"我在时间中如何连续存在"；v0.27 起，Dream = Observer 在低频模式下重新观察自己的时间结构。
