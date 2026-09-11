# ADR-0063: 认知门（AtomKind gate）的可达性与读路径可见性分歧；`pinned`/`archived` 无入口

- 状态：**已接受（分诊结论）；其中「怎么处置认知门」待用户裁决（待办 D5）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0003（Derived Artifact：`_meta.json` 可重建）、ADR-0044/0045/0046（Evidence Gate 与 Lineage Validator）、ADR-0061（取代生命周期回填）、ADR-0062（接线审计工具）
- 关联待办：`../BACKLOG.md` 的 **T3（已结案）**、**D4**、**D5（本 ADR 新增）**、T1/T2
- 版本：`1.15.22`

## Context

ADR-0062 造的接线审计工具在 T1/T2 分诊里报了两条**看起来是噪声、实则同源**的线索：

```
A 类：isCognitiveAtom        core/episode.ts      测试引用 1
A 类：isMetadataMemoryText   core/episode.ts      测试引用 1
B 类：kind=session           core/lineage-validator.ts:18
B 类：status=archived        core/forget.ts:18, core/lifecycle.ts:28
```

本轮把这几条**逐条追到根**，用真语料（`D:\project\dsh1\.shadow`，实测 6960 条记忆）测量，
而不是停在静态线索上。

## Decision

### 1. `deriveAtomKind` 会产出 `metadata`，但 **`session` / `artifact` 全仓无生产者**

`AtomKind` 声明 5 个值（`core/lineage.ts:14`：`experience | metadata | session | task | artifact`），
而唯一生产者 `deriveAtomKind`（`core/episode.ts`）覆盖全部分支后只能产出 3 个：

- **实测**（探针覆盖全部分支：决策 / 目标 / todo 词 / 无材料且 `entry==="shadow"` / 无材料且有用户话 / 有材料）：
  可产出 `{experience, metadata, task}`；**`session` 与 `artifact` 从未产出**。
- ⇒ `core/lineage-validator.ts:18` 的 `kind === "session"` 那一支**永不可达**。
  保留该分支无害（前瞻或遗漏），但**不得据它推论「session 原子被挡住了」**。
- 复核：`node _research/measure-path-visibility.ts`（本文件末尾亦给出等价探针）。

### 2. **两个「认知门」函数在生产中零调用点**，真正生效的是第三份实现

| 实现 | 口径 | 生产调用点 | 真语料实测判为 metadata |
|---|---|---|---|
| `isCognitiveAtom`（`core/episode.ts`） | 按 `kind` | **无** | 4137 条（若接线） |
| `isMetadataMemoryText`（`core/episode.ts`） | 按**文本启发式**（`entry==="shadow"` + 有用户要点 + 无材料 + 无决策） | **无** | **110 条** |
| `validateAtomProjection`（`core/lineage-validator.ts:18`，由 `core/node.ts:48` 调用） | 按 `kind` | **有**（投影路径） | 4137 条（= 挡住 67.2% 的节点） |

⇒ **同一条规则有三份实现，两份从未接线，而三份口径互不相同**（文本启发式那份比 `kind` 那份**窄 37 倍**）。
这不是「接线断了」那么简单 —— 是**规则本身有多义**。

### 3. `entry === "shadow"` 不是「会话元数据」的信号，而是**写侧兜底字面量**

`deriveAtomKind` 第 4 行把 `p.entry === "shadow"` 当作「会话记账」的代理。但 `entry` 的来源是：

```ts
// core/writer-materialize.ts:175
const entry = hooks.primaryComp?.(id || "") || "shadow";
```

即 `"shadow"` = **`primaryComp` 取不到组件时的兜底值**，语义是「**没识别出组件**」，
不是「这是会话元数据」。后果用真语料量出来：

| 读数 | 值 |
|---|---|
| 全库记忆 | 6960 条 |
| `kind === "metadata"` | **4137 条（59.4%）**，**entry 全部是 `"shadow"`** |
| 其中**有实质内容**（有动作行 / 思维行 / 用户话） | **3903 条（94.4%）** |
| 主题召回路径（`query/query.ts:263-296`，**不做 kind 过滤**）可见 | 6960（全部） |
| `shadow_query` 路径（`deriveShadowNodes` → `validateAtomProjection`）可见 | **2283（32.8%）** |
| **两条读路径可见性差** | **4677 条（67.2%）** |

⇒ **同一份语料，主题召回看得见 100%，`shadow_query` 只看得见 32.8%。**
这不是理论问题，是本机真语料上的实测差。

### 4. `pinned` / `archived` 两个「人工权威状态」**无任何入口**（T3 结案）

- **`pinned` 恒 false**：生产只写 `pinned: false`（`core/memory.ts:74`、`core/writer-materialize.ts:88`、
  `query/query.ts:401`），**`pinned: true` 全仓零处**（三路 grep：字面量 / `pinned:` / `pinned =`）。
- **`archived` 无写入者**：`status: "archived"` 只见于 `core/forget.ts:18`、`core/lifecycle.ts:28`
  两个**读点**与 `retrieval/rank.ts:103` 的权重表。
