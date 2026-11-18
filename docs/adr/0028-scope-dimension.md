# ADR-0028: scope 轴升维——会话 → 工作区 → 用户态

- 状态：accepted
- 日期：2026-11-17
- 关联：ADR-0026（点→线→面→意识 · 多维）、ADR-0036（v1 三层根雏形）、CONTRACT C1–C7
- 定位：回答「记忆的观察范围（scope）也是一条升维轴吗、怎么落地」——会话 ⊂ 工作区 ⊂ 用户。

## Context

- 已有维度：点(0D)→线(1D)→面(2D)→观察意识(nD)，面轴可选 session/day/project/task。
- 已有 scope 现状：`agent`=会话坐标；`.shadow/` 天然覆盖**同一工作区的所有会话**（工作区级已基本成立）；**用户级（跨不同工作区）缺**——每个 cwd 各有 `.shadow`，互不聚合。
- v1 曾有三层根雏形（ADR-0036）：`.shadow/`（观察投影）/ `.dsh-shadow/`（工作区世界）/ `~/.dsh-observer/`（全局观察者连续性）。

## Decision

- **scope 是一条升维轴**：`session ⊂ workspace ⊂ user`。点/线/面带 scope 坐标 `{user, workspace, session}`。
- **多层根**：
  - 工作区：`.shadow/`（现状，source=atoms/lines）。
  - 用户：用户全局根（默认 `~/.dsh-observer/`，可配置 `userRoot`）。
- **user 层只聚派生、不复制全量原文**（MUST）：user 根存「面 / 观察意识」的**派生摘要 + 指向 (workspace, line) 的句柄**；**原文仍留各工作区**。降维 user→面→点 需按句柄回落对应 workspace 取原文。理由：防跨项目原文泄露 + 控体积。
- **soul / taste 升为用户级共享锚**：user 根存一份默认 soul/taste；工作区可覆盖（workspace soul 优先）。Observer 的 `what_matters/what_to_ignore` 在 user 聚合时生效。
- **读**：`read_shadow({dim, scope})`，scope ∈ `session | workspace | user`（默认 workspace）。
- **隐私（MUST）**：user 层聚合 MUST 过 `what_matters/what_to_ignore`；**不跨用户合并**（每个 OS 用户一个 userRoot）；不越权。缺件不静默。
- **不变量（MUST）**：降维可回点——user 面每个元素带 `(workspace, lineRel, #seq)` 句柄；守恒：Σ(user 面内点) == Σ(各 workspace 点)。

## Consequences

- 正：同一"我"跨工作区的记忆能与意识聚合；同时原文仍隔离在各工作区（安全）。
- 负：跨根读取有 I/O 与隐私门；句柄需带 workspace 定位；user 根需同步策略（何时把 workspace 面摘要提升到 user）。
- 边界：user 面是**派生摘要**，不是全量；降维回点依赖各工作区在线。

## Non-goals

- 不跨不同 OS 用户合并；不在 user 根复制全量原文；不引 LLM 造关系；不改 C1–C7 语义。

## 分阶段（先方案 + 原型，再码；每阶段 `npm run verify`）

- **A**：本条 ADR + 只读原型（现有单工作区数据演示 会话→工作区→user 聚合与降维；跨工作区用多根说明）。
- **B**：`userRoot` 配置 + scope 坐标落线/面 + user 根「派生摘要」物化。
- **C**：`read_shadow({scope})` + 降维句柄（user→(workspace,line)→点）。
- **D**：隐私门（what_matters/ignore）+ 文档。
