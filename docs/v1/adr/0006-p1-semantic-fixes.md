# ADR-0006 · v0.14 P1 语义修正（Summary≠Lesson / confidence 维度化 / decision lineage）

> 时间：2026-09-06 ｜ 状态：已执行 ｜ 版本：v0.14
> 前置：ADR-0005（index.ts → 薄 Adapter）。本 ADR 执行 ADR-0003 §3 的三项 P1 语义修正（行为变化，非结构迁移）。

## 1. P1-1 Summary ≠ Lesson（core/experience.ts）

现状：`experienceOf` 把 `lesson`（教训）源到 `> 摘要：`（LLM 摘要）——把「发生了什么」错当「学到了什么」。

修正：
- `summary` ← `> 摘要：`（真正的摘要，LLM 一句话回顾）。
- `overview` ← `> 概况：`（动作/消息/决策计数，仍保留但改名，不再冒充 summary）。
- `lesson` ← 由裁决层派生（`lessonOf(verdict)`），不复用摘要。
- `renderExperience`：`概况 overview`、`摘要 summary`、`反思 reflection`、`教训 lesson` 四者分离呈现。

`lessonOf(v)`：superseded → 「同入口已被更新，引用前先查最新记忆」；evidence_stale → 「证据路径缺失，需重新验证后再引用」；evidence_live → 「结论仍有效」。

## 2. P1-2 confidence 维度化（retrieval/rank.ts / observer/arbitrate.ts）

现状：`confidenceOf` 返回单一玄数。

修正：返回 `ConfidenceDims { retrieval, evidence, experience, judgment, projection, overall }`：
- retrieval：命中次数/状态/年龄（原单值核心）。
- evidence：证据 status（active 0.8 / stale 0.4 / 其他 0.15）。
- experience：有无完整经验线索（>摘要/>概况 → 0.75，否则 0.45）。
- judgment：有无决策（>用户提示/决策 → 0.7，否则 0.4）。
- projection：Observer Lens 基数 0.6（投影总是部分可证伪）。
- overall：加权合成 `0.4 retrieval + 0.25 evidence + 0.15 experience + 0.1 judgment + 0.1 projection`。

`evidenceOf` 注入 opts；`provenanceText` 渲染 `置信 检索x/证据x/经验x/判断x/投影x（总x）`。

## 3. P1-3 superseded → decision lineage（observer/arbitrate.ts / query/query.ts）

现状：superseded = 同 entry 是否更新（布尔）。

修正：`lineageOf(entryMemories)` 把同一 entry 的记忆按时间排成修正确 `A→Correction→B→…`，保留每条的 `date/time/decision`（为何变化）。
- query 召回管线为每条记忆构建 `entryLineage` map，`s.evidence.lineage = lineageOf(...)`。
- `provenanceText` 当 lineage 长度 >1 时渲染 `修正链 <dates→…>`。

## 4. 约束 / 验收

- 行为**变化**（这是语义修正的题中之意），但外部工具面未变（仍单一 read_shadow）；仅 Experience/回收 provenance 呈现更细。
- 更新 mock：场景35（lesson 不再等于摘要，改断言 `摘要`+`教训 结论仍有效`+`概况`）；场景36（新增 `修正链` 断言）。其余场景不受影响。
- 验收：`tsc` + `node --check` + mock 1–42 全绿。

## 5. 遗留

- P1-4 Trace（中间层：Events → Trace → Memory → Experience）与 P2 各项（Derived Artifacts、scrub=presentation-only、asOf{timestamp,timezone}、Soul 下分 Identity/Values/… + Observer Lens）仍在 ADR-0003 §3，未在本 ADR（需各自立项）。
