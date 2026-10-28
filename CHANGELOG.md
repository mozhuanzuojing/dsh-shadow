# CHANGELOG

本文件覆盖每个发版；历史在 git tag（ADR-0012）。迁移步骤见 [docs/v2/MIGRATION.md](./docs/v2/MIGRATION.md)，当前实现状态见 [docs/v2/STATUS.md](./docs/v2/STATUS.md)。

## [2.1.0] — 2026-10-28

工程缺口收口版：影子工具集从占位变成真实台账，遗忘契约落地，派生件开始物化，lab 输入契约按 mode 拆开并加固写边界。

### 新增

- **shadow_toolset 真实台账**：107 条能力目录（provider 2 + reference 105 · 17 分类）；`survey`/`category`/`need` 只读探测（默认只探插件内接线项，`survey:"all"` 才全探）；`install` 显式请求 + 宿主 `allowed-once` 审批 + 安装后重探，新增 `no-recipe`/`unverified` 状态，拒绝路径一律给可复制命令。
- **forget / retention / compact 接线**：新增 `domain/lifecycle.ts`；读时裁决状态类（archived/superseded/compacted）、陈旧类（`age>=staleDays && hits<minHits`）与 `maxActive` 上限，移出活跃集并在输出披露「条数/原因/未删除（Forget≠Delete）」；`shadow-manifest`/`shadow-report` 披露活跃 vs 已遗忘。`retention.*` 本已接在召回打分，`compact.gapMinutes` 本已接在 Episode 边界。
- **派生件物化**：无参 `read_shadow` 时物化 `indexes/{materials,affaires,episodes,abstracts}`（确定性：只由 atoms + `compact.gapMinutes` 决定，无时钟/随机；内容不变不写；预算截断在索引输出披露；写失败留 `index.derived` Signal、不阻塞读；atoms 零新增）。
- **lab per-mode JSON Schema**：`src/lab/schema.ts` 覆盖 51/51 mode（200 字段条目 / 134 唯一字段 / 30 必填条目 / 8 枚举 / 4 permissive）；未知字段错误列出**该 mode** 允许集；类型/枚举/必填显式拒绝，不做静默强转。
- **lab 写边界加固**：lab fs 门面对 `.shadow/atoms` 的任何写入一律 `WRITE_DENIED`（不只靠字段校验）；`workspace-record.kind` 锁形态（禁 `../`、路径分隔符、保留目录）。
- `toolset.enabled:false` 不再注册 `shadow_toolset`；`normalizeConfig` 移除 forget/toolset 的「尚未接线」warning。

### 行为变化（升级注意）

- **lab 输入契约收紧**：20 个 mode 现在有必填字段（此前空 input 也能执行）；未知字段只允许该 mode 的字段表。此前被放行但无人读取的 20 个 v1 core 参数（`topic`/`limit`/`asOf`/`observer`/`soul`/`taste`/…）现在 `INVALID_INPUT`；v1 会静默回落的枚举值（offline trigger、horizon-summary accessibility、recall-event accessibilityBefore/After）现在显式拒绝。
- **forget 默认不启用**：`minHits=0` / `maxActive=0` 表示关闭对应判据（v1 的 `minHits=0` 是非法值回落 1）；默认不改变召回面。meta 缺失（只读沙箱/索引不可用）不做陈旧类遗忘。
- **派生件写入**：无参读会写 `indexes/`（首次最多 68 个文件）；派生件无 GC，删除 `indexes/` 可整份重建。
- **工具集安装**：`install` 仍只在显式调用时发生，且必须拿到宿主 `allowed-once`；装后重探未检出时返回 `unverified`（不宣称成功、也不断言失败）。

### 验证

- `npm run verify`：34/34 测试（新增 toolset 4+1、lifecycle/forget 2、derived 1+1、lab-schema 1、lab-write-guard 1、toolset-config 1）；audit-layers 184 文件；docs-check 绿。
- 单测/e2e 均为假 runner / 假 approval / MemoryFs 或临时目录，不真装软件、不碰真实 `.shadow`。

### 已知限制（2.1.0）

- `shadow_toolset` 真机安装路径未验证（测试用假 runner）；台账是 v1 2026-09 快照，不是本机实测；非 Windows 下 winget-only 条目的处置未测。
- lab 与 core 仍同包；拆 `dsh-shadow-lab` 属 breaking，设计与迁移见 ADR-0013（未执行）。
- `model-claim.validations` 恢复可达（v1 已知语义缺口：outcome 由调用方给，未与 `.shadow/validation` 交叉核对），schema 里标 permissive 并写明风险。
- 派生件无 8k 语料 perf 基准；真实只读沙箱下的派生写入未真机验证。

## [2.0.0] — 2026-10-28

v2 重写首发：**atoms 是唯一权威，派生索引可整份重建，降级可见**。core 10 mode 常驻，研究面 51 mode 收进可选 lab。

### 破坏性变更（breaking）

