# ADR-0107: 投影空间小世界 · 灵魂规避滤 · 投影视图双写

- 状态：**已接受** · 随 `v1.21.0` 落地
- 决定日期：2026-09-23
- 关联：**ADR-0003**（Atom = source）· **ADR-0106**（投影空间布局）· **ADR-0049**（缺件不静默）
- 定位：回答「加载时如何形而上学结构化、默认滤与 RealityProjection 如何分界、便利贴放哪」。

## 1. Context

ADR-0106 落地时：盘上权威已切到 `atoms/` · `roles/` · `affaires/`，但读侧仍把记忆当扁平 markdown；
Role/Affaire **当时**尚未进读路径；「文件是投影」易被误解成「滤后才是真相」。grill-with-docs 锁定：
磁盘是**档案**；加载搭小世界；默认开缓存；默认开**任务无关**的灵魂规避滤；双写便利贴且**原文说了算**。

## 2. Decision

### 2.1 权威（A）

- **档案** = `.shadow/atoms/`（及 roles/affaires 卡）。
- **小世界**（内存）与 **投影视图**（`indexes/projections/`）均可扔、可重建。
- ⚠ **装载 ≠ 生效**：hydrate 会枚举 Role/Affaire，本版召回**只用** `soul` 做规避滤；卡不进排序 / sqlite `source`（见 ADR-0106 §2.7）。

### 2.2 小世界 + 缓存（M3 · L1+L2）

- Hydrate：`roles` · `affaires` · atom rels · `soul.json`。
- 配置键 **`projectionSpace.cache`**：**默认开**（`!== false`）。**只控小世界缓存**，不关规避滤。
- **不是** `projectionStore`（nodes.jsonl，仍默认关）。

### 2.3 两层「滤」（S3′）与入口

| 层 | 入口 | 含义 |
|----|------|------|
| 灵魂规避滤 | 默认主题召回（有 `topic`、且未走其它透镜短路） | 按 `soul.observer.what_to_ignore`（或 `avoided`）**藏行**；任务无关 |
| RealityProjection | `{ project: true }` | `projectContext` 完整报告；在 `query.ts` **先于**主题召回短路 ⇒ **不经**规避滤 |
| 原文逃生 | `{ raw: true }` | 主题召回不套规避滤；recovery 路径则不贴 F2 横幅 |
| 无参索引 | `read_shadow()` | **不**套规避滤 |
| `mode:"recovery"` / `recall_shadow` | 本版 | **只** F2（缺灵魂横幅）；**不**套规避滤。要关横幅：`read_shadow({ mode:"recovery", raw:true, topic })` |

### 2.4 缺灵魂（F2）

无 `soul.json`：空滤继续读（正文不替换）；结果顶部明示「还没有灵魂」。

### 2.5 双写（W3 · T1 · P1 · R1+）

- 路径：`.shadow/indexes/projections/<原子文件名>`（与 atom **同名** `.md` —— 扫全树 `.md` 会双计；`listMemories` 只认 `atoms/`）。
- flush 写完原文后 best-effort 写便利贴；失败留痕、不回滚原文；**读路径现滤写回失败也留痕**（v1.21.0 修：此前是 `void`，写不进去无声）。
- 新鲜度 = `atomToken` + `soulToken` **且** `bodyHash`（正文 sha256 前 16 位）：
  - 令牌是**廉价前置闸**（依赖宿主 `listDir` 的 `type`/`size`/`version`）；缺这些字段时可能僵成 `?:?`。
  - **正确性锚点是 `bodyHash`**：读侧用**刚读到的正文**的哈希去比；不一致（含「没有该行的旧便利贴」）⇒ 便利贴作废，现滤并重写。
    ⇒ 后端不给 `version` 时「同尺寸原地改内容」**不会**再把旧正文顶替新正文（`patchSummary` 正是原地改同一个文件）。
- 便利贴的读回必须是**完整** `## visible` 段：分段只认本文件写的 `## hidden`（正文自己可能含 `## ` 行）；
  v1.21.0 修掉的正则缺陷会把多行正文截成第一行，而调用方拿它直接顶替召回正文。
- 落盘弱上下文 = entry/goal；读时 topic 不同可现滤覆盖。

### 2.6 本版范围与未做（收一处）

**本版强制**：主题召回规避滤 + recovery 的 F2 横幅 + hydrate 枚举 + 便利贴双写。

**未做（下一刀，开刀前再 grill）**：

1. 全部 `mode:"…"` 默认规避滤  
2. 采集自动建真实 Role 卡；Role/Affaire **驱动**召回排序 / sqlite `source`  
3. `query/` 平铺等导航整理  

## 3. Consequences

- 工具参数新增 `raw`；配置新增 `projectionSpace`。
- README / CONTEXT 说清：档案 vs 小世界 vs 便利贴 vs RealityProjection；`projectionSpace.cache` ≠ 规避滤开关。
- 相对 ADR-0106 §2.7：补上 **小世界枚举**；**排序 / listMemories / sqlite 仍不读卡**（枚举 ≠ 进排序）。

## 4. Non-goals

- 便利贴进 `listMemories` 或成为权威。
- 落盘删改原文。
- 默认跑满 RealityProjection。
- 改 H3gate。
- 旧日期树迁移（残留 = 静默不可见死数据，见 0106 §2.7）。
