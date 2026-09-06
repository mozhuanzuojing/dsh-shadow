# ADR-0011 · Observer Kernel Phase II 协议（Observation Trace / Reflection / Identity Evolution / Dream）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.23 实现） ｜ 版本：v0.23 起
> 前置：ADR-0010（v0.22 Judgment）。定位：dsh-shadow 是 **Artificial Observer Projection Engine**，不是 memory plugin。
> 关键：**Reflection 不能把 dsh-shadow 拉回"AI 自动总结过去"的普通 RAG**。Reflection 不是总结过去，而是 Observer 在经历之后对"自己的观察路径"进行压缩。

## 1. 核心不变量（协议红线）

1. **Reflection ≠ summary**。不是 `Memory → LLM summary → new memory`，而是 `Experience → Observation Trace → Reflection → Identity Evolution`。
2. **Reflection 不直接改 Identity**。必须 `Reflection → Candidate Identity Change → 人工/规则确认 → Identity`，否则人格会漂移。
3. **v0.23–0.25 第一版不做 LLM**。pattern 发现、learning 生成全部**确定性聚合 + 规则模板**（可复算，不做黑箱）。LLM 只作 Dream（v0.26）的可选润色、默认关。
4. **Dream ≠ Fact**。Dream 输出 Hypothesis，不是 Knowledge。（放 v0.26。）
5. **Observer 是根，Memory 只是一个器官**。Reflection 始终挂在 observerId 下。

## 2. 新 DTO（协议）

### ObservationTrace（v0.23 核心，"我当时怎么看"——现在缺的那层）
```ts
type ObservationTrace = {
  observerId: string;
  realityAnchor: "known-at-time" | "current" | "historical";
  projection: { visible: string[]; hidden: string[]; distortion: string[] };
  decision: { choice: string; reason: string };
  outcome: { actual: string; expected: string };
  deviation: string;            // actual vs expected，回看时"我当时为什么这样看"
};
```
人类成长不是因为知道结果，而是**发现自己当时为什么会这样看**——这一层补上 Experience→Outcome 中间的缺口。

### Reflection（v0.24）
```ts
type Reflection = {
  id: string; observerId: string;
  sourceExperiences: string[];
  period: { from: string; to: string };
  observation: { whatHappened: string; whatWasSeen: string; whatWasIgnored: string };
  pattern: { repeated: string[]; changed: string[]; contradiction: string[] };
  learning: { lesson: string; principle?: string; antiPattern?: string };
  identityImpact?: { strengthen: string[]; weaken: string[]; updateLens?: string[] };
  confidence: number;
};
```
**confidence 与 pattern 必须可复算**（统计 decision→outcome 分布，规则模板生成 learning），不做 LLM。

### ObserverState（加进 ObserverContext，v0.23）
```ts
type ObserverState = { energy?: string; focus?: string; uncertainty?: number; goalStage?: string };
```
`ObserverContext` 增 `state?: ObserverState`。**来源裁定**：`uncertainty` 可派生（证据缺失数 + confidence.overall）；`energy/focus/goalStage` 第一版 **curated/可注入**（observer 显式传或灵魂配置），**不自动推断**——这是"灵魂信号 vs 认知噪声"分层的起点，但必须诚实标注哪些是信号、哪些是先验，不全部造出来。

## 3. 路线（Observer Kernel Phase II）

```
v0.23 Observation Trace    ObservationTrace + ObserverState(state 接入 ObserverContext) + trace 采集
v0.24 Reflection Engine    Reflection DTO + 确定性 pattern 提取（decision→outcome 统计 + 规则模板）
v0.25 Identity Evolution   Identity 时间线（identity(t0) → Reflection → identity(t1)），经 Candidate Identity Change 确认
v0.26 Dream Engine         Night Cycle：Experience 压缩 / 跨域连接 / 隐藏模式发现（输出 Hypothesis，Dream≠Fact）
```

## 4. 边界 / 非目标

- **不做**：v0.23 引入 LLM 生成 pattern/learning（危险黑箱）。
- **不做**：Reflection 直接写回 Identity（人格漂移）。
- **不做**：自动推断 ObserverState 的 energy/focus/goalStage（研究级，curated-first）。
- **后置**：Multi Observer / World Model（ADR 未来方向，不现在实现）。

## 5. 验收（协议层面）

- 本 ADR 只定协议（DTO + 路线 + 不变量），**不含实现**。
- 实现验收在 v0.23 各阶段：`tsc` + `node --check` + mock（递增）全绿 + 提交/推送。
