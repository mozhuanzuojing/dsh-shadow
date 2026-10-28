# ADR-0007: 预算/信封不变量

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0004、ADR-0006
- 定位：所有读出口的预算与截断披露。

## Context

v1 只有默认主题召回/无参索引按 `max_tokens` 截断；`episode/task/context/knowledge` 可达 7–8k 字符且不披露；`recall_shadow.limit` 无消费者。

## Decision

- `max_tokens` 钳 [256,8000]，默认 1600；字符 = ×4。
- `limit` 钳 [1,30]；主题默认 10、query 默认 8、recovery 默认 1（按 limit 返回多个恢复包）。
- 所有 handler 经统一 `budgetText` 截断并自报；topic 召回用 `selectWithinBudget` 返回命中/返回/丢弃计数。
- 截断信封四要素：`> 未返回的命中：N 条（命中 M · 本次返回 K）`、`limit=N 上限 M 条`、`> 下一步：`、`> 未返回示例：`；N=M−K。
- `never_worse`：有损输出不得比原文长。
- 未知/非法参数显式失败，不静默落默认。

## Consequences

- 同一工具不同 mode 的预算语义一致。
- 措辞仍是 soft 契约；截断自报与「数据非指令」是 hard。

## Non-goals

不做跨请求 token 计费；不保证输出精确 token 数。
