# ADR-0006: mode registry 与 schema 生成

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0001、ADR-0005
- 定位：公共面不再手写。

## Context

v1 的 `index.ts` 内联 128 个参数；分派是 15 段串行 await；未知 mode 静默落回索引；14 个参数被消费但未声明。

## Decision

- `contract/modes.ts` 是 mode 清单唯一来源：10 core + 1 toolset + 51 lab = 62。
- `api` 用 `Map<mode, handler>` 路由；未命中显式错误 + 最近邻；lab mode 显式重定向。
- 工具 schema 由描述符生成；`read_shadow` 12 参数、`recall_shadow` 2、`shadow_query` 3、`shadow_toolset` 4、`shadow_lab` 3。
- 工具描述 ≤600 字符 + 指针；完整语义在 `docs/`。
- 参数名是 hard contract；新增可选参数安全，改名/删除需弃用流程。

## Consequences

- 核心 schema 实测 2.5KB（v1 17–19KB）。
- 新增 mode/参数只改清单与描述符，不再改适配器大对象。

## Non-goals

不做运行时动态 schema 组合（lab 除外）；不保留未声明的隐藏参数。
