# ADR-0012 · v0.23 Observation Trace（Observer 记录"我当时怎么看见"）

> 时间：2026-09-07 ｜ 状态：已执行 ｜ 版本：v0.23.0
> 前置：ADR-0011（Phase II 协议）。本 ADR 落 v0.23：只做记录观察轨迹，不做 Reflection/学习/总结。

## 1. 目标

让系统第一次拥有"我当时是如何看见这个世界的"可回放记录。**不是 Reflection、不是学习、不是总结**——只是记录观察轨迹（旁路记录，不影响 recall/排序/答案）。

## 2. 核心分离

```
Experience        = 发生了什么
ObservationTrace  = 我怎么看见发生的
```
二者必须分离。ObservationTrace 挂在 Observer 下，对象是观察事件（ObserverContext + Projection），不是 Experience。

## 3. 新增

- `core/types.ts`：`ObservationTrace`（id/observerId/createdAt/realityAnchor/intent/projection{visible,hidden,distortion}/decision?/outcome?/uncertainty{level,reasons}/metadata{source}/state?）、`ObserverState{energy,focus,uncertainty,goalStage}`、`ObserverContext.state?`。
- `observer/trace.ts`：`recordObservationTrace`（写 `shadow/observation/<date>/<id>.md`，旁路、静默降级）、`renderObservationTrace`。**存储不在 memory/**（`shadow/observation/`；listMemories 跳过非日期目录，不会当记忆采集）。
- `observer/state.ts`：`readObserverState(fs, ws, soul, argsState)`——**只读取、不自动推断**（energy/focus/goalStage 来自 soul.json 或 args.state 注入；禁止根据聊天/语言推断人格状态，会污染 Observer）。
- `observer/core.ts`：`observerContextOf` 增 `state` 承载。
- `query/query.ts`：project 路径与主 recall 路径各 record 一条 ObservationTrace（旁路，含 state）；`{context:true}` 展示 state。

## 4. read_shadow 生命周期（v0.23 加一点）

```
request → ObserverContext → Projection → ObservationTrace → Recall → Render
```
ObservationTrace 是**旁路记录**：不影响 recall、不影响排序、不影响答案（否则又退化成 memory）。

## 5. 冻结（v0.23 不做）

❌ Reflection ❌ Pattern discovery ❌ Identity update ❌ Dream ❌ LLM ❌ 自动 ObserverState 推断 ❌ Multi Observer

## 6. 验收

- `tsc` + `node --check` 通过；mock 场景 **1–50** 全量 PASS（新增 48 同一事实不同透镜→不同 trace visible / 49 asOf 回放·未来不污染过去 / 50 state 注入进 trace 但不影响事实）。
- 原 1–47 不变。

## 7. 路线

```
v0.23 Observation Trace    ✅ 本 ADR
v0.24 Reflection Engine     （确定性 pattern 提取 + 规则模板，无 LLM）
v0.25 Identity Evolution    （Identity 时间线，经 Candidate Identity Change 确认）
v0.26 Dream Engine          （Hypothesis 输出，Dream≠Fact）
```
