# dsh-shadow 路由判据（何时查 shadow / 文件 / 上下文）

> 本文件是**事实源**（带 `file:line` 证据）；agent 操作版见用户级 skill `dsh-shadow-routing`。

## 三源（+ 两类专用工具）
- **Shadow 记忆**：`.shadow`（线/atom/索引/ soul / taste / 决策谱系）→ 给「为什么/背景/线索 + 证据句柄」；**可能过时/降级，非真值**。
- **自身上下文**：本轮已读文件/工具结果/用户刚说；**只覆盖本轮**。
- **文件**：源码/README/AGENTS/config/日志；**当前真值、权威**。
- 专用：`recall_similar`（新任务找同类）、`search_code`（代码检索，**非记忆**）。

## 自动召回的真相（别把"没出现"当"没历史"）
每步**尝试**注入「⚠ dsh-shadow 自动召回」，但**只有同时满足**才出现：
1. 上一轮结束已缓存任务卡（由上一轮 atoms 生成，`index.ts:227-243`）→ **首轮必空、滞后一轮**；
2. 本轮最后用户消息**非空**且与卡片有 **≥1 字面命中**（BM25 / 中文 2-gram，`lessons.ts:103`）。

- 只给 **2 张任务卡的标题/时间/状态/技能路径**（`config.ts:83` limit 默认 2、钳 1..5）；**不含决策/偏好**。
- 空/失败一律返回 `""`，不显示（`auto-recall.ts:16,18`；`index.ts:368-380`）。
- **无开关**（仅有 limit；ADR-0023）。→ `index.ts:360`「默认关闭」是**过时注释**。
- 结论：**自动召回没出现 ≠ 没有历史**；首轮/换工作区/换说法尤不可信。

## 路由判据
| 触发信号 | 动作 |
|---|---|
| 上次 / 为什么 / 改过 / 别再 / 又 / 还是 / 偏好 | **R1** `recall_shadow(query, limit:3)` |
| 当时怎么定 / 有哪些决定 | **R2** `shadow_query` |
| 口味 / 偏好 / 纠偏 | **R2** `read_shadow({taste:true｜direction:true｜soul:true})` |
| 要现状（源码 / config / 日志 / 复现） | **R3 直接读文件**；shadow 只作线索，句柄回点核验 |
| 结果为空 | **R4** 先看 `⚠`（`atoms.partial`/DEGRADED）：有降级就报降级，**不说"没记录"** |
| 新会话 / 首轮 / 新工作区 | **R5** 不信自动召回的沉默 → 主动 `recall_shadow` |
| 新任务找同类 | `recall_similar` |
| 找代码 | `search_code`（非记忆） |

## 读路径注意
- `read_shadow(topic)` 默认先给**「面」**（soul 取景、≤800 字，`route.ts:327`）；只要纯检索须 `raw:true`。**不 raw 就断言"没有"是错的**。
- `recall_shadow` 默认 `limit=1` 且**仅覆盖 Task**；偏好/纠偏须显式 flag。
- `shadow_query` = query 模式（memory/decision/document/concept/resource，共用内核，非另一库）。

## 工作区与降级
- 记忆绑定工作区（shadowRoot > 会话 cwd > 进程 cwd）；**换工作区 = 没有记忆**。
- 只读沙箱 / WSL UNC 不建 SQLite → hits / query-log / 生命周期**降级**（排名仍可用）。

## 纪律
**shadow = 线索 + 句柄（非真值，可能过时/降级）→ 用文件核「当前真值」→ 自身上下文只当「本轮已确认事实」，缺就查。**

## 证据
`auto-recall.ts:14,16,18` · `index.ts:227-243,360,368-380` · `config.ts:83` · `lessons.ts:103` · `route.ts:327` · `tools.ts:71,100,114,173` · `docs/v2/CONTRACT.md` C2(:88-91) · ADR-0023（无开关） · 全局 `~/.dsh/AGENTS.md`（优先 README/AGENTS/或 dsh-shadow）。
