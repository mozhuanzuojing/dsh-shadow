# ADR-0009: 数据迁移与旧存储

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0002
- 定位：v1→v2 不丢数据、可回滚。

## Context

v1 真实部署只有 168 条 atoms，但盘上有 758 个旧日期树文件、`_meta.json`、旧 mode 存储根；用户要求重写但不丢数据。

## Decision

- **atoms 原样保留**：v2 解析器支持 v1 旧名与头字段；迁移不重写任何 atom。
- **派生件重建**：`indexes/` 与 SQLite 可从 atoms 重建；`_meta.json` 一次性导入 hits/status 后只读。
- **旧日期树 / v1 mode 存储**：不读、不删、不迁；迁移工具只打印计数。
- **curated source**（soul/taste/resources）原样保留。
- `tools/migrate-v1.ts`：默认 `--dry-run`；`--in-place` 先备份 `indexes/`；不删除任何旧文件；迁移前后 sha256 对账。
- 回滚：删 v2 派生件 + 切回 v1 link；atoms 未被改写。

## Consequences

- 迁移可逆；旧证据链保留。
- v2 不承诺旧日期树可读。

## Non-goals

不做自动迁移旧日期树；不合并 v1 mode 存储到 lab（只读兼容）。
