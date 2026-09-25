# ADR-0102: `core/` 前缀簇收编（导航，不是层）

- 状态：**已接受** · 随 `v1.20.9` 落地
- 决定日期：2026-09-23
- 关联：**ADR-0101**（mode-family 三伞；导航 ≠ 层）· **T13** / [`tools/audit-layers.lib.ts`](../tools/audit-layers.lib.ts)（`core/` 是混合脊柱）
- 定位：**源码导航**。回答「`core/` 47 平铺怎么收、为何只抽前缀簇、`layerOf` 是否变」。
- 触发：三伞落地后最大平铺仍在 `core/`；grill-with-docs 锁定 C（本轮只动 core）→ G1（前缀簇）→ M1（成员表）→ R1（ADR + PATCH）。

## 1. Context

`core/` 曾约  `.ts` 平铺。其中多组已用**共同前缀**成簇（`writer-*` / `knowledge-*` / …），
其余是混合脊柱上的单件（`memory` / `forget` / `paths` / …）。

T13 已证明：不得把「目录名 = 纯度层」写成门。故本轮收编**只改导航路径**，
`layerOf("core/writer/…")` **仍 = `core`**。

## 2. Decision

### 2.1 G1 + M1：只抽前缀簇（ → 5 子目录）

| 子目录 | 成员（去前缀后） |
|--------|------------------|
| `core/writer/` | `index`, `capture`, `core`, `llm`, `materialize`, `render` |
| `core/knowledge/` | `cost`, `engine`, `retrieval`, `structure` |
| `core/lineage/` | `index`, `validator` |
| `core/candidate/` | `provider`, `sqlite` |
| `core/toolset/` | `index`, `exec` |

**明确不进桶**：`collect` / `capture-granularity` / `memory` / `forget`（无共同前缀包 / 硬塞 = 开始做 G2 职责分类）。

### 2.2 `layerOf` 不变

路径第一段仍是 `core` ⇒ `DIRECTION_RULES` / `PURE_MODULES`（仍在 `core/` 根的那几个）语义与路径声明均无需为「层」而改。

## 3. Consequences

- import / `dist/` / 当前态文档活路径随迁；**不改** CHANGELOG 历史条目里的旧路径。
- BACKLOG 记下下一刀候选：**B**（根上 `identity` / `dream` / `temporal` 等第四伞）。
- 无行为变更。

## 4. Non-goals

- G2 职责粗桶、G3 一词一夹、本轮第四伞、改 mode / 召回逻辑。
