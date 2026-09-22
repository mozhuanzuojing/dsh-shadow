# ADR-0098: 适配 DSH `0.1.7-alpha.1` —— 预设迁到**声明行**、Agent Teams 移到 **profile 平面**、验证基线硬切

- 状态：**已接受** · 随 `v1.20.0` 落地
- 决定日期：2026-09-22
- 关联：**ADR-0049**（缺件不静默 —— 本次「未复核面不声称」沿用其取向）·
  **ADR-0050**（正名硬切、不留兼容别名 —— 本次**不**双形态并存的理由）·
  **ADR-0056**（teammate 名额上限 4 —— 本次改为在 profile 里按 id override）·
  **ADR-0068**（`_meta.json` 并发纪律 —— 其依赖的 fs 契约本次实测未变）·
  **ADR-0064**（仓库脚本一律 TS）
- 定位：**兼容面**决策。回答「一个新宿主版本到底让本插件的哪一层不再成立、以及我们用什么口径宣称支持」。
- 触发：用户指令「dsh-shadow 插件 适配 dsh最新的0.1.7-alpha.1 版本」。

## 1. Context：先把「适配」量清楚，再动手

`0.1.7-alpha.1` 是 npm 的 `alpha` dist-tag（**`latest` 反而是 `0.0.1-rc.1`**，`next` 是 `0.1.5-rc.3`），
本机运行体是 `0.1.5-rc.2`。所以「适配」不是一句感觉，必须先回答：**两面之间到底哪一层不再成立**。

判据是**逐文件比对两面 `.d.ts`**（本机 `0.1.5-rc.2` 安装体 vs `npm pack` 下来的 `0.1.7-alpha.1` tarball），
不是读 CHANGELOG、不是推断。结论见 §4：**插件体没坏，坏的只有随包预设的形态**。

这一区分决定本 ADR 的全部取舍 —— 三件事必须分开看：

| 层 | 0.1.7 上成立吗 | 依据 |
|---|---|---|
| **插件体**（本插件消费的服务与事件） | **成立** | §4 逐面实测；`fs`/`tools`/`systemPrompt`/`session/event` 消费面均未变 |
| **随包预设的形态**（`.agent-presets/<id>/` 目录） | **不再成立** | 0.1.7 **无任何读取者**（官方 shipped skill 原文：*Nothing reads that directory any more*） |
| **Agent Teams 所在的平面** | **换了** | 0.1.7 收成**一个 profile 层 bundle**，自带服务 + 工具 + UI，并自己 disable `tool-subagent*` |

## 2. 决定

### 2.1 预设形态迁到声明行（唯一形态，不留旧形态）

预设改为 `@deepseek-ai/dsh-agent-preset` 的一条声明行
（`config: {id, name, description, order, plugins[]}`），随 **bundle** 的 `dsh.bundle.patch`
（**数组**）里的 patch 文件发布 —— 与上游 `dsh-web-app/presets/*.patch.yml` 同形。

- 仓库侧：新增 `presets/projection.patch.yml`；`package.json` 的 `dsh.bundle.patch` 由字符串改数组；
  `files` 由 `agent-presets` 换成 `presets`；删 `agent-presets/projection/`（README 经 `git mv` 保留历史）。
- **不做双形态并存**（理由见 §3.2）。

### 2.2 Agent Teams 移到 profile 平面：预设里那一行删掉

0.1.7 的 `@deepseek-ai/dsh-experimental-agent-team-profile` 在 profile 平面插
`agent-team`（服务）+ `tool-agent-team`（9 个工具）+ `ui-agent-team`，**并自己 disable**
`tool-subagent-control` / `tool-subagent-list-agents` / `tool-subagent` / `tool-subagent-fork`。

⇒ 本预设**不再持有任何委派行**（连 `tool-agent-team` 也删）。用户 2026-09-16 定调的
「如非必要，不得轻易开子代理」（v1.15.96 靠手工删 6 行维持）**改由上游执行**。
另有一条硬理由：同一进程第二次挂载 `tool-agent-team` 会因
`prompt section "team:policy" is already registered in this scope` 失败 —— 旧写法与 bundle 并存必然踩它。

名额上限改在 profile 的 `cordis.patch.yml` 里**按 id override** `agent-team`，**必须重述该行全部 config 键**
（patch 替换整份 `config`）：`maxMembers: 4`（ADR-0056）+ `maxTasks` / `maxPendingMessagesPerMember` /
`maxMessageBytes` / `disposalTimeoutMs`。**漏写一个键 = 静默回落 schema 默认值。**

### 2.3 预设内容以 0.1.7 `standard` 为基线**重建**

实测原先的 `projection` 是**旧版 standard 的副本**（`standard@0.1.5` + persona + 删 6 行），
它连 `command-goal` 与 `present` 都缺 —— 而那两行 `standard@0.1.5` 就已经有了（陈旧漂移）。
本轮以 0.1.7 `standard` 为基线重建，**只保留两处有意偏差**：persona 文本、delegation 组不含委派行。
persona 文本逐字未改（折叠语义下 2915 字符）。

