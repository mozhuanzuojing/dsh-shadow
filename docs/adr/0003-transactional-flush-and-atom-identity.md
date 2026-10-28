# ADR-0003: 事务化 flush 与原子身份

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0002、ADR-0004
- 定位：写侧不丢数据的根因修复。

## Context

v1 的 flush 先删除 pending 再写盘；写失败只留 sticky 横幅，本回合永久丢失。原子文件名只有 `date--HHMMSS-slug`，同秒同入口两个 agent 会互相覆盖。

## Decision

- 原子名：`<YYYY-MM-DD>--<HHMMSS>-<slug>--<uid6>.md`；v1 旧名继续可读。
- 写入前 `exists` 检查；碰撞换 uid（最多 8 次）；写临时文件 + rename，绝不覆盖。
- flush：pending 快照 → 写原子 → 成功才清 pending；失败保留 + attempts/backoff + 可见 Signal。
- 纯动作批走 `.shadow/audit/<date>.jsonl`；含线索的批落 atoms。
- `capture.consent=true` 且无显式「记住」：只写 audit + 可见 Signal，不静默丢。
- 硬上限 500 条；溢出丢弃最旧并留 Signal（不静默）。

## Consequences

- 写失败可重试；同秒多会话不覆盖。
- audit 流失败也会保留 pending 并留 Signal。

## Non-goals

不做跨进程分布式事务；不保证 audit 与 atom 的原子双写。
