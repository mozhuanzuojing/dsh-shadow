# ADR-0013: 拆分 dsh-shadow-lab 独立包

- 状态：提议（v2.1.0 记录；**未执行**）
- 日期：2026-10-28
- 关联：ADR-0012（发版与版本策略）、ADR-0001（v2 范围）

## Context

ADR-0012 计划 lab 作为独立包 `dsh-shadow-lab@0.1.0`（peer 依赖 core、可选安装）。v2.0/2.1 为尽快交付，把 51 mode 与 142 文件 vendor 闭包放在 core 的 `src/lab/`，STATUS 记为缺口。
现在评估拆分：core 保持 4 工具 + 派生件 + 台账，lab 变成可选包。

## 边界核对（已做）

- `src/lab/vendor/**` 是**自包含闭包**：142 文件的相对 import 全部落在 vendor 内；只有 4 个适配文件引用 core —— `run.ts`（outcome/config 类型/`RECALL_PREFIX`/signals/fs 类型）、`fs.ts`（`FsPort` 类型）、`schema.ts`（`JsonSchema`/`LabMode`/`Outcome` 帮助函数）、`tool.ts`（schema helpers/`RECALL_PREFIX`/`RegisteredTool` 类型）。
- core 目前静态 import `./lab/tool.js`，按 `config.lab.enabled` 注册 `shadow_lab`。
- 测试：lab 有 3 个单测 + 1 个 e2e，全部 import `dist/lab/**`。

## Decision（建议，未执行）

1. lab 成为**独立 Cordis 插件包** `dsh-shadow-lab@0.1.0`：自己的 `apply`（注册 `shadow_lab`）、自己的 `cordis.patch.yml`（`insert: id: dsh-shadow-lab`）与 profile bundle；`peerDependencies: { "dsh-shadow": "^3" }`。
2. core 新增公开子路径 `dsh-shadow/plugin-api`（`src/plugin-api.ts`）：导出 lab 需要的运行时（`normalizeConfig`/`resolveWorkspace`/`HostFs`/`SignalStore`/`params`·`str`·`bool`·`obj`/`RECALL_PREFIX`/Outcome helpers）与类型；把现在写在 `src/index.ts` 闭包里的 fs/workspace/sandbox 解析抽成 `src/surface/host-env.ts`，core 与 lab 共用。
3. core 移除 `src/lab/**` 与 `config.lab`（保留键名做 deprecation warning：「lab 已拆为 dsh-shadow-lab」）；core 固定注册 4 工具（`toolset.enabled` 仍可关）。
4. 版本：core **3.0.0**（移除 `shadow_lab` 属 breaking），lab **0.1.0**；lab 单独 tag（建议 `lab-v0.1.0`）。
5. 构建/测试：lab 有自己的 `tsconfig.json` 与 `dist`；root `verify` 顺序 = build core → 建 dev junction `packages/lab/node_modules/dsh-shadow -> 仓库根` → build lab → 跑 core 测试 + lab 测试。`tools/release-check.ts` 增加两条：core pack **不含** `dist/lab`；lab pack 含 vendor `dist` 与 `README`。
6. 迁移（写给用户）：profile `dependencies` 加 `dsh-shadow-lab`，`bundles` 加 `dsh-shadow-lab`；把 `lab.enabled` 移到 lab 插件的 patch 配置；MIGRATION/CHANGELOG 给回滚步骤。

## Consequences

- 好处：core 包去掉 292 个 vendor dist 文件；lab 可独立演进/发版；不装 lab 的用户不承担 51 mode 的 schema 与安全面。
- 代价：breaking（3.0.0）；profile 安装多一步；本仓多一个包的构建/测试；两包版本需协同（peer 依赖）。
- 风险：`LabMode`/`JsonSchema` 等类型需经 plugin-api 稳定；双包 e2e 需真实 profile 再验一次（v2.0 的 Web 验收流程可复用）。

## Non-goals

不在 2.x 内拆（破坏已发布语义）；不把 lab 再拆多个包；不做 v2/v3 双版本并行运行。