### 2.4 验证基线与 `engines.dsh` 一并硬切到 `0.1.7-alpha.1`

`engines.dsh: ">=0.1.7-alpha.1"` + `index.ts` 的 `HOST_BASELINE` 同步（`test/host-probe.test.ts` ⑥ 棘轮锁一致性）。

## 3. 取舍（三条都做过权衡）

### 3.1 基线：整体硬切（采纳） vs 分平面声明 vs 双形态并存

| 选项 | 内容 | 为什么不采 |
|---|---|---|
| **整体硬切（采纳）** | 两处都写 `0.1.7-alpha.1` | —— 单一地板、口径最诚实 |
| 分平面声明 | `engines.dsh` 留 `0.1.5-rc.1` 管插件体，预设要求另写一行 + 旧宿主上可见降级 | 会产出一个**「包声明支持 0.1.5，而随包预设在其上根本不被读取」**的口径。本仓最忌讳「声称但没验」，而这条声明恰好无从验证 |
| 双形态并存 | 同时发声明行与 `.agent-presets/` 目录 | 直接违反 **ADR-0050「正名硬切、不留兼容别名」**；且旧形态在 0.1.7 上已死却仍在包里 = 误导 |

**代价（已接受并记录）**：插件体其实仍能在 `0.1.5-rc.2` 上跑，但包不再这么声明 —— 这是「声明 = 验过的下限」的
必然结果，不是错误。⇒ 仍在 `≤0.1.6` 上运行的环境，**不删**其 `$DSH_HOME/.agent-presets/projection/`
运行副本（部署产物），但仓库不再提供它的源。

⚠ **具体后果（本机实测确认）**：本机 live profile（`~/.dsh/profiles/web`）以 `link:` 直接指向本仓库
工作树，而它的 `node_modules` 里只有 0.1.5 的 `@deepseek-ai/dsh-agent-presets`（复数），**没有** 0.1.7 的
`@deepseek-ai/dsh-agent-preset`（单数）。⇒ 该 profile 在 0.1.5 上重启时 `dsh-shadow` 这一行会装不上。
三条出路：① 把该 profile 的 `link:` 指向 `v1.19.1` 的独立副本；② 把该 profile 升到 `0.1.7-alpha.1`；
③ 先把它从 `bundles` 里摘掉。

**实际走向（2026-09-22 补记）**：用户随后选了 **②** —— 把 live profile 升到 `0.1.7-alpha.1`，把原来手写的
`@deepseek-ai/dsh-experimental-agent-team` + `-tool-agent-team` 两行换成
`@deepseek-ai/dsh-experimental-agent-team-profile` **一个 bundle**（正合 §2.2 的形态），并重启宿主。
⇒ 这一格由「已接受的代价」升级为**活体验证**，见 §4.3。

### 3.2 迁移是**单向门**（这是本 ADR 存在的主要原因）

迁到声明行之后，`≤0.1.6` 不再认它。这条**没有版本号能同时满足两侧**，所以必须显式记下来：
**这不是「向后兼容的小改」，是一次形态切换。** 任何一个「悄悄保留旧目录」的折中都会让下一个人
以为宿主还读它。

### 3.3 行清单用**写死的棘轮**，不是「跑到就行」

`test/preset-projection.test.ts` 逐字锁住 27 行 + T1 不变量（0 个 `tool-subagent*`、0 个 `tool-agent-team`）
+ F1 忠实性。它**故意**会在上游增删行时变红 —— 那是要人裁决的信号（同 `recall-envelope.test.ts` 的 `mode` 计数）。
理由：本预设的整个卖点是「= 宿主 standard + 投影 persona」，**落后于宿主就是它唯一的失败模式**，
而那正是它上一版发生的事（缺 `command-goal`/`present` 而无人发现）。

## 4. 实测（判据与证据）

### 4.1 逐面 `.d.ts` 比对（`0.1.5-rc.2` → `0.1.7-alpha.1`）

| 面 | 结果 |
|---|---|
| `dsh-goal` | **逐字未变**（0 行差异）—— `goal/changed` 的 `{operation, ref, goal?}` 没动 |
| `dsh-session` 的 `user/message` / `assistant/message` | 事件**形状未变**；`SurfaceEventType` 只多 `developer/message`，而 `core/collect.ts` 只认前两者、其余 `null` ⇒ **被忽略** |
| `SESSION_FORMAT_VERSION` | 3 → 4（本插件不读会话文件格式 ⇒ 无影响） |
| `dsh-fs` | 只**新增** `watch()`；`readText`/`writeText`/`listDirectory`/`stat`/`processPath` 与 `FsWriteIntent`/`FsInfo.version`/`FS_STALE_VERSION` 未变（ADR-0068 继续成立） |
| `dsh-system-prompt` | `context({name,order,text})` 未变（只多 `interpolate` 与两个 section 序号） |
| `header.cwd` | 仍在 |
| `dsh-tools` | 新增 `cancel` 决策与 `error` 字段、`codeRuntime`→`ptcRuntime`（本插件只用 `register`，未受影响） |

### 4.2 隔离真机（全新 `DSH_HOME`，**未触碰 live profile**）

