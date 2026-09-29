# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.36] 宿主换成 `0.2.0-rc.1`：验证基线随之抬升（本版不含行为改动）

**用户指令（2026-09-29）**：「dsh-shadow 插件修改兼容最低 0.2.0-rc.1」。本版**只动声明与文档**，
**未改一行插件行为代码**；这么判是有证据的（见 §2 的两代宿主树逐文件比对），不是「看起来没问题」。

### 1. 做了什么

| # | 文件 | 改动 |
|---|---|---|
| 1 | `package.json` | `engines.dsh` → `">=0.2.0-rc.1"`；`description` 里手写的版本号**改成引 `engines.dsh`** |
| 2 | `index.ts` | `HOST_BASELINE` → `"0.2.0-rc.1"`；上方注释补本轮口径（首次跨 minor） |
| 3 | `README.md` | 「兼容性（验证基线）」表的基线行与声明行 + 新增一段本轮判据；当前版本行 |
| 4 | `CONTEXT.md` | 「验证基线」术语行（含历史链与本轮理由） |
| 5 | `presets/README.md` | alpha.2 读数那条 NOTE 续补**第四代**；「current as of …」在本代**重核后**抬到 `0.2.0-rc.1` |
| 6 | `adr/0098` | 新增 §8 补记（判据面 / 隔离判据 / §7 销账 / 诚实标注） |
| 7 | `BACKLOG.md` | `V10`（基线项）结案 |

**刻意未改**：`references.md` 的宿主读数（`dsh 0.1.7-rc.2`）—— 那是**带日期的当时实测登记**（归档层，
属「历史文档」，改了等于伪造历史）。同批「当前态」文档才必须跟着动。

### 2. 判据（本版最要紧的产出）

两代 dlx 树（`d1523a95…` = `0.1.7-rc.2`、`f91e57c0…` = `0.2.0-rc.1`）的**实质面**
（每个 `dsh-*` 包的 `lib/**` · `presets/**` · `locale/**`）**全包**逐文件 MD5：
文件数 **2861 → 2901**，差异 **180 处**（其中非 client/host 面 **82 处**）。

| 面 | 读数 | 含义 |
|---|---|---|
| `dsh-tools` · `dsh-fs` · `dsh-sandbox-policy` · `dsh-system-prompt` | **0 处差异** | 本仓消费的**硬依赖面逐字节未变** |
| `dsh-agent-preset` | **0 处差异** | 预设声明行契约未变（`adr/0098` §1 的「唯一硬断裂」判据不变） |
| `dsh-web-app`（含随包 `standard.patch.yml`） | **0 处差异** | 本仓 `presets/projection.patch.yml` 那份 faithful copy **无需重同步** |
| `dsh-experimental-tool-agent-team` | **0 处差异** | `presets/README` 的行号快照**仍成立** |
| `dsh-goal` | 1 处（`lib/typert.host.js` 内嵌 `SessionEventMap` 声明 2 行） | 编解码面，契约未变 |
| `dsh-session` · `dsh-agent-loop` | **本代唯一贴着本仓的变化** | 见下 |

**新行为与本仓的隔离（代码级三条）**：`0.2.0-rc.1` 给 `dsh-session` / `dsh-agent-loop` 加了
**pending tool-result 恢复**（新增 `ToolCallRecovery`；尾部修复合成收口事件；agent-loop 从 rc.2 的
「不伪造 tool results」改成「由 owning step 记录保守恢复结果」）。

1. 恢复路径写的是 `session.append("tool/result", …)` = **session log 事件**，**不是** `tools/result` 通知 ——
   后者的唯一发射点在 `dsh-tools`（本代 **0 处差异**）⇒ 本仓「动作背景」采集面（`tools/result`）不受影响；
2. 恢复只补 tool result 与**生命周期边界**（`step/end` / `turn/end`），**不合成 user / assistant 消息** ——
   本仓 `session/event` 采集面只认 `user/message` 与 `assistant/message`（`core/retention/collect.ts`）⇒ 面不相交；
