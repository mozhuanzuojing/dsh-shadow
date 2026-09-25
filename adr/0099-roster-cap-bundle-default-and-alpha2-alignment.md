# ADR-0099: 名额上限回落 bundle 出厂值 8（撤回 ADR-0056 §1 的「4」）+ Agent Teams 描述对齐 `0.1.7`

- 状态：**已接受** · 随 `v1.20.3` 落地
- 决定日期：2026-09-23
- 关联 ADR：**ADR-0056**（本文**撤回其 §1 的 `maxMembers: 4`**；其 §2「复用优先」与 §3 往返纪律**继续有效**）·
  **ADR-0098**（Agent Teams 的平面与「按 id override 必须重述全部 config 键」——本文删掉该 override 后，
  这条长期维护面随之消失）· **ADR-0049**（缺件不静默 —— §6 的「未复核面不声称」沿用其取向）·
  **ADR-0050**（正名硬切 —— 本文不改写旧 ADR 正文的理由同源）
- 关联术语：`../CONTEXT.md`（teammate 名额 / Agent Teams 的平面）
- 定位：**决策修订 + 描述对齐**。回答三件事：① 上游补丁版之间到底变了什么；② 我们关于 Agent Teams 的描述
  哪几处已经与**装着的** 0.1.7 对不上；③ 那个**从未生效**的名额上限值还要不要留。
- 触发：用户指令「dsh-shadow插件中关于 Agent Team 的描述需要更新 对应 dsh@v0.1.7-alpha.2」。
  按 `/grill-with-docs` 逐层追问定案（先查代码再问、一次一个问题）：**第 1 问范围**（答 C = 描述对齐 **+** 决策复核）→
  **第 2 问上限值**（答 B = 改成 8 并删 override）→ **第 3 问 ADR 形态**（答 B = 新立本文，不改 0056 正文）。

## 1. Context：先把「alpha.2 变了什么」量清楚

本机同时留着两代包，因此判据是**逐字节比对两棵已安装的树**，不是读 CHANGELOG、不是推断：

| 面 | `0.1.7-alpha.1` → `0.1.7-alpha.2` | 证据 |
|---|---|---|
| `agent-team`（域服务）`lib/index.js` | **逐字节相同** | MD5 `BBA2DB3A…` 一致（） |
| `agent-team-profile` 的 `cordis.patch.yml` | **逐字节相同** | 仍 disable  `tool-subagent*`；仍插 `agent-team`(`maxMembers: 8` + 4 键) / `tool-agent-team` / `ui-agent-team` |
| `client-ui-agent-team` `lib/index.js` | **逐字节相同** | MD5 `92BF033E…` 一致 |
| `dsh-web-app` 的 `presets/{standard,minimal,ptc,cordis}.patch.yml` | **逐字节相同** | 文件全 SAME ⇒ **本预设的 F1 忠实性基线未动** |
| **`tool-agent-team` `lib/index.js`** | **唯一有语义变化的地方** | 549 → ；MD5 `6C426893…` → `7B817E51…` |

**唯一语义变化**：`spawn_teammate` 首条 user 消息的 `<system-reminder>` 由

```
You are teammate "<name>".
```

扩成（alpha.2 的 `lib/index.js` 内，紧接 `system-reminder` 的位置）：

```
You are teammate "<name>".
Your Team Lead is named "lead".
Use list_agents({}) to find your teammates and their names.
To message your Team Lead, use send_message({ target: "lead", message: "..." }).
To message another teammate, use send_message({ target: "<teammate name>", message: "..." }).
```

配套事实：`lead` 是**保留名**（该包 `memberName()` 对 `name === "lead"` 直接抛 `TEAM_INVALID_MEMBER_NAME`），
所以这句不是随口一个称呼，而是把「Lead 的可寻址身份」明写给了 teammate。

其余差异全是版本号上抬（`^0.1.7-alpha.1` → `0.1.7-alpha.2`、cordis `~4.0.4`、schemastery `~3.18.4`）与 README 同步改写。
**Agent Teams 的平面、工具数（）、schema、名额语义在 alpha.2 上一个字都没变** —— 变的是「teammate 知道怎么回话」。

