# ADR-0008 · v0.20 Observer Kernel（Observer 成为根）

> 时间：2026-09-07 ｜ 状态：已执行 ｜ 版本：v0.20.0（G1）
> 前置：ADR-0007。定位：dsh-shadow 不是 Memory，而是 **Observer → Projection → Experience → Evidence → Judgment** 的人工投影系统。Memory 只是其中一个器官。

## 1. 核心判断

把根从 Memory 翻成 **Observer（谁在看 + 为什么看 + 从哪层看）**。Observer 不产生内容，只定义"从哪里看"。当前 README/MEMORY 已把定位语改为「人工观测投影引擎」。

## 2. 三个架构微调（按审查裁定）

1. **Identity 是实体，不嵌入 ObserverContext**：`Identity`（长期主体）与 `ObserverContext`（一次观察事件）生命周期不同。Context 用 `identityRef` 指向 Identity，经 resolveObserver 加载；避免"每次观察打包一份灵魂"污染历史。
2. **Intent 升级为 Goal-Oriented**：`Intent { goal, question, desiredOutcome?, constraints? }`（人观察世界不是随机——"我要改变什么"）。
3. **ObserverContext 增加 `realityAnchor`**：`known-at-time / current / historical`——"当前观察锁定在哪个现实层"。

## 3. 新增 DTO / 模块

- `core/types.ts`：`Identity`、`Intent`、`RealityAnchor`、`ObserverContext`。
- `soul/identity.ts`：`readIdentity(fs, ws, fallbackId)`（读 soul.json identity/principles/boundaries + anti_patterns/decision_style/observerLens）、`renderIdentity`。
- `core/intent.ts`：`intentOf(args, topic)`（按 read_shadow 的 mode/topic 合成 Goal-Oriented Intent）、`renderIntent`。
- `observer/core.ts`：`observerContextOf(args, topic, identity, agentId)`、`renderObserverContext`。
- `observer/projection.ts`：`projectContext` 增可选 `lens` 覆盖（soul.observer 或注入 lens），返回加 `visible`/`hidden`；`renderProjection` 加 `observer/lens/intent` 行 + `visible/hidden` 行。
- `core/util.ts`：`parseAsOf` 移入共用（query/observer 共享）。
- `query/query.ts`：新增 `{identity:true}`、`{context:true}` 分支；project 分支读 Identity + ObserverContext，用 lens 覆盖投影，task 取 `intent.goal + intent.question`。

## 4. read_shadow 新参数

`identity` / `context` / `goal` / `realityAnchor` / `lens`（详见 index.ts 工具 schema）。外部仍是单一 `read_shadow` 工具。

## 5. 验收

- `tsc` + `node --check` 通过；mock 场景 **1–45** 全量 PASS（新增 43 Identity / 44 ObserverContext+Intent+realityAnchor / 45 Observer 一致性：同一事实、不同透镜 → 不同 visible/hidden）。
- 原 1–42 不变；Evidence/recall 渲染未动（judgment 的"observer 决定"留待 G2）。

## 6. 路线（下一阶段，我执行 G3 → G2）

```
v0.20 Observer Kernel   ✅ 本 ADR
v0.21 RealityProjection  （distortion/excludedReason；接入 Intent 目标导向）
v0.22 Judgment           （Evidence 是输入，Observer 决定 Judgment；zg 作 EvidenceProvider）
v0.23 Reflection         （Offline Reflection Engine：压缩/模式发现/原则沉淀，确定性优先）
```
