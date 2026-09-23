# ADR-0101: Mode-family 三伞收编（stance / trajectory / epistemic）

- 状态：**已接受** · 随 `v1.20.8` 落地
- 决定日期：2026-09-23
- 关联：**T13** / [`tools/audit-layers.lib.ts`](../tools/audit-layers.lib.ts)（结构门：判据来自实测，**目录名 ≠ 纯度边界**）·
  **ADR-0049**（缺件不静默）
- 定位：**源码导航**。回答「顶层 mode-family 平铺怎么收、伞是不是层、`layerOf` 怎么改」。
- 触发：源码顶层域目录过多、难扫；grill-with-docs 锁定 C（先动顶层）→ M2（伞 + `layerOf` 第二段）→ 三伞成员表 → R1（ADR + PATCH）。

## 1. Context

顶层曾并列约 25 个域目录（含 `agency` / `delegation` / `federation` / …）。
它们是 **mode-family 实现包**（`query/*.ts` 分派面仍在 `query/`），不是另一套 mode 契约。

结构门（T13）已证明：**不能**用「目录名 = 纯度层」当判据（`core/` 是混合脊柱）。
故收编必须满足：搬家后 **叶子层名不变** ⇒ `DIRECTION_RULES` / 所有权报告语义不变。

## 2. Decision

### 2.1 三伞（导航，不是层）

| 伞 | 叶子 |
|----|------|
| `stance/` | `agency`, `delegation`, `planning` |
| `trajectory/` | `continuity`, `recall`, `adaptation`, `long-horizon` |
| `epistemic/` | `federation`, `reality`, `world`, `validation`, `verification`, `simulation`, `action` |

### 2.2 `layerOf` 看第二段

`MODE_FAMILY_UMBRELLAS = ["stance","trajectory","epistemic"]`：
路径落在伞下时，层名 = **第二段**（叶子）；否则仍第一段 / `(root)`。

伞**不是**结构层；禁止把 `stance ↛ query` 这类规则写进方向表（没有实测依据）。

### 2.3 本轮明确不收

根下保留：`core` / `query` / `retrieval` / `persistence` / `observer` / `soul` / `evidence` /
`identity` / `dream` / `temporal` / `reflection` / `security` / `decision`。
不并进 `query/`；不改 mode 名 / schema / 召回逻辑；不碰 `core/` 内平铺。

## 3. Consequences

- import 与 `test/` 的 `dist/<leaf>/` 改为 `dist/<umbrella>/<leaf>/`。
- CONTEXT 登记三伞为**导航术语**；mode 表「族（源码）」仍指 `query/…`。
- 无行为变更；验证走完整 `verify`。

## 4. Non-goals

- M1 全表映射、第四伞、`core/` 再分组、`identity|dream|temporal` 再嵌套。
- 追溯改 `CHANGELOG` / 冻结 ADR 正文里的旧路径。