## 2. 描述与实机不符的六处（这是本次对齐的真正清单）

| # | 本仓原先写的 | 装着的 0.1.7 实测 | 性质 |
|---|---|---|---|
| 1 | 「上游默认 **8**」并引 `L1594 DEFAULT_MAX_MEMBERS`（`CONTEXT` / `presets/README` / `adr/0056`） | **包默认 16**（`DEFAULT_MAX_MEMBERS`）；而 profile bundle 自己插的是 `maxMembers: 8` ⇒ 「16」是**包默认**、「8」是**bundle 出厂值**，是两回事 | 事实错 + 读数过期 |
| 2 | 「只用一次用 `subagent`」「名额耗尽不是死路：`workflow` / `subagent` 不吃名额」（`CONTEXT` / `adr/0056`） | 0.1.7 起 bundle disable 了 `tool-subagent*`，本预设又不挂任何委派行 ⇒ **这个组合里没有 `subagent`**（同仓 `README` 已写对，两处互相打脸） | 结论过期 |
| 3 | alpha.2 的 teammate 身份提示 | 本仓**全库 **提及 | 漏描述（alpha.2 的真变化） |
| 4 | `members.splice/pop/shift/filter/delete` → **0 hits**（`presets/README`） | 实测 **1 hit**：`members.filter(... phase === "provisioning")` 是**只读筛选**；`splice/pop/shift/delete` 仍  ⇒ 「无移除路径」结论不变，但「0 hits」这句不成立 | 断言口径过宽 |
| 5 | `installed = new Map()`「第 」、`const scoped`「第 」（`presets/README`） | 两个数都是 **0.1.5-rc.2 时代**的读数；alpha.1/alpha.2 上：`const scoped = agent.ctx` **L231**、`name: "team:policy"` **L238**（两版同）、`installed` alpha.1 **L530** → alpha.2 **L538** | 行号腐烂 |
| 6 | `L1244` 作「只 `push`」的证据（`presets/README` / `adr/0056`） | alpha.1/alpha.2 的 push 已在 **`state.members.push(member)`** 处（L1246），`L1244` 是另一句（非法 phase 迁移报错） | 行号腐烂 |

⚠ **一条必须说清的时间线**：第 1、5、**不是 alpha.2 造成的** —— `DEFAULT_MAX_MEMBERS = 16` 与 `push` 的新位置
在 **alpha.1 就已经如此**（两版 `agent-team` 的 lib 逐字节相同）。它们是 **0.1.5-rc.2 时代的读数**（ADR-0056 v1.15.17
那次独立复核的包版本），在 v1.20.0「适配 alpha.1」时**没有被重新读一遍**。⇒ 这次「对应 alpha.2」的对齐，
实际上是把**整条 0.1.7 线**的读数补齐；alpha.2 自己只贡献第 。

## 3. 决定

### 3.1 名额上限 4 → 8，并删掉 profile 里的 `agent-team` override

- **撤回 ADR-0056 §1 的「4」**，名额**随 profile 层 bundle 的出厂值 `maxMembers: 8`**；
  部署面（`~/.dsh/profiles/web/cordis.patch.yml`）里那条**按 id override**整条删除。
- 依据（按强度排序）：
  1. **实测：4 从未生效过**。本机 `~/.dsh/sessions` 现存 **会话 / 51 715 325 字符**，按事件类型统计
     （`type == "tool/call"` 且 `data.name == "spawn_teammate"`）真调用为 ****；`TEAM_MEMBER_LIMIT`
     的**运行时**抛出同样为 ****（文本命中的那几处全是「把 ADR / 包源码读进上下文」的引文，逐条看过）。
     ⇒ 4 与 8 在本机的行为差异是 **0**，而 4 的那点「省 token」是账面上的。
  2. **4 的唯一已知缺陷正好落在它最可能被触发的路径上**：名额是**终身累计、不可释放、失败创建也占**（§5.3 逐行核实），
     ADR-0056 §1 自己就写了「4 对失败的创建没有余量」。两次坏 spawn 就吃掉一半配额。
  3. **消掉一处部署偏离**：`headless` profile 从来没设过（一直跑 bundle 的 8），只有 `web` 压到 4 ⇒ 同一个包在本机
     有两种名额。删掉 override 后两者一致。
  4. **消掉一条长期维护面**：ADR-0098 §2.2 规定「按 id override **必须重述该行全部  config 键**，漏写一个 = 静默回落
     schema 默认值」。删掉 override 后这条不再需要人工维系。
