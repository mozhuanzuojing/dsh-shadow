# ADR-0002: atoms 是唯一权威；单一派生索引

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0003、ADR-0009
- 定位：存储与重建边界。

## Context

v1 同时存在 `_meta.json`、`projectionStore`、进程内 parsed 缓存与 SQLite 候选索引，四套新鲜度语义；`_meta.json` 并发 RMW 与「读失败当空」制造静默陈旧。

## Decision

- **source**：`.shadow/atoms/*.md` 只追加；`soul/`、`taste/`、`resources/` 为 curated source。
- **derived**：`indexes/index.sqlite`（候选/hits/meta/query-log）、`indexes/_index.md`、`indexes/materials/`、`indexes/affaires/`、`indexes/episodes/`。全部可整份重建。
- **唯一派生索引**：SQLite 用 `node:sqlite`；WAL + busy_timeout；读失败/坏件必须可见，不渲染成空件。
- **`_meta.json`**：v1 legacy，仅首次导入 hits/status；之后只读，不再写。
- **旧日期树**：不读、不删、不迁；迁移工具只报告计数。

## Consequences

- 删掉 SQLite 只会丢 hits/query-log 等派生统计，不丢记忆。
- v1 的 `projectionStore`/`_meta.json` 写路径不再存在。

## Non-goals

不把 SQLite 当权威；不引入外部数据库；不做旧日期树双读。