- **工具面拆分**：v1 的 62 mode / 133 参数拆为 core 10 mode + 51 lab mode + 独立 `shadow_toolset`；`read_shadow` 12 参数，研究类 mode 移入 `shadow_lab({mode,input,write})`。旧 mode 调用返回显式 `MODE_MOVED`/`UNKNOWN_MODE`，不静默落回默认。
- **旧存储不在 v2 数据面**：运行时只读 `.shadow/atoms/`；v1 日期树 `.shadow/<YYYY-MM-DD>/`、旧 mode 存储与 `_meta.json` **不读取、不导入**（旧数据不做支持，属明确决策）。需要旧语料时用显式工具 `tools/migrate-v1.ts`（dry-run / copy / in-place，备份后不删旧文件）。
- **配置不静默兼容**：v1 旧键的 warn 兼容尚未实现（见 STATUS 未完成项）；映射表见 MIGRATION。
- **命中/状态从空开始**：v2 不导入 v1 `_meta.json` 的 hits/status。

### 新增

- **core 10 mode**：`recovery` `query` `episode` `decision` `task` `context` `knowledge` `query-log` `shadow-report` `shadow-manifest`；4 工具 schema 合计 2,538 字符。
- **可选 lab**：51 mode / 31 写型 / 9 分组，`lab.enabled:true` 才注册；只读带 `write:true`、未知 mode/字段均显式拒绝；写型只落 `.shadow/<store>/`，**从不写 atoms**。
- **宿主 fs 接入**：生产走 `ctx.get("fs")`（`HostFs` 惰性解析），写入带会话 `sandboxPolicy`；缺 fs 服务显式不挂载，不回退 `node:fs`。
- **DB-first 读**：parsed JSON 入 SQLite，1k warm 7ms/query 26ms、8k warm 67ms/query 106ms（合成语料）；新鲜度默认按文件名集合，`index.verify:"full"` 比 size/mtime。
- **可核查与降级**：每条记忆带路径句柄与证据指针；读/写/索引失败产生 `Signal`（恢复后清除，空 ≠ 失败）；`audit/` 记录动作，`_index.md` 无参读时物化。
- **采集正确性**：atom 唯一命名（`<date>--<HHMMSS>--<workspace>--<uid6>.md`）、同 agent 串行 flush + 快照 seq、失败 pending 保留重试；无工作区拒绝落盘。
- **验收资产**：v1 oracle 冻结语料 + parity（19 查询平均 Jaccard 0.890，阈值 0.85）；`tools/migrate-v1.ts`；`tools/mode-registry.ts`；`npm run verify` 自包含 22/22。

### 移除

- v1 日期树读取路径、`_meta.json` 运行时导入、`LEGACY_READ_ONLY` 相关逻辑（提交 `c09f42e` 已 revert，见 `eaf24ab`/`e9610ad`）。
- v1 的 62-mode 单工具面（拆分见上）。

### 已知限制（2.0.0）

- `shadow_toolset` 显式返回 unavailable（Phase 1 未移植台账；不探测、不编造命令）。
- 派生件只物化 `indexes/_index.md`；材料卡/纪要/Episode/abstracts 仍在读时内存派生。
- `forget`/`retention`/`compact` 配置存在，行为未接。
- lab 为同包 `src/lab/vendor/`（142 文件闭包），ADR-0012 规划的独立包 `dsh-shadow-lab` 未落地；per-mode JSON Schema 未拆分（共享 v1 字段并集白名单）。
- 跨进程 `.shadow/.lock`、`index.provider:"fs"`、query-schema 版本、H3 预算计数未收口。
- **npm registry 未发布**：本版以 git tag `v2.0.0` 发布；`pnpm add dsh-shadow` 需等 registry 发布后成立（安装见 README）。

### 验证

- `npm run verify`：22/22 测试（unit/failure/parity/e2e）+ audit-layers 175 文件 + docs-check。
- 真机验收：DSH 0.2.1-rc.3 下，headless profile（`v2test`）与真实 Web profile（`v2web`，隔离 `DSH_HOME`）均完成真实模型会话：`read_shadow`/`recall_shadow`/`shadow_query`/`shadow_lab` 可用、`shadow_toolset` 显式 unavailable、atoms/audit/index/SQLite 落盘；并完成卸载 → 无工具/无采集 → 恢复 → 工具回归的回滚演练。
- 发版门：`npm run verify:release`（verify + 版本三处 + 构建产物 + npm pack 内容 + tag 指向 + 工作树干净）。

### 安装

```powershell
# 本地 link（开发态 / 本机验证）
# profile package.json: "dsh-shadow": "link:D:/project/dsh-shadow"

# 或从 tag 构建 tarball
git checkout v2.0.0
npm install; npm run build; npm pack   # → dsh-shadow-2.0.0.tgz
# profile 内：pnpm add file:<path>/dsh-shadow-2.0.0.tgz
```
