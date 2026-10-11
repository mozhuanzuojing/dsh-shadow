# ADR-0112: 材料判定 —— DeepSeek-Bot 冻结快照（**A 思路借鉴 + C 反向取材**；B 互操作本轮不做）

- 状态：**已接受**（2026-10-11）。**本条是判定文档，不含实现**（落点见 `BACKLOG.md` 的 `T30`）。
- 决定日期：2026-10-11
- 关联：**ADR-0089**（材料对标总账）· **ADR-0091**（D 类九份真读判定 —— 本条沿用其「逐份 verdict + 证据锚点」体例）·
  **ADR-0111**（材料面的清单/内容分层：**登记**在 `MATERIALS.md` / `references.md`，**决策**在这里）·
  **ADR-0038**（Episode 收口边界：**不得引入 agent 自决任务边界** —— 与 §3.1 的 A1 有张力，**未解，见该节**）·
  **ADR-0090**（有损必须声明损失形态 + 交出恢复句柄）· **ADR-0001**（不引重服务 / 无依赖插件）·
  **ADR-0068**（`_meta.json` 并发纪律）· **ADR-0095**（派生索引层：`.md` 才是权威）·
  **ADR-0108**（可信根注册表）· **ADR-0050**（术语撞车的既有先例：废止 `mode:"recall"`）
- 定位：**判定文档**。回答「这份材料与本仓是什么关系、逐子系统收还是不收、什么刻意不引」。
- 触发：用户 **2026-10-11** 指令（提问 09:36 · 批准「同意建议 按建议执行」12:55，Asia/Shanghai）「把 DeepSeek-Bot 当材料处理，出判定文档」；形态（A/C 为默认、D 并入 A、B 不做）由用户裁定。

