# ADR-0105: `core/` G2 职责粗桶（retention / view / admission）

- 状态：**已接受** · 随 `v1.20.12` 落地
- 决定日期：2026-09-23
- 关联：**ADR-0102**（G1 前缀簇；明确非目标含 G2）· **ADR-0104**（同发版先落地的第五伞）·
  **T13** / [`tools/audit-layers.lib.ts`](../tools/audit-layers.lib.ts)
- 定位：**源码导航**。回答「`core/` 根上剩余单件怎么按职责粗分、`layerOf` 是否变」。
- 触发：前缀簇后根上仍约 31 个 `.ts`；grill 锁定 G2+S → O1 → B1 桶表 → R1。

## 1. Context

ADR-0102 只抽**共同前缀**簇，把无前缀包 / 硬塞的单件留给 G2。G2 = **职责粗桶**（导航），不是纯度层拆分。
`layerOf("core/retention/…")` **仍 = `core`**。

## 2. Decision

### 2.1 B1 成员表

| 目标 | 成员 |
|------|------|
| `core/retention/` | `memory` · `forget` · `collect` · `capture-granularity` · `lifecycle` · `served-hits` · `change-set` · `trace` |
| `core/view/` | `episode` · `experience` · `task` · `context` · `recall` · `abstract` · `node` · `resource` · `projection-store` |
| `core/admission/` | `proposal` · `decision-outcome` · `judgment` · `intent` · `authorization` |
| 并入已有 `core/candidate/` | `index-engine` · `semble` |
| **根上留** | `paths` · `util` · `types` · `fs-scope` · `scope` · `manifest` · `polarity` |

已有前缀簇不动：`writer/` · `knowledge/` · `lineage/` · `toolset/`。

### 2.2 `layerOf` 不变

路径第一段仍是 `core` ⇒ `DIRECTION_RULES` / `PURE_MODULES`（根上纯模块）语义不变。

## 3. Consequences

- import / `dist/` / 当前态活路径随迁；**不改** CHANGELOG 历史条目。
- 无行为变更。

## 4. Non-goals

- G3 一词一夹；拆 `{core, evidence, persistence}` 层间环；把粗桶写成结构层；动 `query/`。
