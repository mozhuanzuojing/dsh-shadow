# ADR-0103: 第四导航伞 `selfhood`（identity / dream / temporal）

- 状态：**已接受** · 随 `v1.20.11` 落地
- 决定日期：2026-09-23
- 关联：**ADR-0101**（mode-family 三伞；导航 ≠ 层）· **ADR-0102**（`core/` 前缀簇）·
  **T13** / [`tools/audit-layers.lib.ts`](../tools/audit-layers.lib.ts) · **ADR-0049**（缺件不静默）
- 定位：**源码导航**。回答「根上剩余小域怎么收、第四伞叫什么、成员边界、`layerOf` 是否同形」。
- 触发：三伞 + `core/` 前缀簇后顶层仍散；grill-with-docs 锁定 B → M1 → N1 `selfhood` → L1 → R1。

## 1. Context

根上仍并列 `identity` / `dream` / `temporal`（及 `soul` / `observer` 等）。
前三者文件头与 mode 表同属 **Observer Continuity** 链：时间图 → 离线压缩 → 身份切片推进。

ADR-0101 已规定：导航伞下 `layerOf` 取第二段，叶子层名不变。本轮必须同形，不得把伞写成结构层。

## 2. Decision

### 2.1 伞名与成员（M1 + N1）

| 伞 | 叶子 |
|----|------|
| `selfhood/` | `identity`, `dream`, `temporal` |

- **`selfhood`**：观察者自我在时间上的连续（切片身份 / 时间图 / 离线压缩）。
  **≠** personality / 人格结论；**≠** `soul` curated 锚（人改的源头仍在根上 `soul/`）。
- **本轮不收**：`soul` / `observer` / `reflection` / `decision` / `security`（锚、主体根、上游候选、原语引擎、呈现清洗 —— 塞进同一伞 = 杂物抽屉）。

### 2.2 `layerOf`（L1，与 ADR-0101 同形）

`MODE_FAMILY_UMBRELLAS` 含 `selfhood`：
`layerOf("selfhood/identity/…")` = `identity`（dream / temporal 同理）。

伞不是结构层；禁止写 `selfhood ↛ query` 这类无实测依据的方向规则。

### 2.3 数据路径不动

只迁**源码**目录。`.shadow/identity/` · `.shadow/temporal/` · `.shadow/dream/` 等落盘布局**不变**。

## 3. Consequences

- import / `dist/` / 当前态文档活路径：`dist/<leaf>/` → `dist/selfhood/<leaf>/`。
- CONTEXT 登记 `selfhood` 为导航术语；BACKLOG T13 进度 B 勾第四伞已做。
- 无行为变更；验证走完整 `verify`。

## 4. Non-goals

- G2 `core/` 职责粗桶；收编 `soul`/`observer`；改 mode / schema / 召回；改 `.shadow/` 布局。
- 追溯改 `CHANGELOG` / 冻结 ADR 正文里的旧路径。
