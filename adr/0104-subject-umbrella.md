# ADR-0104: 第五导航伞 `subject`（soul / observer）

- 状态：**已接受** · 随 `v1.20.12` 落地
- 决定日期：2026-09-23
- 关联：**ADR-0101** / **ADR-0103**（导航伞；伞 ≠ 层）· **T13** /
  [`tools/audit-layers.lib.ts`](../tools/audit-layers.lib.ts) · **ADR-0049**
- 定位：**源码导航**。回答「根上 `soul`/`observer` 怎么收、第五伞叫什么、与 `selfhood` 如何对仗」。
- 触发：第四伞后 BACKLOG 下一刀候选；grill 锁定 G2+S → O1（先 S）→ S1 → N1 `subject` → R1。

## 1. Context

`soul` = curated 锚（人改源头）；`observer` = 「谁在看」主体根。文档里常成对出现（投影把灵魂当透镜）。
`selfhood`（ADR-0103）已收时间切片链；这一伞收**锚与根**，二者对仗、不得糊成一层。

## 2. Decision

### 2.1 伞名与成员（S1 + N1）

| 伞 | 叶子 |
|----|------|
| `subject/` | `soul`, `observer` |

- **`subject`**：主体 = curated 灵魂锚 + Observer 根。**≠** `selfhood`（切片连续）；**≠** personality。
- **本轮不收**：`reflection` / `decision` / `evidence` / `security`。

### 2.2 `layerOf`（与 ADR-0101 同形）

`MODE_FAMILY_UMBRELLAS` 含 `subject`：
`layerOf("subject/soul/…")` = `soul`；`observer` 同理。

### 2.3 数据路径不动

只迁源码。`.shadow/` 下 soul/observer 相关落盘布局不变。

## 3. Consequences

- import / `dist/` / 当前态活路径随迁。
- 同发版随后做 G2（ADR-0105）。
- 无行为变更。

## 4. Non-goals

- 把 `reflection` 塞进本伞；G2；改 mode / 召回；追溯改归档层旧路径。