- **判定：这是「已文档化但无入口的能力」，不是「接线断了」**。三条依据：
  1. **`_meta.json` 是 Derived Artifact**（ADR-0003）⇒ 手工编辑会被 `rebuild-index` 重建抹掉，
     「人来改 meta」不是设计上的入口；
  2. **没有任何命令 / 工具 / 元数据约定**能置这两个状态（工具面只有 `read_shadow` / `recall_shadow` /
     `shadow_query`，均无写侧动作）；
  3. **实现与设计声明不一致**：`MEMORY.md:90` 明写生命周期「从 meta 信号派生……**不做写侧硬状态迁移**、
     纯按信号推导」，而 `lifecycleOf` 的两条最前置判断读的恰恰是**写侧** `rec.status` / `rec.pinned`。
- **需一并处置的文档承诺**（行号逐个核实通过）：`README.md:35`、`README.md:177`、`README.md:178`、
  `MEMORY.md:90`、`CHANGELOG.md`（v0.7.0 条目）。
- **处置路径见 `BACKLOG.md` 的 D4**（补持久入口 / 改信号派生 / 纠正文档），**本 ADR 不单方面裁决**。

### 5. 本轮的**行为改动为零**

只做两件事：**在源码注释里标注实测事实**（`core/episode.ts`、`core/lineage-validator.ts`），
**加一个决策锁测试**（`test/atom-kind-gate.test.ts`，32 个测试中的第 32 个）。
**没有改 `deriveAtomKind` 的任何判断，没有接线任何函数，没有改 `validateAtomProjection` 的返回。**

理由：是否让 `metadata` 继续挡住 67.2% 的库，**是产品语义决策**，不是缺陷修复 ——
`metadata` 挡人的初衷（ADR-0044/0045：会话脚手架不该进认知查询）是对的，
错的是**「`entry === "shadow"`」这个代理信号**。改它等于改召回面，须用户拍板（D5）。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 直接把 `p.entry === "shadow"` 从 `deriveAtomKind` 里删掉 | 会**静默扩大召回面 3 倍**（4137 条 metadata 里的绝大多数会变成 `experience` 并进入投影）。这是产品语义变更，不是修 bug；本仓纪律：不静默改已冻结行为 |
| 把 `isCognitiveAtom` / `isMetadataMemoryText` 接进投影路径 | 会变成**三份实现同时生效**，口径冲突更严重（文本启发式那份少判 4027 条） |
| 删掉两个零调用点函数 | 它们记录了「这条规则曾经怎么想」，且测试在用；删除会丢决策痕迹。且到底该保留哪一份，取决于 D5 |
| 把 `session` / `artifact` 从 `AtomKind` 里删掉 | 类型是**契约声明**，可能被外部消费者引用；且「前瞻性声明」与「遗漏」在没有作者意图证据时不可区分。**只标注，不裁决** |
| 把 `pinned` / `archived` 顺手接上写入口 | 会把**外部权威状态**落在 **Derived Artifact**（`_meta.json`）上，与 ADR-0003 直接冲突；见 D4 |
| 不测量，只按静态线索写结论 | 那正是 ADR-0062 警告的「工具输出是线索不是结论」。本轮所有数字都来自真语料探针 |

## Consequences

### 正
- 把三条静态线索**落成可复现的实测数字**（6960 / 4137 / 110 / 2283 / 67.2%），并给出复核命令。
- 明确区分了三件此前混在一起的事：**规则多义**（三份实现）、**信号错误**（`entry === "shadow"`）、
  **能力无入口**（`pinned`/`archived`）。
- `AtomKind` 的「声明 5 值 / 生产 3 值」从隐性问题变成**有测试锁住的事实**（改它必红）。
- 源码注释就地记录实测与复核命令 —— 下一个改这里的人**不必重做测量**。

### 负 / 已知边界
- **未改行为**：67.2% 的可见性差**今天就存在**，本 ADR 只把它记下来。真正的修复等 D5 裁决。
- `test/atom-kind-gate.test.ts` 是**决策锁**而非不变量：D5 落地后必须同步改它，否则会假红。
  （已在测试文件与本文说明。）
- 「两份零调用点函数该保留哪一份」**未定**（属 D5）。
- 探针只覆盖 `deriveAtomKind` 的**已知分支**；若将来新增分支，`3/5` 这个读数会变，测试会红 —— 这是**有意**的。

## 自检

- [x] 与 ADR-0003 一致：**未**把外部权威状态引入 Derived Artifact。
- [x] 与 ADR-0044/0045/0046 一致：**未**改 Evidence Gate 行为，只标注其可达性。
- [x] **未静默推翻任何 ADR**：涉及产品语义的部分（召回面、`pinned`/`archived` 入口）一律升为
      待办 **D4 / D5**，决策权交用户。
- [x] 数字可复现：`node _research/measure-metadata-leak.ts` / `measure-metadata-quality.ts` /
      `measure-path-visibility.ts`（`_research/` 有意不纳入版本控制，故同时给出**命令行探针**在测试里）。
- [x] 未改生产行为：`npx tsc --noEmit` clean；全套回归 **32/32**。
- [ ] **未裁决**：`metadata` 门该不该继续挡 67.2%（D5）；`pinned`/`archived` 三条路（D4）。
- [ ] **未做**：`session`/`artifact` 究竟是前瞻还是遗漏 —— **缺作者意图证据**，不猜。
