# ADR-0010: 文档/治理重置与 verify 分层

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0011、ADR-0012
- 定位：把 3.45MB/124 ADR 的治理债压到可维护。

## Context

v1 文档 3.45MB、124 ADR 约 90 条历史/研究、60 个审计工具 9.7k 行；新克隆 `verify` 第 9 步 exit 2，无法作为回归基线。

## Decision

- **v1 归档**：`docs/v1/` 原样冻结（含 124 ADR），加 `FROZEN.md` 与索引；不修正文/行号。
- **v2 当前态 ≤6 份**：README + ARCHITECTURE + CONVENTIONS + MIGRATION + LAB + PARITY；`docs/adr/` 12 条 v2 ADR。
- **verify 三条**：`verify`（自包含：typecheck + tests + layers + docs）、`verify:corpus`（语料基准）、`verify:release`（发版出口）。
- **工具 ≤6**：test / release / audit-layers / docs-check / migrate / oracle。
- **不手写可派生数字**：mode 计数、schema 尺寸由测试/命令现取。
- 归档层允许勘误；当前态必须直接改写，不叠「更正」。

## Consequences

- 新克隆可跑自包含 verify；v1 决策仍可查。
- 删除/移动 v1 文档只经归档，不改历史。

## Non-goals

不删除 v1 ADR；不把 v1 的研究笔记搬进当前态。
