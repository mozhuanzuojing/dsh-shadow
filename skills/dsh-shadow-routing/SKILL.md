---
name: dsh-shadow-routing
description: 使用 dsh-shadow 记忆时如何"路由"：什么时候查 shadow（recall_shadow / read_shadow{taste|direction|soul} / shadow_query / recall_similar）、什么时候直接读文件核真值、什么时候只用自身上下文；并记住自动召回"首轮必空/换词不命中/只给任务卡"等坑。Triggers when 使用 dsh-shadow、查询/回忆记忆、问"上次/为什么/之前怎么定/偏好"、拿不准该不该查记忆、或自动召回为空时。
metadata:
  version: "1.0.0"
  date: "2026-11-19"
---

# dsh-shadow 路由（何时查 shadow / 文件 / 上下文）

> 一句话：**shadow=线索+证据句柄（非真值、可能过时/降级）→ 文件核真值 → 自身上下文只当本轮已确认事实，缺就查。**

## 三源
- **Shadow（记忆）**：为什么/过去决策/偏好/相似任务；给线索+句柄，**非真值**。
- **自身上下文**：本轮已读/工具结果；**只覆盖本轮**。
- **文件**：源码/config/日志/README/AGENTS；**当前真值**。

## 先破除最大误区：自动召回不是"总能看到历史"
每步**尝试**注入「⚠ dsh-shadow 自动召回」，但**只有**：①上一轮已缓存任务卡（**首轮必空**）②本轮消息与卡片有 ≥1 字面命中（BM25/2-gram）时才出现；只给 **2 张任务卡标题**，**不含决策/偏好**。
→ **"没出现" ≠ "没历史"**；新会话/换工作区/换说法最不可信。

## 路由判据（照做）
- **上次/为什么/改过/别再/又/还是/偏好** → `recall_shadow(query, limit:3)`
- **当时怎么定/有哪些决定** → `shadow_query`
- **口味/偏好/纠偏** → `read_shadow({taste:true｜direction:true｜soul:true})`
- **要现状（源码/config/日志/复现）** → **直接读文件**；shadow 仅线索，拿句柄回点核验
- **结果为空** → 看 `⚠`（partial/DEGRADED）：有降级就**报降级**，别说"没记录"
- **新会话/首轮/新工作区** → 不信自动召回沉默，**主动** `recall_shadow`
- **新任务找同类** → `recall_similar`；**找代码** → `search_code`（非记忆）

## 读路径坑
- `read_shadow(topic)` 默认先给**「面」**（soul 取景、≤800 字）；只要纯检索须 `raw:true`——**不 raw 就断言"没有"是错的**。
- `recall_shadow` 默认 `limit=1` 且**只覆盖 Task**；偏好/纠偏需显式 flag。
- `shadow_query` 是 query 模式（跨类型），非另一记忆库。

## 工作区/降级
- 记忆**绑定工作区**；换工作区=无记忆。只读沙箱/UNC 不建 SQLite → hits/query-log/生命周期**降级**（排名仍可用）。

## 证据源
仓库 `dsh-shadow/docs/v2/ROUTING.md`（含 `file:line`：auto-recall.ts / index.ts:227-243,368-380 / config.ts:83 / lessons.ts:103 / route.ts:327 / CONTRACT C2）。
