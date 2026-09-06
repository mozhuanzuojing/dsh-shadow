# ADR-0009 · v0.21 RealityProjection

> 时间：2026-09-07 ｜ 状态：已执行 ｜ 版本：v0.21.0（G3）
> 前置：ADR-0008（Observer Kernel G1）。按路线 G1 → G3 → G2，本 ADR 是 G3。

## 1. 判断

Projection 不是"相关排名"，而是"**为什么这个视角看到这些/没看到那些**"。人读取的是世界经自身观察窗口后的投影，必须带 `distortion`。

## 2. RealityProjection 结构

`projectContext` 返回升级为（在既有 `rel/experiences/principles/taste/unc/excl/visible/hidden` 基础上加）：

| 字段 | 含义 |
|---|---|
| `distortion` | `{ reason, byIntent? }`：为什么这个视角看到这些 / 没看到那些（从透镜 preferred/avoided 或 identity.decision_style 派生，**非 LLM 黑箱**）。 |
| `excludedReason` | `{ 记忆名: 原因 }`：每条 excluded 的排除原因（与任务不匹配 / 被观察透镜规避）。 |
| `reality` | `{ total, task }`：底层事实（候选总数）+ 任务——"现实" vs "观察窗口"的对照。 |

`renderProjection` 段头改为 `[RealityProjection]`，输出 `distortion:` / `excluded_reason:` 行。

## 3. 接线

- `query/query.ts` project 分支把 `identity` + `ctx.intent` 传入 `projectContext`；task 取 `intent.goal + intent.question`；透镜覆盖 `identity.observerLens || args.lens`。
- 外部仍是单一 `read_shadow(topic, {project:true, goal?, lens?})`。

## 4. 验收

- `tsc` + `node --check` 通过；mock 场景 **1–46** 全量 PASS（新增 46 RealityProjection/distortion/excluded_reason；场景 38 段头改 `[RealityProjection]`）。
- 原 1–45 不变。

## 5. 路线

```
v0.20 Observer Kernel        ✅ ADR-0008
v0.21 RealityProjection      ✅ 本 ADR
v0.22 Judgment               （Evidence 是输入，Observer 决定 Judgment；zg 作 EvidenceProvider）
v0.23 Reflection             （Offline Reflection Engine：压缩/模式发现/原则沉淀，确定性优先）
```
