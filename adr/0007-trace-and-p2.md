# ADR-0007 · v0.14 Trace 中间层 + P2 语义项

> 时间：2026-09-06 ｜ 状态：已执行 ｜ 版本：v0.14
> 前置：ADR-0006（P1 语义修正完成）。本 ADR 落地 P1-4（Trace）与四项 P2 语义项。

## 1. P1-4 Trace 中间层（core/trace.ts / core/types.ts / core/writer.ts）

ADR-0003 §3-5：新增 Trace 中间层 `World/DSH Events → Trace → Memory → Experience`。

- `core/types.ts`：`Trace` DTO（`seq/at/kind/actor/comp/text/sub/source`）。
- `core/trace.ts`：`traceOf(records, actorId)` 把 pending 记录归一化为有序、typed 的 `Trace[]`（纯数据、无副作用）。
- `core/writer.ts`：flush 在塑形正文前先 `traceOf(arr, id)` 生成 Trace，再据 Trace 生成 `- [at] [comp] text` 行（输出与先前一致）。
- 意义：采集源从此有显式的中间表示，Memory 从 Trace 塑形，不再直接吃原始事件；写侧行为不变（mock 写入场景 1–14 全绿）。

## 2. P2-9 asOf v2（query/query.ts / retrieval/render.ts）

ADR-0003 §3-9：Observer 时间锚定从单一 `YYYY-MM-DD` 升级为 `{ timestamp, timezone }` 对象形态。

- `parseAsOf`：接受 date 串或 `{ timestamp, timezone }` 对象；主过滤仍按 date（记忆按日期归档），timestamp/timezone 供窗口展示与语义锚定。
- render 的 `窗口 ≤` 用 `asOf.date`。

## 3. P2-10 Soul taxonomy + Observer Lens（soul/soul.ts）

ADR-0003 §3-10：Soul Kernel 下分 `Identity/Values/Principles/Taste/Boundaries` + **Observer Lens**（工程化投影，非"灵魂数据库"）。

- `soulText` 保留 身份/价值观/原则/品味/边界 渲染，新增一段「curated 工程化投影……可证伪、不宣称全知」澄清 + `Observer Lens {…}` 行（默认五维全开，可经 `soul.observerLens` 掩蔽）。

## 4. P2-7 Derived Artifacts（persistence/meta.ts / retrieval/ledger.ts）

ADR-0003 §3-7：`_index.md`/`_meta.json`/`_recall_log.json` 是派生物；Memory 文件是 source of truth；坏了用 rebuild-index 重建。
- 在 meta.ts / ledger.ts 头注释固化「派生约定」，不改变读写逻辑（代码本就幂等可重建）。

## 5. 验收

- `tsc` + `node --check` 通过；mock 场景 1–42 全绿（asOf 对象形态兼容，Scene 34/37 仍绿）。
- 外部 read_shadow 工具面未变；仅 Soul 输出多一段澄清、Observer 窗口支持对象 asOf。

## 6. 遗留

- P2-8 scrub=presentation-only（原样保留 scrubFinal 于渲染层；canonical evidence 不 scrub 已在实现中满足，未新增 DTO）。
- zg 真机集成（需装 @zvec/zvec-grep）；Observation Model 研究（research 前沿）。