3. 载入期（seed / fork 尾修复）的合成事件**不发布到 `session/event`**（`dsh-session` 的 `firstLiveSeq` 文档原文
   *Seed events never publish on `session/event`*）⇒ 连发都发不到本仓。

⇒ 与 `adr/0098` §7 同型：这次是**声明抬升**，不是插件面破坏。

**§7 的销账**：§7 留了一条「`dsh-tools` / `dsh-session` / `dsh-experimental-agent-team` / `dsh-goal`
四个包的变化对本仓有无影响 —— 本次未逐行核对」。本次有答案了：`dsh-tools` **0 处差异**，
`dsh-experimental-tool-agent-team` **0 处差异**，`dsh-goal` 只变编解码面，`dsh-session` 的那处已按上面三条判定隔离。

### 3. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | 宿主版本 | `dsh --version` | `0.2.0-rc.1`（`node -v` = `v26.10.0`） |
| 2 | 预设声明行确被读取 | `dsh --profile web --dump-config`（exit 0 / 1586 行） | 含 `agent-preset-registry` · `preset-standard` · `preset-projection` |
| 3 | 无 `dsh preset` 子命令（`presets/README` 的实质断言） | `dsh --help` | 只有 `dsh <profile>` 与 `dsh plugin --profile <name>` 两形态 |
| 4 | 实质面差异 | 两代 dlx 树逐文件 MD5 | 2861 → 2901 文件 / **180 处**；硬依赖面 **0** |
| 5 | 隔离判据 | 读宿主 `dsh-session/lib/types/repair.js` + `dsh-agent-loop/lib/index.js` + 本仓 `core/retention/collect.ts` | 恢复走 session 事件面，本仓只认 `user`/`assistant` |
| 6 | 文档派生字段门 | `npm run audit:docs` | **七项全绿**：① 三方版本一致 = `1.21.36`；⑦ 三处基线 = `0.2.0-rc.1`；⑥ 引用 607 处 / 越界 **0** |
| 7 | 全仓闸门 | `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` | **exit 0** · `[run-tests] 共 70 个检查（70 通过 / 0 失败）` · `ALL PASS ✅` |
| 8 | 新基线在**运行时**生效（不是只改文件） | 闸门 stderr 里插件自己的探测横幅 | 打印「本插件的验证基线是 DSH **0.2.0-rc.1**（package.json engines.dsh）」 |

**首次 `verify` 红过一处，留痕**：`audit:complexity` 报 `✗ 热点上涨：index.ts 368 → 373 行（热点只能降）` ——
`index.ts` 是热点（>300 行、棘轮「只能降」），我那版注释净加了 5 行。修法是把注释**压回净值 0 行**（信息不丢），
复跑即全绿。**给下一棒的提醒**：本文件的注释也受**行数预算**约束，别顺手把注释写长。

### 4. 诚实标注

- `presets/README` 里以 **alpha.2** 为准的**归一化行号读数**（`538` / `231` 一类）**仍未在本代重跑**；
  依据升级为「其载体包在 `alpha.2` / `rc.1` / `rc.2` / `0.2.0-rc.1` **四代逐字节未变**」——
  行号是**文件内容的函数**，内容不变则行号必不变。但「在哪一代量的」这层标注**仍是 alpha.2**。
- 其余 **178 处**差异多为 `dsh-client-*` UI 包（本仓不消费），**未逐行核**。
- 本版**未安装任何新包、未改 profile、未动行为代码**；`dist/` 之外只改声明与文档。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T17-C` 的默认值前置条件 ①（`query-error` 有界重试 + 退避）；审计 ref 进 atom lineage（需先过契约面决策）；
  两份外来材料若要**吸收**（而不是登记），需按惯例**先立 ADR**（判据见 `references.md` §22 / §23）。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）。
