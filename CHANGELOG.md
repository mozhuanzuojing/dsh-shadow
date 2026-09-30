# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.46] 接上读侧最后一截：无参索引先展开「厚处」

### 1. 补的是什么洞

上一波做出了**纪要**（`indexes/affaires/`，逐圈加厚）与**材料卡**（`indexes/materials/`，主轴），
但 `read_shadow` **无参**读的是 `indexes/_index.md`，而那份版面**只由 atoms 派生** ⇒
这两样东西**在盘上、人能读，agent 用工具却取不到**（写出来了、没接入）。
`adr/0110` §3 要求「读侧第一入口从原子变成纪要」——本版补上这段。

### 2. 做法与边界

新增 `core/view/spiral-index.ts`（派生视图，纯拼接）：

| 段 | 内容 | 排序 |
|---|---|---|
| 「纪要（成长面 · 逐圈加厚）」 | 每张纪要的 key · **圈数** · 最后一次圈的时间 · 可下钻的文件指针 | **厚处在前**（圈数多者先） |
| 「材料卡（主轴 · 它对哪些事重要）」 | 每张卡的来源 · 圈数 · 「重要在哪」 | 同上 |

**边界（写清楚防后来者顺手扩大）**：
- 只读 `indexes/affaires/` 与 `indexes/materials/` 的**当前圈**文件；`*.history/` 归档圈**不进索引**（它是历史，不是厚处）；
- **刻意不动召回面**：`recall_shadow(topic)` 的候选集与排序**一行未改** —— 未 `confirmed` 的候选圈不该掺进召回；
  「要不要让召回也命中纪要/材料卡」留作**独立决策**（已记进 `BACKLOG` V12）；
- **缺目录 = 还没长出来，不是错误**（返回空串，不抛、不报警）；
- 段内条数有上限（默认各 5 条，可配）。

### 3. 改了哪些文件

| 处 | 文件 | 改动 |
|---|---|---|
| ① | `core/view/spiral-index.ts` | **新建**（70 行） |
| ② | `core/writer/materialize.ts` | `rebuildIndex` 里拼上两段（**441 行**，仍在 447 热点基线之下） |
| ③ | `test/spiral-index.test.ts` | **新建回归**：厚处在前 / 上限可配 / 归档圈不进 / 缺目录=空串 |
| ④ | `adr/0110` §3 · §5 · `BACKLOG.md` V12 | 读侧入口结案；明确「召回面不动」这条边界 |

### 4. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | 无参索引先展开厚处 | `node test/spiral-index.test.ts` | **ALL PASS**（三条） |
| 2 | 既有判据未被波及 | `test/compact-write-side` · `test/episode-lineage` · `test/material-card` | **ALL PASS** |
| 3 | 复杂度热点 | `npm run audit:complexity` | `materialize.ts` **441**（基线 447，未涨） |
| 4 | 全仓闸门 | `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` | 见闸门输出 |

### 5. 诚实标注

- **本机现在还看不到这两段**：`indexes/affaires/` 与 `indexes/materials/` 在本机**都还不存在**（真语料从未收口、
  也没有材料卡 —— 插件刚补进 desktop profile，**要重启宿主才生效**）。所以本版只在 mock 语料上证明了**版面正确**，
  真机上「厚处」要等重启后第一次收口 + 第一次登记材料才会长出来；
- 「召回也命中纪要/材料卡」**没有做**（刻意），它会让检索面变宽、可能带回未 `confirmed` 的候选圈 ⇒ 需你拍板；
- 这两段是**派生视图**：删掉 `indexes/` 即回到「只有原子」的世界，不丢任何原文。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`recall_shadow` 是否纳入纪要/材料卡（**待你拍板**）；`T17-C` 默认值前置条件 ①；审计 ref 进 atom lineage。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料** · **重启桌面客户端**（重启后 `read_shadow` 等工具才出现、
  记忆采集才从 2026-09-29 17:51 恢复，纪要/材料卡也才会开始长）。