- **判据一个字不动**：「复用优先（会复用 ≥才用 teammate）」与 persona 的「默认不派人」**全部保留**（它们是真正
  控制花费的那一层，见 §3.3）。4 → 8 只是把**从未生效的兜底**对齐上游，不构成任何一条要派门槛的放宽。
- 该决定**不改上游代码、不新增权限**（与 inv  无关）。

### 3.2 描述对齐：三值口径 + alpha.2 新事实

- **三值一次写清，不再写含糊的「上游默认」**：
  `上游包默认 16`（`DEFAULT_MAX_MEMBERS`）｜`profile 层 bundle 出厂 8`（`cordis.patch.yml` 的 `agent-team.config`）｜
  `本部署 = 8（不再 override）`。
- **登记 alpha.2 的新事实**：teammate 首条消息自带身份说明（自己的名字、Lead 叫 `lead`、`list_agents` / `send_message` 用法）
  ⇒ 提示词的「自包含」要求里**不必再交代回话方式**（persona ③ 加一句短括注即可，不新开条款）。
- **点名 agent-team 的行号引用改符号引用**（`apply()` 里刻意用**插件实例级** `installed = new Map()` 去重、而注册写进
  `const scoped = agent.ctx` 的成员作用域 ⇒ 同进程第二次挂载必撞 `team:policy` 重复注册）。行号是最易腐烂的引用形态，
  本次顺手把它换成符号名。

### 3.3 降级链更正：没有 `subagent` 可回落

本组合（0.1.7 + `agent-team-profile` bundle + 本预设）里 `tool-subagent*` 由 **bundle 在上游 disable**，
本预设又**一条委派行都不挂**（T1 不变量）。所以「只用一次」的落点是 **自己做**，名额耗尽的落点是 **自己做 / `workflow` 扇出**
（`workflow` 不吃名额，见 ADR-0056 §4 的包级引用核实）。**「用 `subagent`」这条降级路径在本组合中不存在**。
（写进 `CONTEXT` 与 `presets/README`；`adr/0056` §2 的历史措辞按 §4.2 的理由留在原文。）

### 号引用改符号引用

`presets/README.md` 里对 `tool-agent-team` / `agent-team` 的**行号**引用全部改成**符号名**（`installed` /
`const scoped = agent.ctx` / `team:policy` / `DEFAULT_MAX_MEMBERS` / `state.members.push`），
并写明这些符号对**哪一版包**核过。理由同本仓「引用纪律」：行号是最易腐烂的引用形态，而这三处正好各烂过一次（§2）。

## 4. 取舍

### 4.1 上限值：仍  + 删 override（采纳）/  + 仪表

| 选项 | 内容 | 判 |
|---|---|---|
| 仍 4，只把描述写清 | 零配置改动 | **不采**：留着「与上游的部署偏离 + 5 键重述」这条**持续**维护面，换来的是一道**实测 触发**的闸门 |
| **8 + 删 override（采纳）** | 名额随 bundle 出厂值；profile 里那条 patch 整条消失 | —— 判据不动、兜底对齐上游、web 与 headless 一致、免掉「重述 5 键」 |
| 16（跟包默认） | 必须继续显式 override（bundle 插的是 8） | **不采**：偏离**变大一档**，且 16 的尾部风险无任何实测支撑 |
| 4 + 加仪表（roster 报「已用 n/4」） | 值不动，只加可观测 | **不采（本次）**：Team 工具的 roster 结构由**上游包**定义，本插件改不了它的输出；靠 persona 要求 Lead 自查收益极小。若日后要「按预设分档名额」，那需要宿主的 per-agent team 配置（`adr/0056` 已记：当前不存在），属能力扩张，须另立 ADR |