> **引用口径（本节起一律如此）**：证据一律 = **材料根 `G:\project\dsh1\DeepSeek-Bot--snapshot-v0.1.0\`**
> ＋ 表里的**仓内相对路径** ＋ 行号（少数几处为与**本仓同名文件**消歧义，写全根前缀）；
> pin = **`DeepSeek-Bot@41710f6a`** ＋ tag **`v0.1.0`**。快照是**冻结**目录（按 `AGENTS.md`「材料」节硬边界 1，不更新它）。
> ⚠ **这些引用在 `citation-audit` 里归「未判定」** —— `tools/trusted-roots.json` 实测是**空数组**、`<本仓>/../_src` 也不存在
> ⇒ 门**判不到**它们。**「未判定」不是「已验证」**（ADR-0049）；要让它们进门需要**人**去加根（ADR-0108 §2.3：agent 不得自行加根）。

## §0 材料身份（实测，不是转述）

| 项 | 实测值 | 锚点（= 快照内路径） |
|---|---|---|
| 上游 | `FeiZhuLulu/DeepSeek-Bot` —— **社区项目，非 DeepSeek 官方** | `DeepSeek-Bot--snapshot-v0.1.0/README.md:14` · `:98` |
| 快照目录 | `G:\project\dsh1\DeepSeek-Bot--snapshot-v0.1.0`（冻结；本轮不动它） | — |
| HEAD / tag | `41710f6aba363457fbed07be8b3ffd69b55ee918`（`41710f6a`）· tag `v0.1.0` | `git log -1` / `git describe --tags` |
| 版本 | 包 `ds-bot@0.1.0`；徽章自称 `v0.1_preview` | `ds-bot/package.json:2-3` · `DeepSeek-Bot--snapshot-v0.1.0/README.md:12` |
| 许可 | **Apache-2.0**（仓根 `LICENSE` 与包内 `LICENSE` 同名；第三方另列 `NOTICE`） | `DeepSeek-Bot--snapshot-v0.1.0/LICENSE:1-2` · `ds-bot/package.json:23` · `DeepSeek-Bot--snapshot-v0.1.0/NOTICE:4` `:10-16` |
| 宿主基线 | DSH `0.2.1-alpha.1`（Desktop 与 Web） | `DeepSeek-Bot--snapshot-v0.1.0/CHANGELOG.md:9` · `ds-bot/package.json:47-52` |
| 形态 | 单仓 ＋ 一个 DSH 插件包 `ds-bot/`（`dsh.client` 前端 + `dsh.bundle.patch` 挂载 + 独立 `web-search` 出口） | `ds-bot/package.json:26-31` `:53-60` |
| 能力面 | **多 Bot 运行时**（Bot = 一个 DSH Session）＋ **产品面**（群聊 / 记忆面板 / usage / secrets 卡 / Bot 浏览器 / 主题 / 3D 形象） | `DeepSeek-Bot--snapshot-v0.1.0/AGENTS.md:7-13` · `ds-bot/README.md:13-26` |
| 数据落在哪 | `~/.dsh` 下 `bot/` 与 `sessions/`（含 `memory/`、`state.json`、两个 `.sqlite`） | `DeepSeek-Bot--snapshot-v0.1.0/README.md:73` · `ds-bot/README.md:177` |
| 自述稳定性 | **保存的数据格式仍会变** | `ds-bot/README.md:5` · `DeepSeek-Bot--snapshot-v0.1.0/CHANGELOG.md:3` |

**为什么按「材料面」处理**：这是本仓既有的两层纪律 —— **登记**归 `MATERIALS.md`（清单）/`references.md`（内容·核实记录），
**决策**归 `adr/*`（`adr/0111` D1）。本条只回答「**判什么**」，**不复制**那两份文件里的事实登记
（同 `adr/0091`：那边是源、这边是决策）。

## §1 关系形态判定（**结论先行**）

| 形态 | 含义 | 本轮裁定 | 理由（可核） |
|---|---|---|---|
| **A 思路借鉴** | 收它的**判据与形态**，不搬实现 | **收（默认）** | §2 的 `A` 行。判据不依赖它的代码 —— 与 `adr/0089` §2 的量尺一致：**本仓只吸收判据与门禁，不吸收运行时与算法** |
| **C 反向取材** | 从它身上**反向**问出本仓缺什么 | **收（默认）** | §2 的 `C` 行（记账口径 · 变更可见性） |
| **D 反面参照** | 拿它当「本仓**不该**长这样」的样本 | **收，但并入 A**（作为 A 的一节，见 §3.2） | 单独成节会造出第二个结论面；D 的价值恰恰是**支撑 A 的判据**（口径同 `adr/0091` §3 的 `open-lovable`） |
| **B 互操作** | 与 `ds-bot` 的记忆**共存 / 打通** | **本轮不做**（另立一票，见 §6） | 见下三条 |

**B 不做的三条理由（都不是「没时间」）**：

1. **材料自己声明格式会变**：`ds-bot/README.md:5` —— *"Early release (v0.1). Features, tools and the
   **saved data format can still change**."*；`DeepSeek-Bot--snapshot-v0.1.0/CHANGELOG.md:3` —— *"Before 1.0, a minor version can contain
   breaking changes."* ⇒ 现在去对齐一个**自认会变**的格式，是把维护成本压在**别人还没定的接口**上：
   **风险与收益不成比例**（这正是用户裁定的理由）。
2. **跨的是「格式缝」而不是「路径缝」**：它的记忆是 `~/.dsh/bot/memory/` 下的 `MEMORY.md` + topics
   （**第三方** Agent Memory Repo 格式：一行一条、结尾 `[source: …; added: …]` 元数据），
   本仓权威是**工作区**里的 `.shadow/atoms/**`（ADR-0003 / 0095 / 0106）。两者 **home 不同、格式不同、生命周期不同**
   ⇒ 互操作要**同时**吃掉两边的变更。
3. **今天没有消费方**：本仓没有任何读 `bot/memory` 的路径（实测：`grep 'DeepSeek-Bot|ds-bot'` 扫本仓 = **0 命中**）
   ⇒ 开票前必须先答「**谁消费**」。否则就是 ADR-0087 那条「**不允许建没有消费方的机制**」的反面
   （`adr/0089` §2 对 `hl_mem` 用的是同一判据）。

## §2 逐子系统 verdict 表

判定记号：**A** = 思路借鉴 · **C** = 反向取材 · **D** = 反面参照（并入 A，见 §3.2）· **锚** = 当现实锚/对照物 · **—** = 不收。

| # | 子系统 | 材料侧证据（`@41710f6a`） | 判定 | 理由 / 本仓落点 |
|---|---|---|---|---|
| 1 | **压缩判据：在途 / 到点二分** | `ds-bot/src/host/steward.js:29-41`（`:32` `"switch"`=到点 · `:33` `"compact"`=在途 · `:37` 收口次数越多越该把「到点」算作到点）· `:20-27`（`check` / `hard` 双线）· `ds-bot/src/host/parts.js:5-13`（两种触发位置）· `DeepSeek-Bot--snapshot-v0.1.0/CHANGELOG.md:18` | **A（只收判据）** | 落 `compact` 的「**该不该收口**」判据清单；**⚠ 与 ADR-0038 §6「不引入 agent 自决任务边界」正面张力**，见 §3.1 |
| 2 | **压缩判据：用户原话逐字保留** | `ds-bot/src/host/steward.js:110-129`（`:112` *"What the user and other Bots sent you travels along **word for word**"*）· `:150-163`（`:153` `checkpointText` · `:160` `## Messages to you, word for word`）· `ds-bot/src/host/parts.js:7-8` | **A** | 收口**不得**把用户原话折叠成摘要。本仓收口产物（圈原子）本就**逐字保留原文** ⇒ **已具备，只登记**（§3.1） |
| 3 | **有损声明 + 恢复句柄** | `ds-bot/src/host/steward.js:158`（*"read_own_chat finds them **word for word**"*）· `ds-bot/src/host/parts.js:515-521`（模型没写出可用 note ⇒ DS Bot **自造 note 并声明原因**）· `steward.js:37`（*"a summary of a summary loses more"*） | **A** | 与 **ADR-0090 甲-1**「有损必须声明损失形态 + 交出恢复句柄」**独立收敛**；本仓已有（收口文件保留、可回放）⇒ 只登记 |
| 4 | **收口不被外部触发**（引擎自己的 `/compact` 被拒） | `ds-bot/src/host/parts.js:144-149`（*"`/compact` and explicit ranges are **refused**. Only DS Bot condenses a Bot Session, **when the steward says so**"*） | **A** | 「**一个判据只能有一个决定者**」（本仓 `ADR-0111` D6 / `AGENTS.md`「判据收一处」的同款）。本仓对应判据：收口只由写侧 `maybeCompact` 触发 |
| 5 | **写入侧纪律：独立 review**（不许依赖 agent 主动调工具） | `ds-bot/src/host/memory.js:14-22`（*"The review is what keeps memory from depending on a Bot deciding to call `remember`"*）· `:1032-1036`（会话 idle 时、一次一个）· `:337-340`（review 自己的 system prompt + 单次最多 `REVIEW_CHANGES_MAX`=8 条） | **A** | 本仓对应物 = 写侧 `flush` / `maybeCompact`（**不由模型自决**，ADR-0038）⇒ **同向，已具备**；登记 |
| 6 | **写入侧纪律：变更走同一校验路径** | `ds-bot/src/host/memory.js:1127-1159`（`:1146` 每条变更**再次**过 `entryProblem`；`:1152` 失败点名；`:1158` 失败**不许吞**) · `ds-bot/README.md:106`（*"One model call answers from the entries only, and its changes go through **the same checks as the tools**."*） | **A** | 「模型能提变更、但**落地必须过同一道校验**」= 本仓 ADR-0051（登记而非生成）同向；登记 |
| 7 | **写入侧纪律：条目 / 文件硬上限** | `ds-bot/src/host/memory.js:35`（`MEMORY_LIMITS = { entry: 300, main: 4_000, topic: 16_000, topics: 40 }`）· `:509`（单条超限**报错并给整改路径**）· `:517-523`（文件超限；**已超限的仍允许缩小**）· `:551`（topic 数硬顶） | **A（判据）+ 本仓缺口待判** | 本仓**没有**单条原子的字符硬上限（实测 grep `^const (MAX\|ENTRY\|LIMIT)[A-Z_]* =` 扫 `core/` = 0 命中）⇒ **可能是缺口，需验证**，见 §6 A2 |
| 8 | **写入侧纪律：变更前后像（journal）** | `ds-bot/src/host/memory.js:8`（*"journal.jsonl — every change, with the **line before and after**"*）· `:452-461`（临时文件 + `rename` 原子写，再 `appendFile`）· `:565`（`add` 记 `after`）· `:596`（`replace` 记 `before` + `after`）· `:618`（`remove` 记 `before`） | **A（形态）+ 本仓缺口待判** | 本仓**没有**记忆变更 journal（实测：`journal` 一词在 `adr/0099` 只指 Agent Teams 的 `journal.transact`，**无关**）⇒ **可能是缺口，需验证**，见 §6 A2 |
| 9 | **变更可见性**（用户看得见「记忆变了」） | `ds-bot/src/host/memory.js:530-539`（`news`：最近一次变更，对话头**只显示一次**）· `ds-bot/README.md:107` | **C** | 反向问本仓：写侧可见性目前只有**落盘失败横幅**（`getFlushWarn`）；**正向**「记忆已更新」提示**没有** ⇒ 需验证（§6 A2） |
| 10 | **记账口径：日志外的调用也要计量** | `ds-bot/src/host/usage.js:1-12`（`:4-8`：能进 Session 日志的从日志读；**日志外的**（checkpoint / handoff note / steward / 图像读取 / 标题 / 压缩）**边流边计**） | **C（判据）** | 「**账本必须覆盖零日志路径**」。本仓对应面（`query-log` / `audit/*` 是否漏计非原子路径）**需验证** |
| 11 | **SQLite 派生索引** | `ds-bot/src/host/chat-index.js:1-9`（`:9` *"**Without SQLite**, `read_own_chat` scans the logs as before"*）· `:48` `chat-index.sqlite` · `:76` `node:sqlite` · `:110` FTS5 + `trigram` · `usage.js:6`（`usage.sqlite`「派生、删了只丢计量过的调用」） | **—（同构对照）** | **不是反面参照**：它自己也把 DB 当**派生加速器 + 有回退** ⇒ 与 **ADR-0095 / T17** 同型（本仓已有）。⇒ 只作**外部正例**登记。⚠ 别拿本条去否掉 T17（见 §5.3） |
| 12 | **`state.json` 当权威**（团队一切一个 JSON） | `ds-bot/src/host/store.js:1`（*"the saved team (`state.json`)"*）· `:167-182`（全量序列化 + temp/`rename` + `revision` 自增）· `index.js:1-3`（roster / rooms / exchange log **都在一个 JSON 文件里**）· `store.js:26-35`（`mtime:size` 当「别人改过没有」的判据） | **D** | 与 ADR-0001 / ADR-0068 相反：本仓权威是**文件树**，`_meta.json` 只是并发纪律的落点，不是团队真相（§3.2、§5.1） |
| 13 | **常驻插件 + 单写者锁** | `ds-bot/src/host/home-lock.js:1-9`（首写者持 `state.lock`，第二个宿主**只读**；token 决定所有权）· `ds-bot/cordis.patch.yml:1-9` · `ds-bot/src/host/parts.js:589`（只读进程**既不收口也不换段**） | **D** | 锁是为「**内存镜像 + 全量写**」打的补丁；本仓没有内存镜像（§3.2、§5.2） |
| 14 | **多 Bot 运行时的权限与隔离契约** | `DeepSeek-Bot--snapshot-v0.1.0/AGENTS.md:11`（Main Bot 最高权限）· `ds-bot/README.md:14-21`（权限表：You / 主 Bot / 群管理 / 成员）· `ds-bot/src/host/memory.js:482-502`（`:486` 谁能写团队记忆；`:499-500` 拒绝话术**指路**）· `home-lock.js:3-9` | **锚（现实锚/对照物）** | 本仓的 agent 拓扑在 harness / Agent Teams 层，**记忆层不做会话编排**。它的价值 = 同机多写者的**真实读数口径**：`mtime:size` 探测外部改动 · `staleMs` · **token 而非 pid 决定所有权** |
| 15 | **secret 卡片** | `ds-bot/src/host/secrets.js:1-4`（值只在 `secrets.json`(**600**) 与本进程；工具结果剥离；模型请求前替换成 `[secret:<NAME>]`）· `:82` `:126` `:143-144`（temp + `0o600`）· `ds-bot/src/client/secret-card.js:1-4`（值只从输入往宿主走，界面**读不回**） | **—（两条纪律登记）** | 与本仓 `security/scrub.ts`（密钥打码 / 控制字符 / 注入短语）**同题**；本仓已具备 ⇒ 只登记，不引实现 |
| 16 | **usage 面板** | `ds-bot/src/client/usage-page.js:1-12` · `ds-bot/src/host/usage.js:1-12` | **—** | 产品面。可取的只有 #10 的记账口径；面板本身与本仓无关 |
| 17 | **UI / 3D / 主题** | `ds-bot/src/client/styles.js`（**105,384 B**）· `characters.js:4-9`（*"small 3D models … flattened into layers"*）· `themes.js:6-9`（八色主题推导全部 `--bt-*`）· `motion.js` | **—** | 本仓无产品面：消费方是 agent 与用户（Markdown / 读侧），不是 GUI |
| 18 | **Bot 浏览器** | `ds-bot/src/host/browser.js:1-5`（Electron webview，长轮询把读请求带回）· `ds-bot/src/client/bot-browsers.js:1-8`（每 Bot 独立 storage partition ⇒ cookie 不跨 Bot） | **—** | 与 `adr/0089` §2 C 对 `web-access` / `browser-use` 的「**仅登记**」同一处置（宿主**原生面**已有，要浏览器能力首选宿主原生） |
| 19 | **web-search provider** | `ds-bot/cordis.patch.yml:6-9` · `DeepSeek-Bot--snapshot-v0.1.0/AGENTS.md:42`（*"the `auto` web-search provider, **independent of the Bot team code**"*） | **—** | 与记忆层无关（材料自己也这么写） |
| 20 | **摘要件可丢弃 / 可重建** | `ds-bot/README.md:104`（面板摘要「条目变了就重写」）· `ds-bot/src/host/memory.js:9-10, 46-47`（`summaries/` + `SUMMARY_*` 上限）· `ds-bot/README.md:177`（*"`summaries/` … **safe to delete**"*） | **—（形态登记）** | 「派生摘要必须可丢弃重建」= 本仓派生件口径（ADR-0003 / 0095）同向 ⇒ 外部正例 |

## §3 三条值得写下来的

### §3.1 A1：压缩判据（在途/到点二分 + 用户原话逐字）—— **并附一条未解的张力**

**它怎么做的（事实）**：`check` 线（可用窗口的 `checkRatio`，默认 **0.8**）以上、或**一个回合进行到一半就越过 `hard` 线**时，
叫一次**独立的、小的模型调用**（context steward）读最新消息，只回答一个问题：
**工作到点了吗**（→ `switch`：写 handoff note，换一个新 part）**还是还在途**（→ `compact`：就地收口成 checkpoint）。
证据：`ds-bot/src/host/steward.js:20-27`（双线）· `:29-41`（system prompt：`:32` `switch` · `:33` `compact` ·
`:35` 反向核对「用户问的每一部分 vs 助手实际做了的」· `:40` 只许 JSON 一行）· `ds-bot/src/host/parts.js:5-13`（两种触发位置：
回合结束的 idle 维护 · 回合中的 overflow 路径）。**两条附带的形态值得单记**：

- **`switch` 失败回落 `switch`**（不是回落「继续缩」）：`parts.js:469-479` —— steward 给不出可用答案或抛错时
  落到新 part，并 `warn` 留痕 ⇒ **失败方向选择「少破坏」那一侧**（≥1 次收口就再丢一层细节）。
- **逐字保留的对象是「发给 Bot 的（用户与别的 Bot 的）消息」**，不是 Bot 自己的回复：
  `steward.js:112`（*"do not copy it"* —— 用户话会自己travel）、`:150-163`（`## Messages to you, word for word`）。

**与本仓的关系（判定）**：这是**A 类**取材，且**只取判据**：

| 可取的判据 | 本仓今天的形态（`core/writer/compact.ts`） |
|---|---|
| 「到点 / 在途」二分要**问出来**，不能靠「文件够大了」 | 收口由**客观时间间隔**触发（`compactCfg.gapMinutes` / `episodeGap`；`compact.ts:71` 开关、`:74-76` 派生 episode 且**只收口已关闭的那些**） |
| 收口次数越多 ⇒ 「到点」的门槛应越低（`steward.js:37`） | **本仓没有**这条棘轮（同一 episode 只收口一次，不存在「摘要的摘要」） |
| 用户原话逐字不得被折叠 | **本仓已满足**：收口产物是**圈原子**，正文逐字保留（`compact.ts:89-99`），且原文件保留可回放（ADR-0038 `Forget≠Delete`） |
| 有损必须给恢复句柄 | **本仓已满足**：收口文件在 `atoms/` 且可回放（同 ADR-0090） |

**⚠ 未解的张力（必须写下来，否则是一次「用对标绕开自家结论」）**：本仓 **ADR-0038 §6** 明确写「**不做方向 A**」——
*不引入「agent 自决任务边界」*，收口只按**客观时间间隔**判（`core/writer/compact.ts:19-20` 逐字重申）。
而 steward 的二分**正是**「让一个模型判任务边界」。⇒ **A1 落地时必须先答**：
「把二分当**判据**（人读的检查表 / 离线压缩的输入）而在**运行时**仍按时间间隔收口」是否成立？
这**不是**文字游戏：同一句话在「写进 ADR 的判据」与「接进 `maybeCompact` 的条件」两种落点下，含义完全不同。
⇒ 本条**不替它选**，写进 `T30` 的 A1 条目（`§6`），并标 **需用户/ADR-0038 级复核**。

### §3.2 D 并入 A：反面参照 = `state.json` 当权威 + 常驻插件 + 单写者锁

材料把**整个团队**（roster / rooms / exchange log）放在**一个 JSON** 里全量写，并用一把 `state.lock` 保证**单写者**
（`ds-bot/src/host/store.js:1` `:167-182`；`index.js:1-3`；`home-lock.js:1-9`）。
它自己**知道**这个形态的代价，并写成了补丁：`store.js:26-35` 用 `mtime:size` 探测「别人改过没有」；
`parts.js:589` 让只读进程**既不收口也不换段**；`memory.js:482-502` 用一张**谁能写哪一份**的表兜住并发写。

**为什么本仓不能长这样（这才是 D 的用处）**：

1. **权威位置相反**：本仓把权威放在**工作区里的 Markdown 文件**（ADR-0003 / 0106），派生件（`_index.md` / `_meta.json` / sidecar）
   **一律可重建**（ADR-0095）。引入一个 JSON 当团队真相 = 给记忆加**第二个真相**。
2. **常驻是它的前提，不是它的选择**：它的锁存在，是因为**宿主内存里有一份镜像**且**全量回写**
   （`store.js:1-3` 的 `state` 对象；`home-lock.js:2-3` 逐字：*"each host keeps the team **in memory** and writes
   `state.json` whole, so two hosts at once would undo each other's changes"*）。
   本仓没有内存镜像：**没有进程在跑时，读路径必须照样成立**（ADR-0001「无依赖插件」）。
3. **本仓的对应判据已经存在且更窄**：`persistence/meta.ts` 的 `mutateMetaVersioned`
   —— `stat 取版本 → 读 → 改 → 带守卫写 → FS_STALE_VERSION 重读重试`（ADR-0068）。
   它与材料的 `mtime:size` 是**同一类判据**（用文件指纹识别外部改动），差别是**粒度**：
   材料把整个团队的真相压进一个文件，本仓把**唯一需要 RMW 的派生元数据**（`_meta.json`）单独收口。

⇒ **结论**：D 这一节产出的不是「一条要抄的东西」，而是**一条要防的滑坡**（§5）。

### §3.3 A2：写入侧记忆纪律三件 —— 逐条对照本仓现状（**含两处实测缺口，需验证**）

| 纪律 | 材料怎么做（锚点） | 本仓今天 | 判定 |
|---|---|---|---|
| **独立 review**（不靠 agent 自觉） | idle 后由**独立一次模型调用**读新增消息并增删改；`memory.js:14-22` `:1032-1036` `:337-340` | 写侧 `flush` / `maybeCompact` 自动跑，**不由模型决定要不要写**（ADR-0038 起收口触发在写侧） | **同向，已具备**（登记） |
| **条目硬上限** | 单条 **300** 字符、`MEMORY.md` **4,000**、topic **16,000**、topics **40**；超限**报错并给整改路径**（`memory.js:35` `:509` `:517-523` `:551`） | 实测**没有**单条原子的字符上限常量（`grep '^const (MAX\|ENTRY\|LIMIT)[A-Z_]* =' core/` = 0 命中） | **可能缺口** —— 但「一条原子 = 一回合原文」与「一条条目 = 一个人工提炼的事实」**并不同构** ⇒ **需验证**，不直接开票 |
| **变更前后像（journal）** | `journal.jsonl` 逐条记 `before` / `after`（`memory.js:8` `:452-461` `:565` `:596` `:618`） | 实测**没有**记忆变更 journal（`journal` 仅出现在 `adr/0099` 引 Agent Teams 的 `journal.transact`） | **可能缺口** —— 本仓另有一条更窄的记账（`audit/`、`query-log/`、`_meta.json` 的 `revision`）**未逐项核对** ⇒ **需验证** |
| **变更可见性** | 对话头显示一次「记忆已更新」（`memory.js:530-539`；`ds-bot/README.md:107`） | 写侧可见性只有**失败**方向（`getFlushWarn` 横幅 / `lastScopeNotice`） | **可能缺口**（正向提示没有） ⇒ **需验证** |

⇒ 三件里**没有一件**能在本轮直接开票：**逐条判定「本仓是不是真的没有」是 A2 的工作内容本身**（见 `§6` / `BACKLOG.md` `T30`）。

## §4 术语撞车表（**并写明本 ADR 不新建 `GLOSSARY.md`**）

| 词 | 材料里的义（`@41710f6a`） | 本仓的义 | 撞不撞 / 处置 |
|---|---|---|---|
| **`memory` / `MEMORY.md`** | 一 Bot 一份的 Markdown 条目（一行一条、结尾 `[source: …; added: …]`），**进 system prompt**（`ds-bot/README.md:90` `:94` `:97`） | `.shadow/atoms/*.md` **记忆原子**（一回合 / 一圈一个文件）＋ `indexes/` 派生件 | **撞**：同词不同物（**注入 prompt 的人工条目** vs **投影语料**）。⇒ 引用处写「DS Bot 的 `MEMORY.md`」/「本仓记忆原子」 |
| **`checkpoint` vs 收口（`compact`）** | **就地**替换旧消息：摘要 ＋ 逐字保留的新近消息（`steward.js:150-163`；`parts.js:7-8`） | `core/writer/compact.ts` 的 **收口**：episode → 圈原子（召回面）＋ 派生纪要（成长面），**时间间隔触发、无 LLM** | **半撞**：同动机（腾上下文 / 收敛热集）、**不同层**（会话运行时不变量 vs 落盘语料）。⇒ 写作 `checkpoint（DS Bot）` / `收口（本仓 compact）` |
| **`Bot` vs `Observer`** | **Bot = 一个 DSH Session**（有角色 / 模型 / 形象 / 权限）（`DeepSeek-Bot--snapshot-v0.1.0/AGENTS.md:9-12`） | **Observer** = 观察窗口 / 透镜（`subject/observer`；`CONTEXT.md` 的导航伞条目） | **撞词不撞义**（英文同词、概念无交集）。⇒ 本条内一律写 `Bot（DS Bot）` |
| **`recall`** | 工具：**关键词**检索全部条目（≤ `RECALL_MAX`=30）＋ 读整个 topic（`memory.js:42-43` `:872-878`） | **`recall_shadow`** = 任务恢复包（自然语言 → 恢复包）；另有 `read_shadow` 的主题召回 | **撞**。**既有处置先例**：`mode:"recall"` 因与 Recall Continuity **撞名**而**废止**（ADR-0050）⇒ 本轮沿用「**记录 + 限定语**」，不动名字 |
| **`journal` 粒度** | `journal.jsonl` = **每次记忆变更的前后行**（`memory.js:8`） | 本仓**没有**记忆变更 journal；`journal` 一词只出现在 `adr/0099` 引 Agent Teams 的 `journal.transact` | **今天不撞**，但**若将来引入必须先说清是哪个 journal**（否则又是一个「同词不同物」） |
| **`state.json` vs 「文件即权威」** | 团队一切在**一个 JSON**（单写者锁 + 全量写）（`store.js:1` `:167-182`；`home-lock.js:1-9`） | 权威 = **文件树**；`_meta.json` 是**并发纪律的落点**，不是团队真相（ADR-0003 / 0068 / 0095） | **撞**（都在磁盘上，**权威粒度相反**）⇒ 本 ADR §5.1 专段钉住 |
| **`part` / `segment`** | 一次「换新会话」之后的**那一段会话**（`parts.js:1-16`；`:535` `[Handoff · part N]`） | 本仓 **`episode` / 圈**：由**时间间隔**切出来的**语料单位** | **不撞但要注意**：材料的 `part` 是**运行时容器**，本仓的 episode 是**派生切分**。⇒ 不互相翻译 |

**本 ADR 刻意不新建 `GLOSSARY.md`**（理由三条）：

1. **本仓术语的权威已经在两处**：`CONTEXT.md`（词条 + 「ADR 条数口径」那类度量口径）与 `AGENTS.md`（纪律）。
   再建一份 glossary = **造第二份真相** —— 正是 `AGENTS.md`「**判据收一处 / 不造第二份实现**」要防的
   （同族事故：`tools/comparison-points.lib.ts`、`core/util.ts:numOr`）。
2. **今天的撞车只有上面几处，且都能用「限定语」在引用处解决**（首个也是唯一先例：ADR-0050 废止 `mode:"recall"`）。
   为一个**局部**问题造一个**全局**容器，收益 < 维护成本。
3. **是否需要一个跨仓术语表**（把**材料侧**术语也纳入本仓词条）**是另一件事**，它牵动 `CONTEXT.md` 的入口
   （「词条 owned by 什么」）⇒ **留第二轮决策**，本轮只在 §6 记名。

## §5 本仓刻意不引入（防止后来者拿它当「本仓该长这样」的依据）

| # | 形态 | 材料里怎么做的 | 本仓为什么**不**这样（判据） |
|---|---|---|---|
| 5.1 | **`state.json` 当权威** | 团队 roster / rooms / exchange log 一个 JSON 全量写＋单写者锁（`store.js:1` `:167-182`；`home-lock.js:1-9`） | 权威必须是**工作区文件树**（ADR-0003 / 0106），派生件一律可重建（ADR-0095）。加一个 JSON 权威 = 加一个**必须同步的真相** |
| 5.2 | **常驻服务 / 单写者锁** | `DeepSeek-Bot--snapshot-v0.1.0/ds-bot/cordis.patch.yml:1-9` 挂载常驻插件；`state.lock` 决定谁是唯一写者；只读进程功能降级（`parts.js:589`） | 本仓是**无依赖插件**（ADR-0001）：**没有进程在跑时读路径必须成立**。锁是「内存镜像 + 全量写」的补丁，本仓没有那个前提（§3.2） |
| 5.3 | **向量库 / DB 当权威** | ⚠ **要写准**：材料**没有**把 DB 当权威 —— 它的两个 SQLite 是**派生 + 有回退**（`chat-index.js:9`；`usage.js:6`） | 本仓刻意不引的是「**DB 当权威**」；而「**DB 当派生加速器**」本仓**已有**（ADR-0095 / `T17`，默认仍是 `fs`）。⚠ **不得拿本条否掉 T17** |
| 5.4 | **产品面**（UI / 3D / 主题 / usage / secrets 卡 / Bot 浏览器 / web-search） | `styles.js`（105 KB）· `characters.js:4-9` · `themes.js:6-9` · `usage-page.js` · `secret-card.js` · `bot-browsers.js` · `DeepSeek-Bot--snapshot-v0.1.0/ds-bot/cordis.patch.yml:6-9` | 本仓的消费方是 **agent 与用户读的上下文产物**，不是 GUI。引入 = 把记忆层变成产品，并把它拖进宿主版本面 |
| 5.5 | **「一 Bot 一会话 + 每群每成员一个隐藏会话」的编排** | `ds-bot/README.md:13`（*"Each member has its own **hidden Session** per group"*）；`DeepSeek-Bot--snapshot-v0.1.0/AGENTS.md:9-10` | 本仓的 agent 拓扑在 **harness / Agent Teams** 层，**记忆层不做会话编排**（记忆只管语料与投影） |

## §6 未做项（→ `BACKLOG.md` 的 `T30`；此处只列名，不复制其内容）

1. **A1 压缩判据**：把「在途 / 到点二分」与「用户原话逐字保留」吸收为 `compact` / 离线压缩的**判据**（**不改机制**）；
   **前置**：§3.1 那条与 **ADR-0038 §6** 的张力必须先判。
2. **A2 写入侧纪律**：**条目硬上限 · 变更前后像（journal 式）· 变更可见性** 三件**逐条判定本仓是否有缺口**，
   **有缺口才开票**（本轮只有 grep 级实测，标「需验证」）。
3. **B 互操作**：与 `ds-bot` 的记忆共存 / 打通 —— **另立一票**，理由见 §1（材料自认 v0.1 数据格式会变；无消费方）。

> **不在 T30 内**：§4 的「跨仓术语表是否新建」留**第二轮决策**（它牵动 `CONTEXT.md` 的词条归属），本轮只记名。

## §7 判据与可复核命令

```powershell
# ⚠ 本机 node 不在 pwsh 的 PATH 上（与 adr/0111 §「判据与可复核命令」同款口径）
$node = "$env:LOCALAPPDATA\mise\installs\node\26.10.0\node.exe"
$snap = 'G:\project\dsh1\DeepSeek-Bot--snapshot-v0.1.0'

# ① 材料身份与冻结形态（pin）
git -C $snap log -1 --format='%H %d'        # 期望 41710f6a…  tag: v0.1.0
git -C $snap describe --tags                # 期望 v0.1.0
git -C $snap status --porcelain             # 期望空（快照未被改动）

# ② 压缩判据：在途/到点二分 + 逐字保留
Select-String -LiteralPath "$snap\ds-bot\src\host\steward.js" -Pattern '"switch"|"compact"|word for word|summary of a summary'
Select-String -LiteralPath "$snap\ds-bot\src\host\parts.js"   -Pattern 'inTurn|word for word|refused'
Select-String -LiteralPath "$snap\CHANGELOG.md"               -Pattern 'word for word|stopping point'

# ③ 写入侧三件（独立 review / 硬上限 / journal 前后像）
Select-String -LiteralPath "$snap\ds-bot\src\host\memory.js" -Pattern 'MEMORY_LIMITS =|Every change, with the line before|op: .add.|before, after'

# ④ 反面参照（权威位置 / 常驻 + 锁）
Select-String -LiteralPath "$snap\ds-bot\src\host\store.js"     -Pattern 'state\.json|in memory|revision'
Select-String -LiteralPath "$snap\ds-bot\src\host\home-lock.js" -Pattern 'state\.lock|in memory|token'

# ⑤ 本仓侧的「缺口」实测（A2 的前置读数；期望：两条都是 0 命中）
Select-String -LiteralPath .\core\writer\compact.ts -Pattern 'journal'                       # 0
Select-String -Path .\core\**\*.ts -Pattern '^const (MAX|ENTRY|LIMIT)[A-Z_]* ='              # 0

# ⑥ 入口门（本条只加一个 .md，必须 exit 0）
& $node tools/citation-audit.ts .
```

## §8 未做 / 边界（诚实）

- **本条不改任何源码 / 配置、不新增依赖**（与 ADR-0091 §6 同款：判定与实装各走一步）。
- **只读与四个可比面相关的部分**：读过 root `README.md` / `AGENTS.md` / `CHANGELOG.md` / `NOTICE` / `LICENSE`、
  `ds-bot/README.md`、`ds-bot/package.json`、`cordis.patch.yml`，以及 `ds-bot/src/host/` 的
  `steward.js`（全文 164 行）· `parts.js`（头部与收口段）· `memory.js`（头部 + 校验 + journal + review 段）·
  `store.js` · `home-lock.js` · `secrets.js` · `usage.js` · `chat-index.js` · `browser.js`，和 `src/client/` 的**文件头**。
  **未读**：`client.js`（生成物，716 KB）、`styles.js` 正文（105 KB）、`dev/**`、`test/**`（68 个测试文件）、
  `groups.js` / `roster.js` / `turns.js` / `i18n.js` 全文。⇒ 本条的判定**覆盖「是什么关系、收不收」，不覆盖「它的实现质量」**。
- **未跑这份材料**：未 `npm ci`、未起 DSH、未跑 `npm test` ⇒ 全文所有断言都是**读源码**得出的，**不是运行读数**。
- **本仓侧只有 grep 级实测**：`journal` 0 命中、无单条硬上限常量 ⇒ 一律标「**需验证**」，
  **不得**当成「已确认缺口」（同 `AGENTS.md`：报「实测」前，探针实现与被量那一侧都要看过）。
- **未评估 B 的实现可行性**：只判「本轮不做」，没有做格式对齐的可行性研究。
- **`ds-bot/README.md:5` 的「数据格式会变」是材料自述**，不是我们对上游的预测。
- **引用门判不到本条的材料引用**：`tools/trusted-roots.json` 实测 **空数组** ⇒ 本 ADR 里的
  `DeepSeek-Bot--snapshot-v0.1.0/…:<行号>` 在 `citation-audit` 里全部归「**未判定**」，
  **不是「已验证」**（ADR-0049）。要它们进门，需要一个**人**把快照加成可信根（ADR-0108 §2.3：**agent 不得自行加根**）。

---

## 补记

（本 ADR 的后续更正写在这里，不改正文 —— 与 `adr/0049` / `adr/0106` / `adr/0111` 同款处置。）