环境：`dsh --from-default-profile` 建的 `shadow17`（web 面）/ `shadow17hl`（headless 面），
`dsh` 本体 = `@deepseek-ai/dsh@0.1.7-alpha.1`。

| 面 | 结果 |
|---|---|
| 组合 | `--dump-config`：`preset-projection` **组合出 27 行**、`tool-subagent*` **0**、`agent-team.maxMembers: 4` 生效 |
| 激活 | web 面启动 **零 `did not activate` 警告** |
| 真机写盘 | 隔离 home **补上用户提供的模型凭据**后跑两轮真模型回合（`--profile shadow17hl`），产出：`_index.md` / `_abstract.md`（L0/L1 sidecar）/ `_meta.json`（ADR-0068 事务路径）/ **5 枚记忆原子** / **1 份 Episode 收口 consolidated 文件**（「由 2 个原子记忆在 Episode 收口时合并」）/ `audit/2026-09-22.jsonl`（ADR-0097 审计流） |
| 读侧召回 | 第二轮的 `read_shadow`（不带参数）正确报出日期目录 `2026-09-22/` 与条目数（3 条，含 consolidated 一份） |
| 能力探测 | 全程**无** `[dsh-shadow]` 告警 ⇒ 两个硬依赖 `fs` / `tools` 齐备 |

**已知非缺陷**：headless 面报 `preset-projection: pending (waiting for service: agentPresets)` ——
预设是 **web 面**特性（base 把 agent 行留着给 TUI、web 面 disable 掉并让每个会话挂预设），headless 无注册表，**预期**。

**工具面副产品**：pnpm 12 的构建审批键是 **`allowBuilds`（映射）**，不是 `onlyBuiltDependencies` ——
后者被静默忽略、`ERR_PNPM_IGNORED_BUILDS` 照旧；`pnpm approve-builds --all -y` 写的就是它。

### 4.3 live 部署（用户把日常环境升到 0.1.7-alpha.1 之后，2026-09-22 补记）

**这是比 §4.2 更强的证据**：§4.2 是隔离 home，本节的每一步都发生在**用户真实日常环境**里。

| 项 | 实测 |
|---|---|
| 宿主 | `dsh --version` → **`0.1.7-alpha.1`**（运行体 = `dlx/3452292f…/@deepseek-ai/dsh@0.1.7-alpha.1`，PID 6488） |
| profile | `~/.dsh/profiles/web` 的 bundles = `dsh-base` / `dsh-web-app` / `dsh-experimental-agent-team-profile` / `dsh-shadow` / `…voice-input-bundle` —— 原来手写的两行 Teams 已换成**一个 bundle**（正合 §2.2） |
| 本插件 | profile 的 `node_modules/dsh-shadow` 是指向本仓库工作树的 **Junction**：`version: 1.20.0`、`engines.dsh: >=0.1.7-alpha.1`、`presets/` 随包、`agent-presets/` 不存在 |
| **组合** | `dsh --profile web --dump-config` 同时出现 `agent-preset-registry` / `preset-standard` / 团队三行（`agent-team` / `tool-agent-team` / `ui-agent-team`）/ `dsh-shadow` / **`preset-projection`** |
| **活体写入** | 本会话（`session-529db010…`）在 `.shadow/2026-09-22/` 持续落下记忆原子（实测 16:08:11 → 16:09:12 连续 6 枚）、`_meta.json` 同步更新、当天审计流记到该 session 的动作 |
| **活体读取** | `recall_shadow` 返回的恢复包**时间上界 = 16:09:23**（看得见刚写入的原子）⇒ 读侧在 0.1.7 上通 |

⚠ **一处与「预设包」有关的实现事实**（供后来者）：`@deepseek-ai/dsh-agent-preset` 与
`@deepseek-ai/dsh-agent-preset-registry` **随 `@deepseek-ai/dsh` 本体发布**（在 dlx 树里），
**不在** profile 的 `node_modules` 里 —— 所以声明行这条路径**不要求插件包自带它们**，
包名写对即可（本仓 `presets/projection.patch.yml` 只写 `@deepseek-ai/dsh-agent-preset`，正确）。

## 5. 边界与未复核

- **完整回合 + 召回：已跑通**（凭据由用户在本轮提供，只作进程环境变量、未写任何文件）。端到端链路
  **采集 → 落盘 → 索引/摘要/meta 物化 → Episode 收口 → 审计流 → 读侧召回**在 0.1.7 上真的通。
- **live 部署：已跑通**（§4.3）—— 用户日常环境升到 0.1.7 后，本版本的预设、插件与读写路径全部实活。
- **仍未复核**：Web UI 的预设选择器渲染（未在浏览器里看过）。
- **本 ADR 不主张**「插件体在 0.1.7 上的一切行为都与 0.1.5 相同」：只主张 §4.1 列出**比对过**的那些面。
- **未做的扩张**：0.1.7 新增的 `plugin_manager` / `dsh-config-editor` / `fs.watch` 等能力**一律未接入** ——
  本次是**适配**（让既有能力在新宿主上成立），不是**能力扩张**；要接入须另立 ADR。
