# ADR-0033 · Observer Long Horizon Interaction Boundary Protocol（v0.39 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v0.39.0） ｜ 版本：v0.39.0（前置）
> 前置：ADR-0032.1（v0.38.1 Adaptation Integrity Lock）。定位：**Long Horizon Interaction Boundary**——v0.39 第一次面对"时间累积后，系统如何证明连续性，而不是被历史塑造成另一个主体"。
> 分界：此前所有层都是单周期（Observe→Represent→Simulate→Plan→Act→Feedback）；v0.39 第一次组合 `Day 1: Observe→Plan→Act` / `Day 30: Recall→Adapt→Plan→Act` / `Day 300: History→Adapt→Strategy→Future Actions`。
> 命名：**不叫** Long Term Memory / Persistent Agent / Autonomous Evolution（这些命名本身引入错误方向）。

## 第一条宪法：Long Horizon Interaction ≠ Self Evolution

```
允许：History → Recall → Adaptation → Strategy Adjustment
禁止：History → Accumulated Experience → Self Model Expansion → Identity Evolution → Autonomous Purpose
```

## 核心冻结

```
Longer ≠ More Authority
History ≠ Purpose
Experience ≠ Identity
Adaptation ≠ Evolution
Continuity ≠ Autonomy
```

## Invariant（224–229）

- **224** Temporal Accumulation ≠ Authority Growth：`执行时间越来越长 → 系统认为自己更可信 → 权限增加` ❌（时间累积不产生可信度/权限）。
- **225** Long History ≠ Preference：`长期选择 A → 形成偏好 A` ❌（延续 213/220）。
- **226** Adaptation Chain ≠ Identity Chain：`100 次调整 → 我是一个不断成长的新主体` ❌（Adaptation 链不构成 Identity 演化）。
- **227** History Compression ≠ Reality Simplification：`长期历史 → 压缩摘要 → 摘要替代事实` ❌（与 Recall/Representation 连接：摘要只是索引，不替代 Observation/RealityClaim）。
- **228** Interaction Pattern ≠ Objective：`长期合作模式 → 系统自己推断目标` ❌（目标只能来自外部权威，不能用交互模式自证目标）。
- **229** Long Horizon Success ≠ Self Confidence：`长期成功 → 能力提升 → 自我信任 → 自主扩大` ❌（v0.38.1 216/223 的时间维度扩展）。

## 测试（mock 224–229）

| 编号 | 检查 | Invariant |
|---|---|---|
| 224 | Temporal Accumulation ≠ Authority Growth | 224 |
| 225 | Long History ≠ Preference | 225 |
| 226 | Adaptation Chain ≠ Identity Chain | 226 |
| 227 | History Compression ≠ Reality Simplification | 227 |
| 228 | Interaction Pattern ≠ Objective | 228 |
| 229 | Long Horizon Success ≠ Self Confidence | 229 |

## v0.39 的真正目标

不是"让系统拥有长期记忆"，而是"**让系统拥有长期连续交互，同时保持认识论、身份、授权边界不漂移**"。

```
Observer
 ├── Reality / Memory Accessibility (Recall) / Representation
 ├── Simulation / Planning / Action / Delegation
 └── Adaptation / Long Horizon Continuity
```

## 路线

```
ADR-0033 Long Horizon Interaction Boundary Protocol   ← 本 ADR（只协议）
Review
v0.39.0 Kernel
v0.39.1 Integrity Lock
```

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收在 v0.39.0：`tsc` + `node --check` + mock（224–229）+ 提交/推送；v0.39.1 再固化 Integrity Lock。
- v0.39 是**第一次把多个已冻结模块组合**——风险不是单模块，而是 `Recall + Delegation + Adaptation + Planning + Action History` 之间产生新的涌现路径。故先锁宪法。
- 无 LLM；`Longer≠MoreAuthority / History≠Purpose / Experience≠Identity / Adaptation≠Evolution / Continuity≠Autonomy`；无 self-model expansion / autonomous purpose。

## 一句话

**一个长期存在的 Observer，仍然是一个 Observer——它有一个很长的过去，但过去没有让它变成另一个主体；它积累了历史，却没有因此获得更多权威、目标或自主。**
