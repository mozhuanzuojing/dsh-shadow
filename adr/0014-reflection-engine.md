# ADR-0014 · v0.24 Reflection Engine（Candidate Generator）

> 时间：2026-09-07 ｜ 状态：已执行 ｜ 版本：v0.24.0
> 前置：ADR-0013（协议）。落 v0.24：`ObservationTrace[] → Pattern Extraction → Candidate Reflection`，只产 `candidate`。

## 1. 四点范围（按裁定）

1. **不当主入口**：Reflection 是旁支，用 `read_shadow({mode:"reflection"})`（非 `reflect:true` 布尔），避免诱导当 Memory 查询。
2. **Trace Completeness 质量闸门**：`completenessOf(trace)` → `{hasProjection,hasDecision,hasOutcome,reflectionEligible}`；**只有 decision+outcome 齐备的轨迹参与 Reflection**，不完整轨迹跳过（Reflection 不编故事）。
3. **Pattern Engine 独立**：`reflection/patterns/{decision-outcome,success-rate,distortion}.ts`，供 v0.26 Dream 复用。
4. **不生成 Candidate Identity Change**：v0.24 只产 `status:"candidate"` 结束；Identity 写回留 v0.25。

## 2. 目录 / 结构

```
reflection/
  types.ts      # Reflection DTO + ReflectionStatus + TraceCompleteness + completenessOf
  engine.ts     # reflectTraces(纯计算) / reflectOf(读轨迹→反思→写 shadow/reflection/<date>/<id>.md) / renderReflection
  patterns/
    decision-outcome.ts   # Pattern 1 重复决策/结果（出现≥2）
    success-rate.ts       # Pattern 2 decision→outcome 相关性 + successRate（正/负标记集确定性判定）
    distortion.ts         # Pattern 3 projection.hidden→outcome.actual → 低估/漏看偏差
```

## 3. Pattern 提取（无 AI）

- 重复决策/结果（计数≥2）；decision→outcome correlation（count + successRate）；distortion（hidden 关键词出现在 actual）。
- `learning.type = principle|anti_pattern|unknown`：取 count≥3 的 top 相关性，successRate≥0.6→principle、<0.4→anti_pattern、否则 unknown。**规则模板生成 statement，非启发式人格判断**。
- `confidence.score = min(0.95, 0.4 + successRate*0.4)`，reasons 含轨迹数与观察次数。

## 4. 存储

`shadow/reflection/<date>/<reflection-id>.md`（Reflection ≠ Memory；旁支）。`listMemories` 跳非日期目录，不误采集。

## 5. 校验

- `tsc` + `node --check` 通过；mock 场景 **1–54** 全量 PASS（新增 51 重复成功→principle / 52 失败→anti-pattern / 53 hidden→actual→distortion / 54 不完整 trace 不参与）。
- 原 1–50 不变。

## 6. 冻结（v0.24 不做）

❌ Identity 写回 ❌ Taste 更新 ❌ Dream ❌ LLM ❌ 自动人格判断 ❌ 情绪分析

## 7. 演进

```
ObservationTrace → Reflection(candidate) → [v0.25 Identity Evolution]
```