### 4.2 ADR 形态：改 0056 正文 / 新立本文（采纳）/ 0056 补记

| 选项 | 内容 | 判 |
|---|---|---|
| 直接改 `adr/0056` 正文 | 把 §1 的 4 改成 8、顺手刷行号 | **不采**：0056 的判据**全部读自 `0.1.5-rc.2` 的包本体**；把它的行号刷成 0.1.7 的，等于**抹掉「这条断言建立在哪个包版本上」**——正是本仓 v1.18.4（材料更新后行号整体错位而无人可判）立下的那条教训 |
| **新立 ADR-0099（采纳）** | 本文收口三件事（撤回 §1 / 对齐描述 / 登记实测），并在 0056 头部加**指针与包版本 pin** | —— 决定与理由归 ADR、当时事实不改写；0056 降为「当时的判据来源」 |
| 在 0056 上加「补记」 | 本仓 ADR 用过补记（0049、0098 §6） | **不采**：被改的是**一个决定值**，不是「同一决定下的后来事实」；用补记会让「当前生效的决定值」继续要靠读两段拼出来 |

**0056 正文的处置**：只加两行头注（状态指针 + 包版本 pin），**§1–§5 的决定与行号一字不动**，
其 §2 的「用 `subagent`」按「当时成立、今日不成立」保留（现状由 `CONTEXT` / `presets/README` 承担，见 §3.3）。

## 5. 实测（判据与证据）

### 5.1 逐字节比对（§1 的判据来源）

命令形态（两棵已安装的树）：

```powershell
# 两代 dlx 树：3452292f… = host 0.1.7-alpha.1 ；e1472f28… = host 0.1.7-alpha.2
Get-FileHash <pkg>\lib\index.js -Algorithm MD5   # 逐包比对 + Compare-Object 比 patch yml
```

读数：`agent-team` / `agent-team-profile` / `client-ui-agent-team` /  shipped preset patch **全 SAME**；
`tool-agent-team` **DIFF**（549 → ，差异即 §1 的 system-reminder 扩写）。

### 5.2 会话丈量：名额从未被触达

- 语料：`C:\Users\l\.dsh\sessions\**\session.v*.jsonl.zstd`，**文件 / 51 715 325 字符**。
- ⚠ **方法学（可复现的前提）**：会话体是**多帧 zstd**（追加写），`zlib.zstdDecompressSync` 与
  `createZstdDecompress` **只解第一帧且不报错** —— 直接解会得到 197 字节的会话头并**静默给出 0 计数**。
  必须用支持多帧的流式解压（本次用 `py-zstandard` 的 `stream_reader`）。
- 判据**必须按事件**，不能按字符串：`spawn_teammate` 字符串在最大的那个会话里出现 ，全部是
  **每个请求都带一遍的工具 schema**；按 `type == "tool/call"` 且 `data.name == "spawn_teammate"` 数才是 **0**。
- 读数：`spawn_teammate` **0** · `team_task_*` **0** · `wait_agent` **0** · `interrupt_agent` **0** ·
  `send_message` **3**（三个 `origin:"subagent"` 的子会话各 回话）· `subagent` **3** ｜
  **运行时 `TEAM_MEMBER_LIMIT`：0**。
- 交叉来源：`~/.dsh/.shadow` 全树对 teammate 只有 命中，且全是分析文字，无使用记录 ⇒ 两个独立来源一致。

### 5.3 名额语义逐行核对（在 alpha.2 的包上，不是照抄文档）

