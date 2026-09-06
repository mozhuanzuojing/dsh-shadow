# ADR-0005 · v0.14 Phase 5b：写侧采集内核抽取（index.ts → 薄 Adapter）

> 时间：2026-09-06 ｜ 状态：已执行 ｜ 版本：v0.14
> 前置：ADR-0004（读侧 query/router 已抽出，index.ts 642→428）。ADR-0004 §6 把「写侧 flush/push 收敛」留待后续——本 ADR 即该后续。

## 1. 目标

把 index.ts 里剩余的**写侧采集基础设施**抽出，使 index.ts 成为名副其实的 ~200 行（实际 **124 行**）Cordis Adapter：
只保留 config 解析 + 事件接线 + 工具注册 + systemPrompt。写侧领域逻辑整体迁入 `core/writer.ts`。

## 2. 迁移（index.ts 顶层名 → core/writer.ts）

| 迁移对象 | 原位置 | 落点 |
|---|---|---|
| `lastFlushError`, `MAX_PENDING` | index 内部 state | `createShadowCollector` 内部 |
| `initiatorId`, `agentIdOf` | index 内部 | writer 内部 |
| `pending`, `comps`, `cwdBySession`, `goalByAgent` | index 内部 state | writer 内部（`cwdBySession` 经返回值暴露给查询） |
| `push`, `primaryComp` | index 内部 | writer 内部 |
| `summaryCfg`, `recallCfg`, `retentionCfg`, `writeConsent` | index 内部 | writer 内部 |
| `routeFor`, `summarizeTurn` | index 内部 | writer 内部 |
| `buildIndexText`, `rebuildIndex`, `patchSummary` | index 内部 | writer 内部 |
| `flush` | index 内部 | writer 内部 |
| 事件 handler（fs/observed、tools/result、goal/changed、session/event、agent/turn-stopping、session/flush） | index 内部 | writer 返回 `onXxx`，index 只 `context.on(...)` 绑定 |
| `expandTerms` | index 内部 | writer 返回，经 queryDeps 注入 |
| `getFlushWarn` | index 内部 | writer 返回，经 queryDeps 注入 |
| `verifyEvidence` | index 内部 | **留在 index**（引用 config.evidenceProvider/evidenceProviders，属 Adapter 配置路由） |

## 3. index.ts（Adapter，124 行）现状

- `config` 解析；`getAgentById`（context.get("agents")）；`createShadowCollector({context, config, getAgentById})`。
- `context.on(...)` 六个事件全部绑定到 collector 返回的 handler（只绑定，不实现逻辑）。
- `verifyEvidence = (ref, ctx) => routeVerify(ref, ctx, config.evidenceProvider || "fs", config.evidenceProviders)`。
- `queryDeps = { fs, config, cwdBySession: collector.cwdBySession, getFlushWarn: collector.getFlushWarn, verifyEvidence, expandTerms: collector.expandTerms }`。
- `context.inject(["tools"])` 注册 read_shadow（execute 调 `runReadShadow(queryDeps, args, exec)`）。
- `context.inject(["systemPrompt"])` 注入提示。
- `return collector.cleanup`（清空 pending/comps）。

## 4. 边界 / 约束

- `cwdBySession` 由 writer 持有，`ReadonlyMap` 返回给 queryDeps（读侧只为 resolveWorkspace 读取，不写）。
- 闭包型依赖（`verifyEvidence`/`expandTerms`/`getFlushWarn`）仍由 index 构造并经 `queryDeps` 注入——这是 Adapter 的职责，query 不直接读 context。
- **行为不变**：所有写侧逻辑逐字搬移（push/flush/buildIndex 等），mock 场景 1–42 全绿作为回归护栏。
- 外部 API 未变：仍是单一 `read_shadow` 工具。

## 5. 执行与验收

- 步骤：① 建 `core/writer.ts`（createShadowCollector，搬入全部写侧逻辑）→ ② index.ts 改为 Adapter（`getAgentById` + `createShadowCollector` + 事件绑定 + queryDeps + 工具/提示注册）→ ③ `tsc` + `node --check` + mock 1–42 全绿。
- 验收：`index.ts` **124 LOC**（目标 ~200）；`core/writer.ts` 366 LOC；mock 全部通过；read_shadow 外部行为不变。

## 6. 取舍 / 遗留

- writer.ts 366 行仍偏大，但它是**单一职责的写侧采集状态机**（状态 + push/flush + LLM 闭包），内聚可接受；若继续拆可把 summarization/索引物化再分文件，但收益递减，暂不做。
- 事件 handler 已从 index 迁出（ADR-0003 §2 建议「index 只负责 on() 绑定」）；index.ts 现已满足该目标。
- P1 语义修正（Summary≠Lesson / confidence 维度拆分 / lineage / Trace）与 P2（Derived Artifacts、scrub=presentation-only、asOf{timestamp,timezone}）仍是 ADR-0003 §3 的后续项，未在本 ADR 做（非结构迁移，属功能增强，另立项）。
