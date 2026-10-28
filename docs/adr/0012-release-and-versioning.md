# ADR-0012: 发版与版本策略

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0001、ADR-0010
- 定位：v2.0.0 与 lab 的版本边界。

## Context

v1 每个小版本 tag/CHANGELOG 覆盖，历史只留 git；v2 是 breaking 重写，需要清晰的升级/回滚路径。

## Decision

- **core**：`dsh-shadow@2.0.0`（v2 完成时）；在此之前 `2.0.0-dev.N`。
- **lab**：`dsh-shadow-lab@0.1.0`，独立包、可选安装；peer 依赖 core。
- **tag**：发版打 `v2.x.y` 轻量 tag，指向发布提交；`legacy-v1` 永久保留。
- **不强制升级**：v1 用户可继续用 `legacy/v1`；MIGRATION 给工具/参数/mode/配置映射与回滚步骤。
- **发版出口**：`npm run verify:release`（verify + build + pack + tag 校验）；不提供 `--skip-verify`。
- **CHANGELOG**：每版覆盖 + 迁移说明；历史在 git tag。

## Consequences

- core 与 lab 可独立演进；lab 缺装不影响 core。
- 旧 v1 调用需迁移；不静默兼容。

## Non-goals

不做 v1/v2 双版本并行运行；不自动迁移用户配置。
