# ADR-0001: v2 范围与兼容边界

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0005（core/lab）、ADR-0009（迁移）
- 定位：回答「v2 重写保留什么、放弃什么」。

## Context

v1 的公共面（3 工具 / 133 参数 / 62 mode / 17–19KB schema）与研究面（50 个不读 atoms 的 mode）互相焊死；同时写侧有静默丢整回合的 P0。用户选择推倒重写。

## Decision

- **保留**：3 个工具名；atoms 文件格式（v1 旧名可读）；`RECALL_PREFIX`；截断自报；派生可重建/坏件≠空件；Forget≠Delete；scope 规则。
- **收缩**：`read_shadow` 10 个核心 mode / 12 参数；`toolset` 独立工具；51 个研究 mode 移入可选 `dsh-shadow-lab`。
- **允许 breaking**：133→21 参数、62→10+1+51、研究 mode 从 `read_shadow` 移出；v2.0.0 + MIGRATION。
- **不保留**：v1 的 9 个布尔透镜中 7 个（identity/context/project/claim/asOf/observer/kg）移入 lab。

## Consequences

- v1 用户升级需读 MIGRATION；旧调用得到显式重定向，不静默落回。
- v1 代码/文档/ADR 冻结在 `legacy/v1` + tag `legacy-v1`。

## Non-goals

不保留 v1 的 128 参数 schema；不把研究 mode 塞回默认面。