| 断言 | 证据（`dsh-experimental-agent-team/lib/index.js`） |
|---|---|
| 创建时检查、终身累计 | `if (state.members.length >= this.maxMembers) throw … "TEAM_MEMBER_LIMIT"`，在 `journal.transact` 内 |
| 先落盘再 spawn | 先 append `team/member`（`phase:"provisioning"`），之后才 `startContinuable` |
| 失败也永久占名额 | 失败路径 `settleProvisioning()` **追加一个新版本**把 phase 改成 `failed`，全程**无删除** |
| 无移除路径 | 唯一写入是 `if (index < 0) state.members.push(member)`；`splice/pop/shift/delete` （唯一 `filter` 是只读筛 `provisioning`） |
| 名字不复用、`lead` 保留 | 重名抛 `TEAM_MEMBER_NAME_TAKEN`；`memberName()` 对 `name === "lead"` 抛 `TEAM_INVALID_MEMBER_NAME` |
| 包默认值 | `DEFAULT_MAX_MEMBERS = 16`（**alpha.1 与 alpha.2 同**；bundle 自己插 8） |

### 5.4 生效面与验证（本次落地怎么验的）

| 面 | 验法 | 期望 |
|---|---|---|
| 组合（部署面删 override 后） | `dsh --profile web --dump-config` | `agent-team` 的 `config` 为 bundle 的 5 键、`maxMembers: 8`；`preset-projection` 仍组合出 、`tool-subagent*` **0** |
| 文档一致性 | `npm run verify`（含 `audit:docs` ①②③④⑤⑥⑦） | `[run-tests] ALL PASS ✅` |
| 部署面文件 | `web` profile 的 `cordis.patch.yml` | 不再有 `agent-team` 条目；`headless` 本就没有 ⇒ 两 profile 一致 |
| 活体名额 | 本会话 roster 不受影响（名额只在**创建时**检查） | 无需重启即可读配置；**改 config 是否热生效**见 §6 |

## 6. 边界与未复核

- **`maxMembers` 的运行时拦截行为仍然没有被真机触发过**（BACKLOG 的 V3 不结案），但本次把它**量化**了：
  在 会话里离 4 都还差  ⇒ 「没验过」与「不可能验」是两件事，本 ADR 只主张前者。
- **未复核**：改 profile `cordis.patch.yml` 里 `agent-team` 的 config 是否**热生效**（`dsh.profile.patchReload: live` 说明
  patch 层可热加载，但 `agent-team` 的 config 变化是否触发该行重挂**未单独验过**）。⇒ 观察到的只是**组合**（`--dump-config`）正确；
  运行时生效以**下次宿主启动**为准。
- **未复核**：alpha.2 的 teammate 身份提示**没有在本机真跑过**一台 teammate（§5.2 已说明：本部署从未创建过 teammate）。
  本文只主张「包内字节与官方 README 如此」，不主张「本机见过它的效果」。
- **未复核**：`tool-agent-team` 在 alpha.2 里那处 `installed` 的**行号位移**（alpha.1 L530 → alpha.2 L538）是否
  伴随其他未读到的行为差异。已比对的是**整文件 diff**：除 §1 那处 system-reminder 外**只有位移**，无其他逻辑差异。

## 7. 落地清单

1. `CONTEXT.md` 的「teammate 名额」术语行（三值口径 + 实测 + 降级链）。
2. 本文（`adr/0099`）；`adr/0056` 头部加**状态指针 + 包版本 pin**（正文不动）；`adr/0098` §6 补一条指向本文。
3. `presets/projection.patch.yml`：persona ② 的「上限 4」→「上限 8（bundle 出厂值）」+ ③ 一句身份提示括注；
   声明行的 `description` 口径同步；F1 注释里的基线版本改 `0.1.7-alpha.2`。
4. `presets/README.md`：预算表改符号引用 + 实测读数；override 说明改成「随 bundle 出厂 8」；persona 长度**重测**后回填。
5. `README.md`（两处）与 `BACKLOG.md`（V3）对齐；`CHANGELOG.md` 新条目 + `package.json` 版本 + README 当前版本行。
6. 部署面：`~/.dsh/profiles/web/cordis.patch.yml` 删掉整条 `agent-team` override（先备份 `.bak-<时间戳>`）。
