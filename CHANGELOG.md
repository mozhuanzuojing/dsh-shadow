# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.42] 修根因：Episode 收口的**触发点**从读路径搬到写路径

### 1. 根因（实测，不是推理）

用户在讨论「记忆太多 / 一句话一个文件」时提到"文件不收敛"。查证本机真工作区（466 条原子 / 5 天）：

| 应有 | 实测 |
|---|---|
| `atoms/*-consolidated.md`（收口产物） | **0 个** |
| `_meta.json` 里 `status:"compacted"` | **0 个** |
| `indexes/_index.md` | **不存在** |
| `indexes/abstracts/`（when 桶 sidecar） | **不存在** |

而 `compact` 自 `v1.15.85` 起**默认开**。四件一起缺，指向**同一条调用链**：

```text
无参 read_shadow  →  query/index-budget.ts  →  ensureIndex  →  rebuildIndex  →  runCompact
（带 topic 的主题召回走 listMemories 每次读盘，**不碰索引**）                      ↑
                                        写路径**明确不重建**（flush：「索引懒构建：不在此处重建」）
```

- **只有「无参读目录」这一条路**会走到 `runCompact`；写路径把它留给了读路径；
- ⇒ **只要没人无参读目录，文件就永不收敛**。四件缺失**全部**由 `rebuildIndex` 产出
  ⇒ **一次解释四处，且不需要任何异常**（这正是它能一直没被发现的原因）；
- **旁证**：`_meta.json` 里 `hits>0` 有 **113** 条 —— 主题召回**确实发生过**，而无参读目录从未发生。

### 2. 修法与边界

- **判据**：**文件爆炸发生在写侧，收敛也必须在写侧发生。** 新增 `maybeCompact`（在 `flush` 末尾调用）：
  冷进程里缓存可能为空 ⇒ 先按**同一套遗忘 / 收口判据**把缓存对账出来，再交给 `runCompact`。
- **只搬触发点，不动语义**：索引（`_index.md` / abstracts）**仍保持懒构建**；
  新回归显式断言「没读过就不该有 `_index.md`」，把这条边界钉住。
- **与 ADR-0038 §6「方向 A 不做」不冲突**：合并的仍是**已关闭**的 episode（判据是**时间间隔**这个客观量），
  不引入「agent 自决任务边界」，Episode 依旧是**派生**（原子只**标** `compacted`，不删）。
- **顺手修一处复杂度热点**：`materialize.ts` 是热点（**只能降**）。首次尝试把收口内联进去 ⇒ 闸门红
  （**447 → 470 行**）⇒ 把整块收口迁到新模块 `core/writer/compact.ts` 后，**447 → 414 行**（热点下降）。

### 3. 改了哪些文件

| 处 | 文件 | 改动 |
|---|---|---|
| ① | `core/writer/compact.ts` | **新建**（85 行）：`runCompact` 迁入 + 写侧触发 `maybeCompact` + 根因说明 |
| ② | `core/writer/materialize.ts` | 迁出收口、改为两个调用点、清理随之失效的导入（**447 → 414 行**） |
| ③ | `test/compact-write-side.test.ts` | **新建回归**：**从不调用 `read_shadow`**，只驱动一次写 ⇒ 必须出现 consolidated 且原子标 `compacted`；并断言 `_index.md` **仍不生成** |
| ④ | `adr/0038` | **补记**：根因 / 判据 / 与 §6 的逐条对照 / 仍未核 |
| ⑤ | `README.md` | 默认开关表的 `compact` 行（触发点 + 未验项如实改写） |
| ⑥ | `BACKLOG.md` | V12 的 ① 结案（诊断与修法），②③ 顺延为材料卡 → 收口加圈 + 平衡三律 |

### 4. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | 新回归：只写不读也收口 | `node test/compact-write-side.test.ts` | **ALL PASS** |
| 2 | 既有收口 / Episode 血缘回归 | `node test/episode-lineage.test.ts` | **ALL PASS** |
| 3 | 复杂度热点 | `npm run audit:complexity` | `materialize.ts` **447 → 414（降）** |
| 4 | 全仓闸门 | `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` | **exit 0 · 71/71（较上版 +1）** |

### 5. 诚实标注

- **本机真工作区的 466 条尚未收口**：插件当前**未挂载**（desktop profile 里没有 `dsh-shadow`）⇒
  首次真机收口的可见后果（约 439 条进归档、主题召回可见面由 466 条变 ~30 条）**需挂载后观察**，
  本版只能在 mock 语料上证明**触发点已通**；
- `mutateMeta` 的**版本守卫**分支（`stat` 可用时的 `replaceIfVersion` 重试）**仍未被真机覆盖** ——
  新回归的 mock fs 没有 `stat`，走的是 ADR-0068 记的「诚实降级为无条件写」那一路；
- 途中两处**夹具坑**已写进测试注释（都是先造红才发现的）：① 只推**纯动作**的批次按 ADR-0097 进**审计流**、
  不落记忆文件（必须同时有用户消息）；② seed 原子日期偏早，会被默认开启的 `forget` 判为过期剔出活跃集
  （插桩显示 `cache=1`）⇒ 用 `forget:{enabled:false}` 隔离。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`V12` 记忆螺旋的②③ —— **材料卡优先**（`key` 规范化唯一实现 + 并卡 · 写 API · 源指纹 · 冲突登记），
  再「收口改同一张纪要加圈 + `history/` 归档圈」与**平衡三律的机器判据**；
  `T17-C` 的默认值前置条件 ①（`query-error` 有界重试 + 退避）；审计 ref 进 atom lineage（需先过契约面决策）。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）· **要不要把 `dsh-shadow` 挂进 desktop profile**
  （当前桌面 GUI 跑 desktop，插件在 web ⇒ 记忆采集自 2026-09-29 17:51 停摆）。
