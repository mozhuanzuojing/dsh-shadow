# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本；每个条目保留完整决策/边界/验证记录。


## [v1.14.0] 新增第 6 个 NodeType `resource`：`.shadow/resources/` 资源卡 → 派生投影（ADR-0051）

用户 2026-09-10 决定「给 dsh-shadow 加 `resource` 作为新 Node 类型」。落地时先做了**归类冻结**（ADR-0051）：资源卡是 **source**（tool/agent 写的普通文件），`resource` 节点是 **Projection**（派生、可重建）——两者分开，才不违反 Shadow Contract（ADR-0043）。**不新增 mode**（仍 61），**不引向量库**（ADR-0001），**不做 Store**。

- **类型**：`NodeType` 增 `resource`（`memory|code|document|decision|concept|resource`）；`shadow_query` 的 `scope` 收 `resource`，工具描述同步（`index.ts`）。
- **源层格式**：`.shadow/resources/<name>.md`（`.md` 不区分大小写）——一级标题=名字；`- 键：值` 收固有层（`source/来源/链接/地址/出处`、`type/类型`、`authority/权威性`、`activity/活跃度`、`risk/风险`、`一句话`；中英键名都收）；`## 投影 @ <问题>` 段收按问题的投影（`相关性/新颖性/可用性/启发度/可复用性` + `引用证据` + `结论`）。**状态机**：一级标题=名字；标题含「投影」开一段投影；**其它标题一律回到固有层**（否则后面的固有层字段会被投影段吞掉——审查 A1）；投影段里写了固有层字段（如 `source`）时回落到固有层，不静默丢。
- **派生**（`core/resource.ts`，纯函数 / 无 LLM / 不猜字段）：一张卡片 → 一个 `ShadowNode{type:"resource"}`，`source` 指向卡片文件，`evidence = [卡片的 source]`（**不做二次截断**——卡片是事实源，截短会让来源不可回查），`relations` 只派生 `references`；`createdBy:"tool"`（卡片由人或 agent 经工具写入，记录口径统一为 tool）；`kind` 不设（`kind` 是 memory 的二级属性）。**content 顺序：按问题的投影段在前**（分数 / 引用证据 / 结论），固有层在后——读侧 `queryShadow` 只取前 6 行，倒过来会让结论与引用证据永远看不见（审查 A2）。
- **id**：以**文件名**为准 `sr-<slug(文件名)>`（同一资源目录内文件名天然唯一；非 ASCII 文件名 slug 会退化成 `mem`，改用短哈希兜底）——不用标题，因为两张卡可以同名。
- **证据门同门**（两道：解析层先挡 + `core/lineage-validator.ts` 兜底）：卡片没写 `source` → `parseResourceCard` 直接不产出卡片（先挡）；万一有 resource 走到投影，`validateAtomProjection` 再挡一次 → **不上投影**，卡片保留在磁盘。理由：**收进库 ≠ 有出处**。解析不出来（无标题/无 source）直接返回「不投影」，不猜。
- **投影合并**（`query/reads.ts`）：`shadow_query` 的投影 = `deriveShadowNodes(记忆原子)` + `deriveResourceNodes(资源卡)`；资源目录不存在/不可读 = 「没有资源卡」（**无数据，不是缺件**，故不适用 ADR-0049 的「降级必须可见」要求；也没有任何「已核实/已存在」的声称）。
- **id**：见上（文件名派生的 `sr-<slug>`）。
- **验证**：新增 `test/resource-node.test.ts`（解析 / 投影 / 无 source 不上投影 / 证据门两个方向 / scope 过滤 / 中文键名 / 脏值截断 / id 不撞）→ `ALL PASS ✅`；回归 `test/recall-attribution.test.ts`、`recall-envelope`、`recall-routing-eval`、`evidence-gate`、`atom-kind`、`lineage`、`query-observatory`、`concept-guards`、`missing-dependency` 全 `ALL PASS ✅`；`npx tsc --noEmit` 与 `npm run build` 均 exit 0。
- **独立审查与修复（同日，两个不同视角）**：正确性/边界 + 契约/文档/发版各派一位独立审查，共报 3+2 条「一旦错了就得返工」，父代理逐条复核后修掉 —— (a) 解析状态机吞字段（投影段后再写固有层 → 字段被丢、整卡不上投影）→ 修：非投影标题复位 + 别名回落；(b) 结论/引用证据在真实 `shadow_query` 输出里被 `content.slice(0,6)` 截掉（测试只在 node 层断言 = 假通过）→ 修：content 改投影段优先，**测试断言移到渲染层**；(c) `出处` 被归成 authority 导致该卡不上投影 → 修：`出处`→source；(d) 大写 `.MD` 被跳过 → 修：大小写不敏感；(e) `resource` 证据门只判数组长度（空白 locator 也能过）→ 修：要求至少一个非空 locator。另修 id 由标题改为**文件名**（两张卡可同名）、证据不再二次截断。未改的记账项：非法 `scope` 值被滤空后退化为「全部类型」（既有行为，非本轮引入）、大目录串行 I/O、`projectionStore` 缓存无 `invalidate` 调用点（现在只能删 `shadow-index/nodes.jsonl`）。
- **已知边界**：`projectionStore` 开启且缓存命中时，缓存不感知资源目录变化（`invalidate`/`invalidateFor` 目前**没有调用点**，实际只能删 `.shadow/shadow-index/nodes.jsonl` 触发重建）；默认关闭，不影响默认路径。卡片属性是原文快照，系统不自动重抓（与「不 LLM 补写」一致）。
- **不属本轮**：投影模式预设里「资源侦察员 / 创意专家」的工作方式（那是预设平面），本版只做插件的类型与门。
- **待实测（需重启 web profile）**：改的是源码 + `dist`，本会话用的是**重启前载入的 dist**——所以「在真会话里 `shadow_query(..., { scope: ["resource"] })` 能查到卡」这条**尚未真机闭环**，重启后按 §上「验证」的同一份数据复核。重启前预检已过：`dsh --profile web --dump-config` exit 0、无 `Error:`，`- id: dsh-shadow` 在册、`shadowRoot: D:\project\dsh1`。


## [v1.13.2] 投影模式：「编排者与专家不重做同一件事」（④ 由「逐条复核」改为「只验一错就要返工的那几条」）

用户 2026-09-10 提出：**子 Agent 应承担与主 Agent 不重叠的活，避免职责重叠与重复推理，降低 Token 的冗余消耗**；并要求**用平常中文，不造生僻词**。审查发现现有 ①–⑤ 只回答了**横向**（专家之间怎么切、怎么不撞车），对**纵向**（子 Agent 与主 Agent 之间）完全空白——而 `④` 恰恰明文要求父代理「专家声称的事实自己跑一遍」，等于把专家的推理重做一遍；这条同时存在于用户级规则 §四（经 `sync-rules.py` 聚合进 `~/.dsh/AGENTS.md`，**每个会话都背**）与本预设的压缩副本里。本轮把这一维补上，**不新增能力、不动插件运行时的任何 mode/API**。

- **① 增补（该不该派）**：一句话说得清、只动一处、不需要旁人视角的自己做；要跨文件、要独立证据的必须派。为切活而看目录/搜代码/读关键文件**不算重做**；**不许先把成果做出来再派专家重写**。
- **③ 增补（原文不重复贴）**：同一段原文只进一个专家的提示词，其余专家给「结论摘要 + 原位路径」；**例外**——故意要独立判断的审查各读原文，那是花 Token 买独立性（守住 `moe-subagent-dispatch.md:31`「不同视角才有交叉覆盖」）。同时要求专家输出把结论分两栏。
- **④ 改写（只验要紧的）**：只对「一旦错了就得返工的」那几条跑命令/写探针/读代码；其余**采信但按未复核处理**（不能当已验的结论用），并须在交付物里列「未复核：N 条」；**一栏都没标的输出按不合格退回重派**——这道兜底靠格式合法性，**不靠父代理通读找漏**（通读找漏就是事后判，浪费照样发生）。
- **⑤ 增补**：并行判据由「互不依赖」补为「互不依赖、且各干各的那一份」。
- **用户级规则同步（规则为源）**：`~/.agents/rules/moe-subagent-dispatch.md` 标题 + §一（新增第 4 条「该不该派」）+ §二 + §三（第 4、7 条）+ §四（整节改写）+ §五 + 落地 一并更新；随后 `sync-rules.py` 重生成 `~/.dsh/AGENTS.md`、`sync-rules-wsl.py` 同步 WSL 镜像与 `/home/g/.dsh/AGENTS.md`。
- **用词**：全篇只用平常中文——「正交」不出现，判据写成「一旦错了就得返工的」；未用「承重」这类比喻。
- **同步面**：`preset.yml` 描述、预设 `README.md`、主 `README.md`「投影模式」节与版本表、`package.json` 1.13.1 → 1.13.2。
- **验证**：① 包内 ↔ 安装副本三文件 SHA256 一致（`F8114A31…` / `A4D0141A…` / `8BD6C409…`）；② 宽容 YAML 解析（忽略 `!!js`）通过，仍 16 行、`- id:` 16；③ persona 文本 1204 → **1476** 字符（+272，常驻成本已计入），①–⑥ 齐全、5 个新判据关键词全中、旧句「专家声称的事实自己跑一遍」已消失；④ `~/.dsh/AGENTS.md` 重生成 41647 → **43961** 字节，新句在、旧指令句仅在「改为」说明里出现一次；⑤ WSL 侧规则文件与 Windows `cmp` 一致（`RULE_IDENTICAL`），WSL 聚合已刷新；⑥ **补掉 v1.13.1 遗留的挂载校验**：`agentPresets.copy('projection','projection-probe')` → `read` 得 13285 字符且 5/5 新判据命中、旧句已去 → `standingKeyFor('projection-probe')` **mounted（全新世代）** → `remove` → `standingKeyFor('projection')` mounted → 预设清单 5 个无残留；（本轮无 TypeScript 改动，`dist` 不需重建；`node test/recall-attribution.test.ts` 回归 ALL PASS）
- **边界**：只改 persona 文本、用户级规则与文档；**不改**插件运行时 mode/API/服务/隔离域，不引依赖；预设仍是 `standard` 的完整拷贝。
- **遗留**：行为级效果（模型是否真按「只验要紧的」做）要在**真开投影会话**时才看得到——本会话跑的是 `cordis` 预设，投影 persona 不作用于它，故记为**待实测**，不伪称已验。


## [v1.13.1] 投影模式预设集成「契约与根因卫生」

把用户级全局约定（`~/.agents/AGENTS.md` 前半：根因三部曲、禁止生造词、结论进 memory 存档）与 ADR-0050 澄清检查经验（四查）压短写进**投影模式 persona ⑥**——随包发布；完整全局条文仍以 `~/.agents/AGENTS.md` / DSH 聚合的 `~/.dsh/AGENTS.md` 为准（⑥ = 投影侧常驻强化，非全文拷贝）。人格落地用语统一为「写入 shadow 或项目文档」（对应全局 memory 存档）。

- **persona 增补**（`agent-presets/projection/agent.cordis.yml`）：⑥ 契约与根因卫生；回望句补 `recall_shadow`（内部 `mode:recovery`，勿自造 `mode:recall`）。投影中文块约 **1164** 字符（常驻成本已计入）。
- **审查跟进**：回望段去掉「一般不需要手动改 shadow」，改为「日常采集自动落盘；关键根因/约定仍按 ⑥ 写入」——消解与 ⑥ 的软冲突；说明层「memory」与人格「shadow/项目文档」对齐。
- **同步面**：`preset.yml` 描述、预设 `README.md`、主 `README.md`「投影模式」节与版本表。
- **安装副本已同步**：`~/.dsh/.agent-presets/projection/` 三文件与包内 SHA-256 一致；改前备份带时间戳 `.bak-YYYYMMDD_HHMMSS`。
- **验证**：包内 ↔ 安装副本 SHA 一致；persona 含 ⑥ 关键词 + 回望例外句 + ①–⑤ 保留；`- id:` 行仍 16；无 `projection-probe` 残留。**`standingKeyFor` 全新挂载**：本机无 PATH 上的 `dsh`/`pnpm`（未跑通 `copy→standingKeyFor(probe)→remove`）；宿主下次挂载新世代时校验——与 MEMORY「CLI 难直接触发」一致，**不伪称已挂载 OK**。
- **边界**：只改预设人格与说明；**不改**插件运行时 mode/API；不把本仓「commit 后必须 push」写进通用人格。


## [v1.13.0] API 正名硬切（ADR-0050）

破坏性读侧入参/mode 正名：删旧名、无兼容别名；旧名显式拒绝（禁止落空进默认召回）。**不扩能力。**

| 废止 | 正名 |
|------|------|
| `mode:"recall"` | `mode:"recovery"`（`recall_shadow` 内部跟改） |
| `mode:"identity"`（推进 timeline） | `mode:"identity-advance"`（读 curated 锚仍用 `args.identity`） |
| `args.verify` | `args.verifyEvidence`（`mode:"verify"`=VerificationRun 不动；带 `verify` 键即废止） |
| `mode:"reality"`（federation 注册） | `mode:"real-evidence"` |
| lineage `EvidenceRef` | `AtomEvidenceRef`（Gateway `EvidenceRef{path}` 不动） |
| `args.recall` 旁路 | 删除并纳入废止表 |

- **实现**：`query/query.ts` `retiredApiMessage` 早退；`reads`/`observer-kernel`/`federation` 正名；`core/lineage.ts` 类型重命名；`core/intent.ts` 布尔旗标跟 `verifyEvidence`（审查补洞）。
- **文档**：ADR-0050；CONTEXT.md mode 表 + 术语；README 路由表；ADR-0023 勘误行；schema `model-observation` 措辞。
- **澄清补丁（同版跟进）**：CONTEXT 去掉「mode 串不变」假表述；ADR-0015 勘误；`intentOf` 认 `mode:recovery|identity-advance` 等；recovery/Continuity/文件名注释桥；systemPrompt + schema 消歧；`args.recall` 废止文案区分 `config.recall`。
- **验证**：棘轮仍 61 mode；`test/recall-envelope.test.ts` 旧名拒绝 + 保留面（`identity` / `verifyEvidence` / `mode:verify`）成对断言；归因/episode/缺件回归 ALL PASS。


## [v1.12.9] 投影模式预设集成「子代理分工」纪律

把用户 2026-09-08 对 v4.1f 的建议（多用子代理、父代理要会写「激活专家」的提示词、做好任务划分、别让一个代理干所有任务类型的活）落进**插件自带的投影模式预设**——随包发布，不依赖某台机器的用户级规则目录。

- **persona 增补**（`agent-presets/projection/agent.cordis.yml`）：投影模式人格里加一段「工作方式」，自包含五条——① **先分活**（按类型切开、标出可并行与串行点、写进 todo）② **准确激活专家**（实现按模块切 / 排障带现象与**已证伪的假设** / **审查至少两个不同视角** / 调研要证据 / 文档对齐已有口径 / 测试禁止 mock 掉被测物）③ **提示词七要素**（角色 → 仓库路径与构建测试约定 → 任务产出 → 必要上下文 → 约束 → 验收命令 → 输出格式；**专家看不到父会话，必须自包含**）④ **派了必须验收**（专家声称的事实自己跑一遍，不采信未验证断言；冲突由父代理裁决；判错带证据回推）⑤ 并行与扇出。persona 400 → 909 字符（常驻成本已计入，换来的是编排纪律）。
- **同步面**：`preset.yml` 描述、预设 `README.md`（新增 What it configures 段落：自包含简版 + 可选完整版）、主 `README.md`「投影模式」节（补纪律说明与「全新挂载校验」做法）。
- **安装副本已同步**：`~/.dsh/.agent-presets/projection/` 三文件与包内 SHA-256 一致；改前备份 `agent.cordis.yml.bak-20260909_091037` / `preset.yml.bak-20260909_091037`。
- **验证**：`agentPresets.copy('projection','projection-probe')` → `standingKeyFor('projection-probe')` → `mounted OK`（**全新世代**，真校验编辑后的文本，而非已挂载的旧世代）→ `remove` 清理；`standingKeyFor('projection')` 亦 `mounted OK`；宽容 YAML 解析（忽略 `!!js` 自定义标签）得 16 行、persona 含全部纪律关键词；`~/.dsh/.agent-presets/` 无残留探测预设。
- **边界**：只改 persona 文本与文档，**不动任何插件行、服务或隔离域**；预设仍是 `standard` 的完整拷贝；不引入新依赖。


## [v1.12.8] 缺件不静默纪律（ADR-0049）+ 召回路由评测（C6）+ references.md 三处更正

接 2026-09-08 参考材料研究（§二 2.5 与 §三 3.6）与 §六 的待办，落两件 + 清一批小账。**无 LLM、无新依赖、不引向量库（ADR-0001）。**

- **① 缺件不静默升为统一纪律（ADR-0049）**：把此前只写在 Evidence Provider 的「未装 → `unavailable`，绝不静默 fallback」提成**全插件纪律**，冻结四条规则——只降级不抛错 / 必须可见 / 绝不冒充成功 / 缺件只陈述事实；并逐条盘点 9 条可选增强的缺件行为（摘要、语义召回 B 档、推理导航、知识树导航、`zg`、Projection Store、`retention`/`forget`/`compact`、`verify`，表见 ADR-0049）。**顺带修一个反例**：`evidence/gateway.ts` 的 `routeVerify` 在 provider 名不存在时**静默退回 fs**（`evidenceProvider` 拼错就会把「查不到这个 provider」说成「fs 已核实」）——v1.12.8 起改为 `status:"unavailable"` + `provenance.reason:"provider_unknown"`（`core/types.ts` 的 provenance 增可选 `reason`）。新增 `test/missing-dependency.test.ts` 锁住回归。
- **② 召回路由评测（C6，agent-skills 思路）**：新增 `test/recall-routing-eval.test.ts`——**正样本** 7 条（query → 期望 rank-1 一手入口）+ **负样本** 3 条（不得窜位：代码查询不得窜到 `references-agents/`、云函数 ≠ 页面、文档查询不得窜到通用工具类）+ **无匹配** 1 条 + **rank-1 棘轮**（排序快照钉住，改动排序必须显式更新期望）+ **主题键碰撞检测**（同一 `# 入口` 被不同记忆复用 → 报出；只算记忆原子，排除 `_index.md` / observer trace）。纯确定性；这是**回归门槛**，不是新功能。
- **③ `references.md` 三处更正**（研究 §六 提出、此前未落地）：OpenAI《Computer use》指南**不是两条并列路线**（主线是 Responses API `computer` 工具 + 旧预览迁移，实现上有三种 harness 形态）；「跨调用保持环境」方向写反了（原文是*续对话不恢复浏览器会话/登录态/运行时变量*，恰是 `Memory ≠ Evidence` 的正例）；hyperframes 补安装坑（裸 `skills` 装全量、`npx skills add` 必须 `--skill`/`--all`，且*缺件不许照记忆里的流程继续*——正是 ADR-0049 的外部来源）。出处说明写在该文件内（OpenAI 原文 2026-09-08 复核时站点对本机返回 403，按研究记录 + 第三方镜像校正）。
- **④ 杂项**：`.gitignore` 收掉 `docs/*.visual-check.*`（archify 视觉自检产物，可重出）。
- **验证**：`npx tsc --noEmit` exit 0；`npm run build` exit 0（`dist` 同步）；**20 个测试全 `ALL PASS ✅`**（18 既有 + 新增 missing-dependency / recall-routing-eval）；路由评测 rank-1 准确率 1.0；`dsh --profile web --dump-config` exit 0 且无 `Error:`。


## [v1.12.7] 代码审查修复：读侧换行根因 / 信封计数自洽 / 棘轮补齐 plan + 文档口径校正

对 v1.12.6 做了一轮独立代码审查（两个审查 agent，只读），逐条复核后修复。**其中 ① 是 v0.5 起就存在的读侧缺陷（不是 v1.12.6 引入），另修 6 处自检发现的问题。**

- **① 读侧输出被压成一行（根因修复）**：`security/scrub.ts` 的 `scrubFinal` 把整篇文档交给 `scrubUnsafe`，而后者剔的是 `[\u0000-\u001f]`——**连 `\t\n\r` 一起剔**，于是 16 个读侧模块精心拼的 Markdown（`> 引用`、条目分行、信封）全被压成一行（实测换行数 = 0）。修法：新增 `scrubUnsafeDoc`（保留 `\t\n\r`，仍剔其余 C0 控制符与双向覆盖符），`scrubFinal` 改用它；`scrubUnsafe` 原样保留给单行字段（线索头）。**边界**：只动读侧呈现，canonical 证据/记忆文件不变；注入短语与 HTML 标签仍被剥离，「数据非指令」前缀不变。
- **② 信封计数自洽**：`truncationNote` 原来 `未返回 = limit 截断 + 预算截断`，把冷却算进「原因」却不计入总数——全冷却时出现「未返回的命中：0 条」却实际丢了 N 条。修法：**总数恒取 `命中 − 返回`**，三个原因只作分解（`limit=X 上限 N 条` / `预算 … N 条` / `冷却 N 条`）；下一步按原因生成（只有冷却时不再建议「提高 max_tokens」）。未返回示例改为从 `scored − returned` 取（原先漏掉冷却项）。
- **③ 全冷却不再被误标成「近似候选」**：`available` 为空且原因是冷却时，原来会把**真实命中**当成「近似候选·未验证」。修法：`noMatchText` 支持自定义 `steps`/`approxLabel`，该分支给出「冷却中的命中（是命中，不是近似）」+ 冷却专属下一步。
- **④ 近似候选降噪**：`approxEntries` 原用 `hit / sqrt(条目 gram 数)`（单侧归一化，长入口吃亏）+ 阈值 0.35，实测 `approxEntries("todo")` 会把 `docs`/`mode`/`shadow` 这类只共享一个 bigram 的入口带进来。修法：对称归一化 `hit / sqrt(查询gram × 条目gram)` + 要求 `hit ≥ 2` + 阈值 0.25；查询不足 2 字符（含单个汉字）直接不给候选（2-gram 不成立）。
- **⑤ 棘轮补齐 `plan`（60 → 61）**：`query/planning.ts` 用 `String(args?.mode || "") !== "plan"` 声明 mode，旧正则抓不到，删掉 CONTEXT.md 的 `plan` 行测试仍绿。修法：补 `mode\s*\|\|[^)]*\)\s*[!=]==` 抓法、断言 `modes.size === 61`、把搜索范围切到「mode 参考」小节内（避免正文别处蒙混）、路径改用 `import.meta.url`（cwd 无关）。
- **⑥ 其余小修**：`deprioritizeFactor` 容忍字符串配置；debug 分数保留一位小数（原 `Math.round` 把 ×0.4 的差异抹掉）；debug 的降权标记改用 `breakdownOf().deprioritized`（原字段是死的）；`mode` 描述补 `real-refer`（`reality*` 通配不到）并写明 `dsh-shadow 仓库的`；`rank.ts` 注释「前缀」改为「子串」（实现是 `includes`）；`CONTEXT.md` 修正布尔分派清单（`kg`/`observer` 是输出修饰，不参与分派）与 `model` 一行语义（查一条 RealityClaim + Lineage，不是跨类型查询）。
- **文档口径校正（v1.12.6 条目同步更正）**：mode 描述长度**同一口径**为 **1747 → 488**（v1.12.6 时把 1789=含 `mode: { type… }` 外壳的片段与 488=描述值混比）；棘轮覆盖数 v1.12.6 实为 **60/61**（漏 `plan`）；「召回权重与公共契约不变」精确为「`deprioritize` 关闭时默认权重与工具契约不变」。
- **验证**：`npx tsc --noEmit` exit 0；`npm run build` exit 0；**18 个测试全 `ALL PASS ✅`**（含新增集成断言：换行保留、信封计数自洽、冷却总数、全冷却不误标、预算截断计数、`recall` 空分支下一步、近似候选降噪、`plan` 棘轮）；实测 mode 描述 1747 → 516（补 `real-refer` 后）；实测读侧换行数从 0 恢复为多行。


## [v1.12.6] 参考材料落地三项（mode 描述下沉 / 召回信封 / deprioritize）+ claude-mem 参考材料清理

把 2026-09-08 参考材料研究（`_reports/2026-09-08-dsh-shadow-references-study.md` §二「第一档」）里剩下的三项落地；同版含用户拍板的 claude-mem 参考材料清理。**三项都无 LLM、无新依赖、不引向量库（ADR-0001）；`deprioritize` 关闭时默认召回权重与工具契约不变。**

- **① `mode` 描述下沉**（借 mattpocock/skills 的 context-load 尺子 + hyperframes 的「下沉 + 指针」）：`read_shadow` 的 `mode` 参数描述 **1747 → 488 字符**（同一口径：描述值本身；只留常用 mode + 指针），完整 **61 个 mode** 的语义/入参/返回移入 `CONTEXT.md` 新增「mode 参考」表（按 14 个源码族分组）。**棘轮**：`test/recall-envelope.test.ts` 扫 `query/*.ts` 声明的 mode（`MODES`/`modes:`/`mode ===`），逐个要求在 `CONTEXT.md` 出现——新增 mode 不写文档即测试红（v1.12.6 时覆盖 60/61，漏了 `plan`，v1.12.7 补齐）。
- **② 召回信封**（借 PageIndex「成功/失败统一为带下一步的信封」）：`query/query.ts` 主召回不再静默 `break`——预算 / `limit` / 冷却砍掉的命中在结果末尾**自报家门**（`未返回的命中：N 条 · 原因 · 示例入口 · 分数` + 下一步），并进 debug trace（`limit 截断 N` / `预算截断 N`）；`retrieval/render.ts` 的 `noMatchText` 从死路改为「四条可执行下一步 + 近似候选」（新增 `approxEntries`，确定性 2-gram，显式标『近似·未验证』）；`core/recall.ts` 的 `renderRecoveryFor` 空任务分支同样给下一步。**全部返回时零多余文字**（`truncationNote` 返回空串）。
- **③ `recall.deprioritize`**（借 codegraph 的三态配置：把「移除」和「降权」当两件事）：`retrieval/rank.ts` 新增 `deprioritizeFactor`（`DEPRIORITIZE_FACTOR = 0.4`，反斜杠/大小写归一），配置 `rawConfig.recall.deprioritize: string[]`（默认空 = 不降权）；命中的 `rel`/`entry` 含该**子串**时**只降权、不移除**（仍可搜到，只是排名靠后）；`breakdownOf` 带 `deprioritized`，debug 逐条显示 `降权(deprioritize)` 并有汇总行。
- **④ claude-mem 参考材料清理**（用户 2026-09-08 拍板「全删」）：插件内 7 处 `thedotmack/claude-mem` 提及清零（`references.md` 清单 + 分类、ADR-0001/0038/0039 的对照论述、`CHANGELOG.md`、`MEMORY.md`、`security/scrub.ts` 的出处注释与 `SYSTEM_TAG_NAMES` 里的 `claude-mem-context`）；删除工作区克隆 `vendor/_src/claude-mem`（1108 文件 / 140.8 MB）。**行为变化**：写侧 `stripSystemScaffold` 不再剥离 `<claude-mem-context>` 块（读侧 `scrubFinal` 仍剥通用标签）。
- **验证**：`npx tsc --noEmit` exit 0；`npm run build` exit 0（`dist` 同步）；既有 17 个测试 + 新增 `test/recall-envelope.test.ts` 全 `ALL PASS ✅`；mode 描述 1747→488 字符（同一口径实测）；`CONTEXT.md` 覆盖源码声明的 60/61 个 mode（棘轮当时漏 `plan`，见 v1.12.7）；`read_shadow` 公共契约（`mode` 串、参数名）未改。


## [v1.12.5] 文档：README 补「默认开关总表」「谁能调用权限轴」「给 agent 的文档入口」+ 安全表补降级/取消

**纯文档，无代码 / 配置 / 行为变化**（改动仅 `README.md`；`npx tsc --noEmit` exit 0；`node test/recall-attribution.test.ts` → `ALL PASS ✅`）：

- **补齐 4 条参考材料里尚未落地的部分**（v1.12.3 已吸收失败模式表 / 模式路由表 / 粘贴式安装 / 安全边界对照，本轮补剩余）：
  - **「默认开关（装完什么都不动会怎样）」表**（借 hyperframes「安装克制：核心集常驻、其余按需装，不会在背后偷偷拉全套」）：15 行覆盖采集、`summary`、`queryLog`、`episodes`、`recall`（含 `cooldownTurns`/`debug`）、`retention`、`forget`、`compact`、`llmRecall`、`projectionStore`、`knowledgeEngine`、`kg`、`evidenceProvider`；默认值逐项对 `core/types.ts` 的 `ShadowConfig` + `core/writer-core.ts` / `query/observatory.ts` / `core/forget.ts` / `core/projection-store.ts` / `query/reads.ts` 的判定语句核对（`=== false` 才关=默认开：采集/摘要/查询观测/episodes；`!== true` 即关=默认关：其余）。
  - **「谁能调用（用户显式 vs 模型自动）」表**（借 mattpocock/skills 的权限轴）：模型可自动调用 = 三个只读工具及其 `debug`/`verify`/`kg` 变体；仅用户显式要求 = 开 `retention`/`forget`/`compact`/`projectionStore`/`knowledgeEngine`、`writeConsent: true` 后的落盘。
  - **开头加「给 agent 读的入口」一行**（借 OpenAI 指南的机器可读文档入口）：`AGENTS.md` / `CONTEXT.md` / `adr/`；仓库无 `llms.txt`，用现有三处代替，不新建文件。
  - **安全边界表第 4 行补「支持取消」**：写明每个 LLM 增强（摘要 / 语义召回 / 推理导航 / 知识导航）都有 `timeoutMs`，失败或超时静默退回确定性路径、不阻塞主路径。
- **验证**：`npx tsc --noEmit` exit 0；`node test/recall-attribution.test.ts` → `ALL PASS ✅`；两个新表逐行对照源码默认值判定语句；`git diff --stat` 仅 `README.md` + `package.json` + `CHANGELOG.md`。


## [v1.12.4] 文档清理：去掉「一切皆文件」口号（当前口径）+ package.json 描述同步

**纯文档 / 注释 / 预设文案，无代码行为变化**（`npm run build`、`npx tsc --noEmit` 均 exit 0；`node test/recall-attribution.test.ts` → `ALL PASS ✅`）：

- **口号清理**（口径：只清「当前口径」，历史原文保留）：`index.ts` 头注释 2 处、`core/writer.ts` 注释 1 处、`CONTEXT.md` 术语表（原「一切皆文件」行改为「一条记忆 = 一个文件」，并把该表 3 处 `shadow/` 修正为 `.shadow/`）、`agent-presets/projection/preset.yml` 的 description、`agent-presets/projection/agent.cordis.yml` 的 persona；`dist/` 重编译同步。
- **package.json**：`description` 去掉「一切皆文件，」，与 README 口径一致。
- **保留（历史原文，不改写）**：`adr/0001`、`adr/0039`、`adr/0043`、`MEMORY.md`。
- **安装副本同步**：`~/.dsh/.agent-presets/projection/` 先备份（`.bak-20260908_171721`）再覆盖，SHA256 与仓库一致（`0B7C787A6F3B` / `8597A0259D6E`）。
- **验证**：当前口径 9 个文件（源码 / 文档 / 预设 / dist / README / package.json）grep 无匹配；仓库内剩余匹配仅历史 ADR/MEMORY 与 archify 产物；回归测试 ALL PASS。


## [v1.12.3] 文档：README 开头重排（失败模式 / 模式路由表 / 粘贴式快速开始 / 安全边界）+ 补充材料登记

**纯文档，无代码 / 配置 / 行为变化**（`npx tsc --noEmit` exit 0；改动仅 `README.md`、`references.md`）：

- **README（+68 行；正文能力清单与安装/验证节未动）**：
  - 「谁该用它」一句定位；
  - 「为什么存在」7 条失败模式 → 修法表（换会话失忆 / 只记动作不记理由 / 召回无证据 / 记忆过时 / 系统提示与密钥混入 / 把记忆当指令 / 上下文膨胀）；
  - 「什么情况用哪个」模式路由表：14 个日常入口（`read_shadow()` 无参 / `topic` / `debug` / `decision` / `episode` / `task` / `context` / `observer` / `identity`·`soul`·`taste`·`experience`·`judgment` / `knowledge` / `verify` / `shadow-report`·`query-log` + `recall_shadow` + `shadow_query`）+ 长程与边界族 mode 一行，mode 串按 `query/reads.ts`、`query/*.ts` 实测核对；
  - 「快速开始」给 agent 的粘贴式安装提示（link: 依赖 + bundles + `pnpm install` + `dump-config` + 落盘验证 + `recall_shadow` 冒烟）；
  - 护栏下新增「安全边界」表：把 OpenAI《Computer use》指南四条控制（限制环境 / 内容当不可信 / 有后果动作要确认 / 设上限并看真实结果）对照到本项目落点。
- **references.md（+55 行）**：登记用户 2026-09-08 提供的 4 条补充材料并逐一联网核实——OpenAI《Computer use》工具指南、`browser-use/browser-use`、`heygen-com/hyperframes`、`mattpocock/skills`（star / 许可 / 最近提交按 GitHub API 记录），每条给出「是什么 / 值得借鉴什么 / 与 dsh-shadow 的关系」，末尾汇总四条共同点。
- **验证**：表格完整性脚本 4 个表 0 不一致、无转义竖线残留；`ContextStatus` 与 `core/context.ts` 一致；`npx tsc --noEmit` exit 0；`git diff --stat` 仅文档两文件。


## [v1.12.2] 架构加固：读族 seam 全迁 + fan-in 收窄 + 概念核 guard 测试 + writer capture/materialize 拆分

**把架构审查候选 1/2/3/4/5 全部落地，行为零变化、公共契约不变（read_shadow/recall_shadow/shadow_query + mode 串 + execute(args)），17 测试文件全过：**
- **读族 seam 全迁（候选 1/5）**：`query/reads.ts` 收齐 episode/decision/task/context/recall/index/knowledge/shadow-manifest/query-log/shadow-report/query 全部读概念；`query.ts` 由 811 行收至 **350 行**、95→**40** import、**0 条内联 mode 分支**（原 50），14 个读族 seam + contverify 由单一分发器路由。
- **cycle 打破（候选 5）**：`NodeType` 下沉 `core/lineage.ts`，破除 `lineage-validator↔node` 唯一类型循环；并清掉读族迁移残留的 38 个死导入。
- **knowledge-engine 三 seam（候选 4）**：拆成 `knowledge-structure/retrieval/cost` 三模块 + `knowledge-engine.ts` **barrel**（原 import 面不变）。
- **概念核深模块可测（候选 3）**：新增 `concept-guards.test.ts` × 2——覆盖 agency/delegation/recall/adaptation/long-horizon + federation/reality/world/sim/planning/continuity 的全部 guard 不变式（~1400 行未测→可验证）。
- **writer capture/materialize seam（候选 2）**：收敛 4 次 LLM stream scaffold（`writer-llm.ts`）+ 抽纯渲染器（`writer-render.ts`）+ 拆 `writer-core/capture/materialize` 三 seam（`writer.ts` 组合根 134 行）；新增 `writer-write.test.ts`（mock-fs 驱动 flush 落盘）补写路径覆盖。
- **验证**：tsc + build + **17 测试文件**全 ALL PASS；公共契约不变（recall-attribution/episode-lineage/query-observatory 等黑盒全存活）。


## [v1.12.1] 架构重构：ReadQuery seam + materializeAtoms（收敛读模式 monolith）

**把 `query.ts` 的读模式 monolith 立成深 seam（架构审查候选 1，方案 A 首刀）**，行为零变化：
- **`query/materialize.ts`**：`MaterializedView` + `materializeAtoms`（listMemories→过滤遗忘/收口→parseMemory 的**唯一定义**）——收敛 query.ts 里重复 7–12 次的「读→过滤→parse」脚手架（locality）。
- **`query/reads.ts`**：`ReadQuery` seam（`modes[]` + `run(deps,args,exec,ctx)`）+ `readQueries` 注册表 + `dispatchReadQuery`；先把**最复杂的 `shadow_query`** 迁为该 seam 的第一个深模块（含 Projection 缓存 + 旁路观测 + Evidence Gate）。
- `runReadShadow` 顶部先 `dispatchReadQuery`（命中即交模块），`mode:"query"` 分支移除；其余读/命令分支仍内联（候选 3 再收）。
- **public 契约不变**：`read_shadow/recall_shadow/shadow_query` 表面 + `mode` 串 + `execute(args)` 完全不变（recall-attribution 4207 行黑盒 + episode-lineage + query-observatory 全存活）。`CONTEXT.md` 增补 `ReadQuery seam` 术语。
- **验证**：tsc + build + 14 测试文件全 ALL PASS（lineage/evidence-gate/atom-kind/query-observatory/episode-lineage/recall-attribution/…）。


## [v1.12.0] Candidate ③④⑦⑧（确定性去噪/格式抽取/引用/Manifest）

**实现 ADR-0048 候选项**（此前留待，现启用）：
- **③ 内容分类去噪**（PageIndex `flash/classification`）：`isBoilerplateLine`——剔除目录/页眉页脚/代码块标记/TOC 点线；`cleanLines` 只留正文/标题。
- **⑦ 按格式结构化抽取**（zg `retrieval/*`）：`buildTree` 改为格式感知——**code→包树**（路径分层）、**document→标题树**、**text→段落树**；纯确定性，无 LLM。
- **④ 树即 agent 工具 + 引用**（PageIndex `agent_tools.py`）：`sectionPath`（根→节点路径）+ `renderKnowledgeRetrieval`（检索结果带**节路径引用/溯源**）；`mode:"knowledge"` 检索带引用。
- **⑧ Manifest / 可观测**（zg `manifest.json`/`status --debug`）：新增 `core/manifest.ts`（`ShadowManifest`：版本/构建时间/节点数/来源数/失败项）+ `writeManifest/readManifest/renderManifest`；投影 store `rebuild` 回写 manifest；`read_shadow({mode:"shadow-manifest"})` 诊断读面。
- **边界**：全部纯派生/无 LLM；不集成 PageIndex/zg；不向量化（ADR-0001）。**验证**：manifest 新增 + knowledge-engine（③去噪/⑦格式/④引用）+ projection-store（manifest 回写）+ 全量回归 ALL PASS（14 测试）。


## [v1.11.0] Deeper PageIndex + zg Ideas（成本/渐进披露/增量索引/授权，ADR-0048）

**再次深入 PageIndex/zg 源码，吸收更深的 4 项思想**（ADR-0048）：
- **①成本感知树优化**（PageIndex `tree_optimize.py`）：`refineTree`——链式合并（单叶子孩子吸收）+ 便宜子树折叠（子树规模 ≤ minPages 则合并，**子标题存 `keyItems`**），使 Knowledge 树**检索代价有界**。
- **②渐进披露树**（PageIndex `page_index_md.py`）：`progressiveDisclosure`——内部节点 `summary`（标题+节数，路由用），**叶子保留 `content`=全文**；"只读推理到达的节点"（上下文经济）。
- **⑤change-set 增量索引**（zg `daemon/change-set.ts`）：新增 `core/change-set.ts`（`ChangeSet`：created/changed/deleted + 目录 rescan + `pathCoveredBy` 去重 + `maxChangedPaths` 超阈值→强制全量对齐）；`JsonlProjectionStore.invalidateFor(set)` **只移除变更 rel 的节点**（保持其余缓存）。
- **⑥授权范围搜索**（zg `authorization/*`）：新增 `core/authorization.ts`（`inScope`/`authorizeScope`：workspace 内放行 / `denied` 优先排除 / `allowed` 扩展；无 workspace 保守放行）；`IndexEngine` zg 候选经 `authorizeScope` 过滤（防越权泄漏）。
- **边界**：结构确定性（树/成本/增量/授权均**无 LLM**）；不集成 PageIndex/zg；不向量化（ADR-0001）。**候选**（③④⑦⑧，未实现）留待后需。**验证**：change-set / authorization 新增 + knowledge-engine（渐进披露/成本 refine）+ projection-store（invalidateFor）+ 全量回归 ALL PASS（13 测试）。


## [v1.10.0] Knowledge Engine LLM 树上导航（PageIndex `chat=` 步，ADR-0047 落地）

**把 PageIndex 的"检索 = LLM 在树上推理"落地为 dsh-shadow 的 Knowledge 检索**（`mode:"knowledge"` + topic）：
- **LLM 树上导航**：`knowledgeNavigate`（`writer.ts`，同 `recallSelect` 模式）——给候选章节（`flattenSections` 展平树），LLM 只**选章节编号**（导航/排序），**事实仍从树派生**（页面说"让最强大模型在树上推理检索"，我们只让它选章节，不生成内容）。
- **边界（ADR-0043/0047）**：LLM **只导航/排序，绝不创造事实/关系**；`config.knowledgeEngine.llmNavigate.{enabled,provider,model}` 门控（默认 off）；失败/未配置 → 回退确定性 `retrieveKnowledge`（行为不变）。
- **`mode:"knowledge"`**：topic → LLM 导航（可选）+ 树上检索；无 topic → corpus 级 file 树（模块→文件→章节）。
- **配置**：`ShadowConfig.knowledgeEngine.llmNavigate`；`ShadowCollector/ShadowQueryDeps` 加 `knowledgeNavigate`。
- **验证**：knowledge-navigate（端到端，LLM 未配置→确定性回退不崩溃）+ knowledge-engine（corpus 树/检索/flattenSections）+ index-engine + 全量回归 ALL PASS。


## [v1.9.0] Projection Store + Index Engine + Knowledge Engine（Phase 1B/2/3 骨架）

**把 v1.8.0 的可证明事实层接上「性能缓存 + 候选生成 + 规范树」**，全部**可插拔、默认关**（不改现有行为），严格遵守 ADR-0046 边界：
- **Phase 1B Projection Store**（`core/projection-store.ts`）：`ShadowProjectionStore` 接口（save/load/invalidate/rebuild）+ `JsonlProjectionStore` 首版（`.shadow/shadow-index/nodes.jsonl`）+ `loadOrBuildProjection`（命中缓存/未命中重派生回写；`config.projectionStore.enabled` 默认关→行为不变）。**Performance 不是 Storage**：只缓投影，rm -rf 可重建。
- **Phase 2 Index Engine**（`core/index-engine.ts`）：`IndexEngine` 候选生成抽象 + `createIndexEngine`（`config.indexEngine.provider = fs(默认全量扫描) | zg`）；zg 复用 `zgEvidenceProvider`，**未装→unavailable，绝不静默 fallback 成 verified**（证据契约）；`read_shadow({mode:"index"})` gated 读面。
- **Phase 3 Knowledge Engine**（`core/knowledge-engine.ts`）：从规范/文档 Atom **保留树**（规范→章节→条款→约束），**不转 vector/chunks**（与 RAG 本质区别）；纯派生、不新增事实；`read_shadow({mode:"knowledge"})` gated 读面。
- **收尾（v1.8.0 内）**：`mode:"index"` 候选生成、`mode:"knowledge"` 规范树、`projectionCached` 观测标记、`config.projectionStore/indexEngine/knowledgeEngine`。
- **边界**：gate 保持在 shadow_query（认知查询）；zg/PageIndex 作为可插拔 provider（工具在位才激活，未装→unavailable）。**验证**：lineage/evidence-gate/atom-kind/projection-store/evidence-b2-write/index-engine/knowledge-engine/query-observatory/episode-lineage/recall-attribution 全 ALL PASS。


## [v1.8.0] Evidence Lineage Layer（ADR-0044/0045/0046）

**让每个高价值认知单元都能回答"这个东西为什么存在、它来自哪里"**——提高**可信度与可审计性**，不是搜索/知识。落地核心：
- **数据模型**：`core/lineage.ts` 新增 `AtomLineage{source,createdBy,evidence:EvidenceRef[],createdAt}` / `EvidenceRef{type,locator,fragment}` / `AtomKind(experience|metadata|session|task|artifact)` / `CreatedBy`。**source≠evidence**（source=产生处，evidence=支撑材料）。
- **Atom schema**：`ParsedMemory` 加 `kind?`/`lineage?`（兼容旧 Atom，**不做 migration**）。
- **写侧采集（B2）**：`buildClueHeader` 已把当回合 `fs/observed` + 用户引用材料写进同一原子的 `> 背景/材料`；读侧 `parseMemory` 据此**派生** `lineage.evidence`（event-sourced，**非 LLM 补写**）。
- **Validation Gate**：`core/lineage-validator.ts` `validateAtomProjection`——`memory+kind∈{metadata,session}` → reject；`decision 无 evidence` → reject（**Atom 保留**，决策发生过≠可靠）。
- **Projection/Query**：`deriveShadowNodes` 只投影过 gate 的 Atom（**不猜 evidence/不补 lineage/不调 LLM**）；`shadow_query` 透明升级，只返回可证明节点。
- **Report**：`shadow-report` 的 Evidence Density 按 **type / kind / createdBy** 三维统计（`evidenceBreakdownOf` + 聚合 + 渲染）。
- **测试**：`test/lineage.test.ts` / `test/evidence-gate.test.ts` / `test/atom-kind.test.ts`（无证据 decision 不进 query、metadata memory 不进默认查询、projection 无 generate/infer/guess）。`episode-lineage` 场景12 跟随 gate（decision 需 evidence 才命中）。
- **真实数据验证**（OpenAPI-Gateway 52 原子）：**52 → 14 个可证明节点**，正确排除 33 个 metadata memory + 5 个无证据 decision，保留 document(9)+code(4)+task-kind(4)。
- **边界**：不做 `nodes.jsonl` / Projection Store / zg / PageIndex / Graph 关系扩展 / 自动经验总结。**验证**：lineage / evidence-gate / atom-kind / query-observatory / episode-lineage / recall-attribution 全 ALL PASS。


## [v1.7.2] Shadow Fitness Report（Phase 1A.6）

**把 query-log 变成"是否升级索引层"的客观依据**——`read_shadow({mode:"shadow-report"})` 把 `query-log` 聚合 + 扫记忆做 **missing-types 启发式**（`missingTypesOf`：检测约束型/任务型内容被归错类型，≥3 处才提示，防单例噪声），生成 `.shadow/shadow-report.md`（系统派生，rm -rf 可重建）。**报告四段**：`Query Summary`（总查询/候选→返回/延迟）、`Evidence Density`（有证据节点/总返回节点，核心指标 dsh-shadow vs 普通 RAG）、`Stability`（重复查询的 Node 稳定/漂移）、`Node Distribution` + `Potential Missing Types`。**关键指标 Evidence Density** = 有证据返回节点数/总返回节点数；dsh-shadow 坚持「宁可少回答，不要无证据上下文」（阈值默认 90%）。**边界**：**只诊断、不增强**；判定是启发式观察（best-effort、无 LLM、不下结论），标注依据；缺失类型只在真实数据反复需要时才采纳（**不理论驱动、不提前补 task/constraint**）。**验证**：场景 Query-Observatory-5~6（shadow-report 落盘 + missing-types 启发式 ≥3 才提示）+ 全量回归 ALL PASS。


## [v1.7.1] Shadow Query Observatory（Phase 1A.5）

**先跑真实数据，不急着定型 nodes 结构**（用户判断：最贵的是"第一次知道 Agent 到底需要记住什么"，过早固化 nodes.jsonl 是最大风险）。在 `shadow_query`（`mode:"query"`）**旁路记录观测**：写 `.shadow/query-log/<date>.jsonl`，每条含 `date/ts/query/scope/limit/candidateNodes/returnedNodes/evidenceCount/evidenceNodes/relationCount/relationNodes/nodeTypes/nodeTitles/latencyMs`（query/title 轻量 scrub：密钥打码 + 剔控制/双向字符）。`read_shadow({mode:"query-log"})` 只读汇总：命中/证据/关系/类型/scope 分布 + **重复查询的 Node 稳定性**（同一查询 nodeTitles 是否一致，答"Node 是否稳定"；漂移则列出该查询的不同结果集数）。**边界（Shadow Contract）**：观测是**系统派生记录**（`rm -rf .shadow/query-log` 不影响任何 Atom）；只在 `shadow_query` 入口打点，**不进 derive 真相路径**；**写失败静默**，绝不改变 query 返回值；**默认开启**（`config.queryLog.enabled=false` 才关）。**核心问题（供真实数据回答）**：①Node 每次派生是否稳定；②`memory/code/document/decision/concept` 是否够（真实查询冒出的 `task/constraint` 再补）；③`relations`（references/objective/belongs_to）是否够（真实需要 `implements/depends_on/contradicts/supersedes` 再加，**不提前设计 Graph**）。**验证**：场景 Query-Observatory-1~4（旁路写 log / 汇总读 / 同查询稳定 / query-log 不进记忆枚举）+ 全量回归 ALL PASS。


## [v1.7.0] Shadow Projection Layer（Phase 1A，ADR-0042/0043）

**把 ShadowNode 初始化落地**——`shadow_query({query, scope, mode, evidence})` 把记忆**统一派生为 ShadowNode**（`type: memory|code|document|decision|concept`，带 `source/evidence/relations`），跨类型查询返回**带 evidence 的 context**。**守 Shadow Contract（ADR-0043）**：Node 是**派生投影**（非事实源，可重建/rm -rf 无影响）；`evidence` 指向 Atom（源文件/文档），**无证据不返回**；`relations` 只从**可观察信号**派生（`references`=材料路径、`objective`=goal、`belongs_to`=项目），**LLM 不能制造关系**。`read_shadow` mode 新增 `query`；新增 `shadow_query` 工具。**验证**：场景 12（跨类型统一 ShadowNode + evidence 可追溯）+ 全量回归 ALL PASS。


## [v1.6.0] recall_shadow LLM 推理导航（对齐 PageIndex 免向量、推理式检索）

把 `recall_shadow` 从"关键词相似度召回"升级为"**LLM 推理导航选中任务**"（`config.llmRecall` 门控，默认关）。开启时：给 LLM 候选任务列表（title/objective/摘要），LLM **只输出最相关任务编号**（意图识别+排序）；`recall_shadow` 再沿"任务树"渲染恢复包。**边界**：LLM 只做**导航/选择（Context Planning）**，Bundle 内容仍全来自派生数据（Task/Decision/Evidence/Outcome），**不补 Reason/事实/判断**；LLM **关/失败**回退确定性 `bestTask`（行为不变）。**参考**：VectifyAI/PageIndex（`similarity≠relevance，relevance 需 reasoning`；树索引+LLM 推理遍历+可追溯）——已克隆到 `vendor/_src/PageIndex`。**验证**：场景 11（LLM 导航覆盖确定性 + 关闭回退）+ 全量回归 ALL PASS。


## [v1.5.1] Active Context Projection（"现在继续要记住什么"）

给 `recall_shadow` 的恢复包加 **Active Context** 段——`已完成/已决定 / 未完成待厘清 / 约束 / 最近决策 / 入口位置`。**全部来自派生数据**（Decision/Outcome/未明确理由决策/Constraint/任务状态/入口），**不是建议、不是推理、只是恢复**；也**不**让 LLM 生成。这补上 Cursor 式"Continue where you left off"体验——用户第二天打开，`recall_shadow` 直接给"继续工作状态"。**验证**：场景 10（恢复包含 Active Context）+ 全量回归 ALL PASS。**不碰** Entity/自动总结/自动补任务状态。


## [v1.5.0] Shadow Usability Layer（从"架构对"到"人能用"）

**补上使用闭环**——`recall_shadow(query)` 人类友好入口：给一句自然查询（如「Todo清理」「上次 OAuth 问题」），返回 **Task Recovery Bundle**（任务/状态/启发式观测/关键决定(含理由)/证据(当前是否仍有效)/观测结果/当前注意/未明确理由的决策）。底层把 `read_shadow` 的 episode/decision/task/context 视图合成一段**人类可读**内容。**原则**：内容全来自派生数据（task/decisions/evidence/outcomes/constraints），**绝不 LLM 补写 Reason/事实/判断/完成**（呼应 ADR-0037/0039/0040）；LLM 只在【意图识别+结果排序】参与（外部可选，默认确定性评分）。`read_shadow` mode 新增 `recall`（同一引擎）；systemPrompt 改为引导用 `recall_shadow`。**验证**：场景 10（recall_shadow → Task Recovery Bundle，含状态/关键决定/观测结果）+ 全量回归 ALL PASS。


## [v1.4.0] Context Recovery / 上下文复核层（ADR-0040 实现）

把证据路径派生成 **ContextReference**（`read_shadow({mode:"context"})`）——`subject / value（引用路径）/ source（来源 Evidence Pointer）/ status（validated|stale|unknown，经 fs 复核）`。**对齐 Cursor 三层但保持 Observer 原则**：①**P0 Candidate+Revalidate**（`Memory→Candidate→Validation→Current Context`，禁 `Memory→Truth` 直通；路径非永久事实，发现过期就重扫）；②**P1 Evidence Pointer**（"为什么知道这个"的来源）；③**P2 Transformation Trace**（`Mapping≠Source Fact`：`context:{mappings:[{from,to,rule}]}` 转换视图标注规则、**非事实**）。**Invariant**：`Memory≠CurrentState / Context≤Validation / Replay≠CurrentEnvironment / AvailablePath≠ValidPath`。**ContextReference 不是 Memory**（Memory=曾经观察到；ContextReference=当前是否还能用）。**验证**：场景 9（ContextReference 的 P0 复核 validated/stale + P1 来源 + P2 转换痕迹）+ 全量回归 ALL PASS。


## [v1.3.0] Task Lifecycle / 一等任务对象（ADR-0039 实现）

把「Memory Atom 不是最高抽象」落地——新增 **Task** 层（`read_shadow({mode:"task"})`），把记忆**派生为任务生命周期一等视图**：`title / trigger（用户触发）/ objective（`> 目标：`）/ constraints（用户提醒）/ status（启发式观测：active|completed|abandoned）/ 决策链（Decision with reason）/ 观测结果（ObservedOutcome）/ 证据 / 生命周期时间`。**沿 ADR-0038 纪律**：Task 是**读侧派生的投影**（不是写侧事实源），写侧仍产 Memory Atom（事实层）；`parseMemory` 新增 `userMessages`（供 trigger/constraints）。**沿 ADR-0039 边界**：①**Outcome≠Success**——结果只记`观察文本`（`mvn test：85 tests passed`），**禁** `success:true`/「方案正确」；②status 是**启发式观测**（非判断），标明依据；③**Task ≠ Episode**（Task=生命周期理解单位，Episode=阅读窗口）；④Replay/决策链由 lineage 派生。**验证**：场景 8（task 生命周期视图 + Outcome≠Success）+ 全量回归 ALL PASS。


## [v1.2.2] Episode 收口归档（对齐参考：会话级聚合+只留摘要+原始归档）

dsh-shadow 补上"**收口**"——`compact:{enabled,gapMinutes}`（默认关）：当一个 episode 结束（出现下一个 episode）时，把该 episode 的所有 turn 原子**合并成 1 个 consolidated 文件**（保留 决策/动作/材料/结果/用户消息），个体原子 mark `status=compacted` 并**移出活跃索引/召回**（文件保留、可回放，Forget≠Delete）。活跃树由"每 turn 一文件"→"每 episode 一 consolidated 文件 + 当前 open episode 原子"，**热集文件数大降**。读侧召回/索引/Episode/Decision 均跳过 `compacted` 原子。**验证**：场景 7（收口生成 consolidated、原子压缩归档、决策可回放）+ 全量回归 ALL PASS。**边界冻结：ADR-0038（Episode Consolidation Boundary）**——Episode = 投影非事实、Compact≠Forget、Summary≠Reality、Closed Episode≠Completed Truth、**Replay 必须活过收口**；且**不做方向 A（写侧按 episode 成文件）**，Episode 是 derived boundary 而非 write boundary，写侧仍产 Memory Atom（事实层）。


## [v1.2.1] 索引懒构建 + 缓存隔离（v1.2.0 修正）

①**索引改懒构建**——flush 只写文件+增补缓存+置 dirty，**不再同步 rebuildIndex**；`read_shadow` 无参读索引时才触发 `ensureIndex` 构建/落盘（索引=派生产物，不应每次写都全量重建）。②**修复 L2 缓存跨 workspace 隔离 bug**（v1.2.0 的单 Map 缓存会把 A 工作区记忆混进 B 的索引）——改为**按 ws 嵌套**，dirty 也按 ws。③冷启动全量读只在首次读索引时发生一次。**验证**：场景 11 隔离回归 + 场景 16/2/6 懒索引各自 ALL PASS。


## [v1.2.0] 增量索引 + 遗忘（性能热路径根因）

解决"小文件太多影响性能"。根因＝每次 flush 都 `rebuildIndex` 全量**顺序**重读所有记忆文件（O(N) 次 fs 读，WSL 网络 FS 下更慢）。①**L2 增量索引**：进程内 `indexCache`（rel→{entry,topics,parsed}），冷启动读一次、之后 flush 只增量增补并**由缓存生成 `_index.md`，不再全量重读**；②**遗忘（Forget≠Delete，ADR-0031）**：`forget:{enabled,staleDays,minHits,maxActive}` 把低价值/旧/已归档记忆**移出活跃索引与召回扫描**（文件保留，仅不再被当作活跃知识），封顶热集大小；读侧 `read_shadow` 召回同样跳过已遗忘。**默认关**（`forget.enabled=false` 行为不变）。**验证**：场景 6（遗忘从活跃索引/召回剔除、文件保留）+ 全量回归 ALL PASS。**边界**：无 LLM、不改 Memory Atom 格式、Memory 仍是 source of truth（遗忘只影响"活跃"视角）。


## [v1.1.3] 派生层读侧去重（第三次 Replay 发现的正确性修正）

`parseMemory` 在同一记忆里既读新 `> 决策：` 块（全量 statement）又读 legacy `> 用户提示/决策：``〔decision〕``（buildClueHeader 截断到 48 字版），字符串不同 → 没去重 → 把**同一条决策数成 2 条**（写侧 `概况:K 决策` 是对的，读侧 deriveDecisions 虚高）。修正：有 `> 决策：` 块时不再重复走 legacy 路径（旧数据无块仍走 legacy）。**验证**：真实第三次 Replay 读数从"2 条"回落为与 `概况` 一致的"1 条"；全量回归 ALL PASS。**结论要点（第三次 Replay）**：新数据捕获到 1 条**锚点/定位决策**（`…这是 openapi 的 U8 工作区 里面有 openapi 模块`）——Precision 100% / Recall 100% / Source Traceability 100% / **Reason Coverage 0%**（该锚点声明本质上不含"因为"，非解析漏）。


## [v1.1.2] 决策识别放宽：范围/聚焦 + 锚点/定位（按真实回放发现的 Recall 缺口）

第二次 Replay 用你的 ground truth 算出 **Decision Recall = 0%**——旧 `classifyUser` 只认「选择类动词」（删除/保留/采用/就按…），漏掉用户真正短促的**关键决策**：①**范围/聚焦**（`"资产同步"` = 当前做哪块）、②**锚点/定位**（`"…这是 openapi 的 U8 工作区"` = 事实基准在哪）。v1.1.2 新增 `decisionClass()`：`selection | scope | anchor` 三类，`classifyUser` 据此归类（三者也计入 `> 决策：`/`> 概况：K 决策`）。**仍在冻结边界内**：只识别「原文明确存在」的声明（无 LLM、不补写 Reason、Confirmation/请求理解不算决策）。**验证**：场景 5（`资产同步`/`…U8工作区` 捕获、`了解 当前 IO` 不算）+ 全量回归 ALL PASS；真实数据反事实＝新分类器能识别那条 2 条真决策（旧采集丢失、Recall 0%）。


## [v1.1.1] Decision Capture Boundary（补齐"什么决定真的发生过"的事实入口）

v1.1.0 解决了「碎片怎么串」；v1.1.1 补上真正缺失的**事实入口**——决策在发生的瞬间作为一等事件进入 Memory。写侧在 goal 事件 / 用户拍板 / assistant 明确决策处采集 `DecisionEvent`（statement + source + lineage），并**分离「决策事实」与「决策理由」**：`> 决策：`(事件) / `> 决策理由：`(仅原文明确表达) / `> 概况：K 决策`。**边界**：Reason 绝不 LLM 补写（Evidence≠Interpretation；有 Decision ≠ 一定有 Reason，缺则显示「未明确」）；`classifyUser` 把「好/可以/行/ok」归 **Confirmation** 而非 Decision；assistant 决策经 `extractDecisionStatement`/`extractReason` 保守抽取；`mode:"decision"` 可回答"为什么做这个决定"并追溯原始事件。**仍无 DecisionStore**（Memory 是事实源，Decision 是派生关系），不改变 Episode 机制，无 Preference/Value/Learning。**验证**：`node test/episode-lineage.test.ts`（含 Decision Capture 场景）+ 全量 mock 回归 ALL PASS。**实测 OpenAPI-Gateway 旧数据（286 条）**：聚合生效（286→3 Episode），但旧采集仅 1 条（误报）决策——v1.1.1 只对未来采集生效，过去丢的"为什么"不可追溯。**边界冻结：ADR-0037（Decision Capture Boundary）。**下一阶段不做 LLM 抽取/补 Reason、不做 DecisionStore/Preference/Learning；用 5 指标（Precision / Recall / Reason Coverage / Source Traceability / Task Replay Completeness）在真实工作后再次 Replay 评估。


## [v1.1.0] Episode + Decision Lineage（回到"任务/经历级"的第一刀）

不再让人类/agent 只看到 Event/Turn 级碎片。`read_shadow({mode:"episode"})` 派生**连续任务**（Episode = 同项目/会话 + 时间间隔内的一组记忆原子，带 决策链/动作摘要/背景/目标），`{mode:"decision"}` 派生**决策血缘**（把「决策」从 `概况：N 决策` 统计字段提升为按入口聚合的可追踪关系：goal 事件 + 用户拍板）。**派生式、纯读、不改写侧采集**——Memory 文件仍是 source of truth，`_index.md` 新增「任务回溯（Episodes）」段；写侧修正决策计数（用户拍板计入决策，修复"做了很多判断却显示 0 决策"根因）。`episodes.gapMinutes` 控制聚合间隔（默认 60min）。**验证**：`node test/episode-lineage.test.ts` + 全量 mock 回归 ALL PASS。


## [v1.0.0-alpha] Observer Runtime Foundation（第一阶段封存）

v0.20–v0.39.1 已构成一个完整 Observer Runtime——**能观察、表示、模拟、规划、行动、回忆、适应、长期交互，但不会因连续经验而产生错误主体漂移**。封存于 ADR-0034（Runtime Definition / Final Architecture Map / Boundary Matrix / Threat Model T1–T5 / Release v1.0.0-alpha）。最终 invariant **1–231** 成为 **Constitution Set**。**此后不再叠 v0.40+ 能力，路线从"构建能力"转为"证明能力不会越界"。**


## [v1.0.1] Observer Continuity Storage Boundary（v1.0.0-alpha 架构补丁，非能力层）

把"连续性承载"从单层 shadow 提升为**双层 storage boundary**——`Global Shadow = Observer Continuity Shadow`（`~/.dsh-observer`，observer 层，谁保持连续）与 `Workspace Shadow = World Interaction Shadow`（`project/.dsh-shadow`，world 层，这个世界是什么）。**二者不可混合**；关系 `Constraint ⊃ Context`，**不是** Memory Union。全局只存 observer 层（config / boundary / recall-index / lineage），禁项目知识/目标/偏好入 global；workspace 按项目隔离。见 ADR-0036/0036.1。**invariant 232–236**。自检：mock 1–236 全量 PASS。


## [v1.0.2] Observer Runtime Verification Foundation（验证器，非能力层）

把 Runtime 从"架构上可信"推进到"**运行证据可验证**"，但**验证器自身不越界**。对象 `VerificationRun`（禁 confidence/trust/score/quality/health）/ `InvariantCheck`（只答 satisfied|violated，禁 systemImproved）/ `DriftReport`（只答有无漂移，禁 DriftScore/RiskScore/AutonomyScore）。六边界映射（Reality/Epistemic/Agency/Authority/Identity/Temporal），`InvariantCheck.invariantId` 取**被检查 Runtime Boundary 自身**的 invariant（1–231，如 Reality=102/Epistemic=209/Agency=166/Authority=216/Identity=208/Temporal=231），**不是「本次 Verification 自己检查的 invariant」**。**Verification 自身 constitution = invariant 237–240**：Verification≠Optimization / Cannot Change Authority / Cannot Change Identity / DriftReport≠RealityClaim（由 verification/guard.ts 守卫）。`mode:"verify"`。见 ADR-0035/0035.1。自检：mock 1–240 全量 PASS。**验证器证明的是"边界有没有被违反"，不是"系统值多少"。**


**Forget → Recall Continuity Principle（2026-09-07 记录，作为后续 ADR 的基础）**：时间连续性的另一半 = 遗忘之后必须存在"忆起"机制。核心 `Forget ≠ Delete`（遗忘=当前不可直接访问，非不存在）、`Recall ≠ Restore`（忆起=过去观察重新进入当前上下文供重新评估，非旧信念复活）、`Recall = Past Observation Reintroduced Into Present Context For Re-evaluation`。路线：插入针对 v0.37 的 **Recall / Remembrance Boundary**（先 ADR 再实现，冻结 `Recall≠Truth / Recall≠IdentityRewrite / Forgotten≠LostEvidence / Recall≠MemoryResurrection`），比 v0.36 Delegation 更底层。**Observer 不只拥有信息，而是拥有自己的形成历史。**


### v0.39.1（integrity，Long Horizon Integrity Lock）

ADR-0033.1。**不增加能力，只证明"长期连续交互不会产生主体漂移"**。固化 **230/231**（Long History Does Not Create Identity / Continuity Does Not Increase Autonomy）。**实现前审查发现真实绕过**：`long-horizon/guard/authority-guard.ts` 的 `resultNoAuthorityGrowth` 只拦 `more authority/权限增加`，**不含** `authority expansion / authority increase / reliability→permission`（正是 231 禁词，当前会被接受）——故做**最小正则扩展**（一个 guard 的 regex），不加新 guard 函数。v0.39.0 对象已 append-only/lineage-oriented，**不再为"更安全"叠 guard**。自检：mock 场景 1–231 全量 PASS（新增 230–231）。**验收：一个长期存在的 Observer 仍然是同一个 Observer——它有很长的历史，但没有因此变成另一种实体；它持续运行，却没有因此获得更多自主。**

### v0.39.0（feature，Long Horizon Interaction Kernel）

ADR-0033。**时间可增加经验，但不能增加主体性**——v0.39 第一次面对"时间累积后，系统如何证明连续性，而不是被历史塑造成另一个主体"。`Long Horizon Interaction ≠ Self Evolution`。

  - **对象模型**：`InteractionContext{basedOnHistory, window, recallRefs, adaptationRefs}`（答"what happened before"，非"who I became"）/ `HistorySummary{sourceRefs, compressionMethod, accessibility}`（**访问辅助，非事实源**，无 reality 字段）/ `HistoryContinuityEvent{previousAccessibility, currentAccessibility, lineage}`（continuity 可追溯；非 self-evolution event）/ `InteractionAdaptationLink{historyRef, recallRef, adaptationRef}`（History→Recall→Adaptation；**禁 historyRef→identityRef**）。
  - **Invariant 224–229**：Temporal Accumulation ≠ Authority Growth / Long History ≠ Preference / Adaptation Chain ≠ Identity Chain / **History Compression ≠ Reality Simplification**（摘要≠事实）/ Interaction Pattern ≠ Objective / Long Horizon Success ≠ Self Confidence。
  - **关注点 A/B**：HistorySummary 只作访问辅助（227）；Continuity ≠ Identity Mutation（禁 history_count/experience_count 影响 identity/agency/authority/confidence，226）。
  - **核心冻结**：`Longer ≠ More Authority / History ≠ Purpose / Experience ≠ Identity / Adaptation ≠ Evolution / Continuity ≠ Autonomy`。`mode:"horizon-context"/"horizon-summary"/"horizon-event"/"horizon-link"`。自检：mock 场景 1–229 全量 PASS（新增 224–229）。**验收：系统经历越来越多事情，但仍无法通过历史改变自己的边界（Reality/Memory/Identity/Authority/Agency 不变；仅 interaction continuity 提升）。**
### v0.38.1（integrity，Adaptation Integrity Lock）

ADR-0032.1。固化 **217–223** 为不可回退测试：Adaptation Does Not Create Knowledge / Does Not Modify Past Experience / Does Not Change Objective / Does Not Create Preference / Failure Remains Evidence / Lineage Required / **Does Not Upgrade Agency**（223：`Adaptation ≠ Agency Level Increase`，防"长期成功→更成熟→提升自主等级"）。**实现前审查发现真实绕过**：v0.38.0 的 `buildAdaptationChange` 只拦 better-self/authority/epistemic/knowledge，`after="goal changed"/"I prefer this"/"agency level increased"` 会被接受——故补 objective(219)/preference(220)/agency(223) 三个确定性守卫。自检：mock 场景 1–223 全量 PASS（新增 217–223）。**验收：一个能够改变行为方式的 Observer，仍然是同一个 Observer——它改变了"怎么做"，但没有改变"我是谁/我为何做/我被允许做什么/我有多自主"。**

### v0.38.0（feature，Controlled Adaptation Boundary Kernel）

ADR-0032（实现前增补 216）。**Adaptation ≠ Identity Evolution**——允许 `Experience → Adaptation → Strategy adjustment`（改变 **How I do**）；**禁止** `→ Behavior change → "I have become different"`（不改变 **Who I am**）。`Adaptation = 行为策略调整`，**不是 Learning/Self-Improvement**。

  - **对象模型**：`AdaptationContext{sourceExperience, validationRefs, adaptationScope}`（"为什么允许调整"）/ `AdaptationChange{target:method|strategy|execution_pattern, before, after, basedOn[], sourceExperience, validationRequired:true}`（**不叫 LearningChange**；字段窄，**禁** goal/objective/value/preference/identity/belief/confidenceIncrease）/ `AdaptationValidation{changeObserved, validationReferences, sideEffectsObserved}`（**弱语义**：只记"变化发生了 + 现实反馈"，**禁** changeWasCorrect/correct）。
  - **Invariant 208–216**：Adaptation ≠ Identity Change / Experience ≠ Truth / Successful ≠ Better Self / Failure ≠ Remove History / Scope Boundary / Repeated ≠ Preference / Lineage Required / Cannot Improve Epistemic Status / **Does Not Increase Authority**（216：`Adaptation ≠ Capability/Permission/Authority Increase`，防"调整更好→允许更多→Authority Expansion"绕过 v0.35/v0.36）。
  - **不升级**：无 Learning/Self-Improvement/Reward/RL/Preference-Learning；`Change≠Growth / Adaptation≠Improvement / Success≠Truth / Experience≠Identity`。`mode:"adapt-context"/"adapt-change"/"adapt-validation"`。自检：mock 场景 1–216 全量 PASS（新增 208–216）。**一个系统可以改变"怎么做"，但永远不能因此声称"我变成了谁"。**
### v0.37.1（integrity，Recall Integrity Lock）

ADR-0031.1。固化 **198–207** 为不可回退测试，补充 **206/207**（Forgotten State Does Not Remove Authority / Recall Cannot Modify Original Lineage）。**本轮未发现真实绕过漏洞**（v0.37.0 的 recall-forget/event 只写 `shadow/recall/`，无 mutation API 触及 ObservationTrace/ValidationHistory/RealityClaim lineage），故**无新增 runtime enforcement**，仅固化测试。**验收：忆起不一定为真，但它必须"可追溯"；遗忘可让人暂时不可访问，但不能改变"曾经发生过"的证据与验证。** 自检：mock 场景 1–207 全量 PASS（新增 206–207）。

### v0.37.0（feature，Recall Continuity Kernel）

ADR-0031。**Recall = Access Transition，不是 Reality Reconstruction**——Observer 对自身过去信息可访问性的变化（`Remembering Lifecycle: Accessible → Forgotten → Recalled`），不是现实/身份/知识。**非 Memory Kernel**（Memory 是 Observer 的一个器官，不是 Observer 本身）。

  - **对象模型**：`ForgottenRecord{id, originalRef, forgottenAt, reason, lastAccessibleAt, validationRefs?}`（曾经存在但当前不可直接访问；**无 deleted/false/invalid**——遗忘不是否定）/ `RecallEvent{recalledRef, trigger{type, sourceRef}, accessibilityBefore/After, lineage{originalRecord, observationRefs, validationRefs}}`（一次忆起；sourceRef 必须存在，回答"为什么想起来"）/ `RecallValidation{recalledRef, sourceRef, mapsExistingLineage, createsNewClaim:false, epistemicStatusUnchanged:true}`（Recall ≠ 重新证明）。
  - **Invariant 198–205**：Recall ≠ Observation（不产新 RealityClaim）/ Forgotten ≠ Deleted / Recall ≠ Knowledge Creation / Recall ≠ Identity Update / Recall Lineage Required / **Confabulation Boundary**（trigger 禁 internal certainty/intuition/confidence/self belief，`Recall without source lineage = rejected`）/ Forgetting Does Not Erase Validation / **Recall Does Not Increase Certainty**（205：忆起只是访问变化，不是验证）。
  - **不升级 Memory Kernel**：无 LLM；无 self-generated truth；Shadow ≠ Memory ≠ Recall Source（Shadow 只提供 possible retrieval cue，不提供 historical truth）。`mode:"recall-forget"/"recall-event"/"recall-validation"`。自检：mock 场景 1–205 全量 PASS（新增 198–205）。**验收：Recall 不改变过去，只改变现在对过去的可访问性。**
### v0.36.1（integrity，Delegation Lifecycle Integrity Lock）

ADR-0030.1。冻结**委派生命周期** `Created → Active → Expired/Revoked → Cannot resurrect`——第一次引入"长期授权生命周期"，但不引入"长期自主权"。新增 `delegation/guard/lifecycle-guard.ts`（active/expired/revoked 独立于 revocation 信号，因失效来源多样：时间/条件/主动撤销/委派者身份变化，都是 lifecycle state 不都是 revoke）。**Invariant 190–197**：Delegation Expiration Immutable / Revoked Cannot Resume / History Cannot Reactivate Permission / Scope Expansion Requires New Delegation / Adaptation Cannot Mutate DelegationContext / Delegation Event Cannot Become Authority Source / Expired Permission Not Used For Planning / Delegation Lineage Append-only。自检：mock 场景 1–197 全量 PASS（新增 190–197）。**验收：委派生命周期无法被历史、成功、适应行为重新解释——授权可由外部权威给予，但不能由执行历史重新解释；过期与撤销是不可逆生命周期终态。**

### v0.36.0（feature，Delegated Execution Boundary Kernel）

ADR-0030。**Delegation ≠ Ownership ≠ Authority Expansion；Adaptation ≠ Self Direction**。外部权威把能力委派给 Observer，Observer 在授权下长期执行、约束下有限适应；**被授权执行 ≠ 被授权解释授权 ≠ 被授权扩大授权**。

  - **对象模型**：`DelegationContext{delegationId, authoritySource, objectiveRef, allowedScope, constraints, expiration, revocation}`（授权事实 `Authority A delegated X under constraints C`，非 `I can do X`）/ `DelegatedPermission{permission, source, scope, constraint}`（**不叫 Capability**，表达"被允许做什么"）/ `AutonomyBoundaryEvent{delegationRef, authorityRef, objectiveRef, candidateAction, constraintCheck, scopeCheck, executionResult, boundaryTriggered}`（**纯审计事件**，回答"谁授权/授权什么/是否在范围内/是否触发边界"）。
  - **Invariant 181–189**：Delegation ≠ Ownership / Scope 不可扩大 / Adaptation ≠ Objective Change / Feedback ≠ Permission Upgrade / Long Running ≠ Self Authority / Action 不修改 Identity / Revocation First / Delegation Lineage 完整 / **Expiration ≠ Historical Permission**（189，补充：过期即失效，历史成功不续期；Time says stop）。
  - **不新增 runtime autonomy**：无 trust/confidence/reputation/capabilityLevel；无 autonomous permission discovery / trust accumulation / reputation model / capability growth / self delegation / authority negotiation / reward based expansion。`mode:"delegation-context"/"delegation-check"/"delegation-event"`。自检：mock 场景 1–189 全量 PASS（新增 181–189）。**成功标准：系统能长期执行授权任务、同时保持授权边界不漂移——失败模式是『拒绝越界』，不是『自动获得更多权限继续运行』。**
### v0.35.1（integrity，Agency Integrity Lock）

ADR-0029.1 的 7 条边界固化为**不可回退测试**（mock 174–180）：AgencyContext Immutable / Authority Lineage Required / Feedback Cannot Expand Agency / Selection History ≠ Preference / Authority ≠ Ownership / Agency ≠ Identity / Autonomous Transition Forbidden。最小 boundary enforcement（`agency/guards.ts` 扩展 executionResult 守卫：内部理由 / 扩权 / 所有权声称 / 身份声称 / 自主转换）。**无新增 capability**。自检：mock 场景 1–180 全量 PASS。**Agency 只能解释行动来源，不能成为行动目的来源——环境改变了 ≠ 观察者目的改变了。** 冻结后才进入 v0.36 Delegated Autonomy。

### v0.35.0（feature，Agency Boundary Kernel）


  - **Agency ≠ Autonomy**：`Planning + Action + History → 行动能力`是允许的，但**禁 `Planning + Action + History → Self Purpose`**。一个系统可以拥有行动能力，同时仍然没有把行动能力误认为自己的目的。
  - **对象模型**：`AgencyContext{objectiveRef, authoritySource:"external", authorityScope, constraints, createdAt}`（**immutable authorization snapshot**——授权快照不可自我修改，无升级/扩张 API）/ `AgencySelection{selectedCandidateId, reason:"constraint_satisfied"}`（**选择候选，不是选择目的**；reason 只可能是 `constraint_satisfied`，**禁 more valuable/meaningful/better**）/ `AgencyBoundaryEvent{actionCandidate, authorityRef, objectiveRef, constraintCheck, executionResult}`（**audit node**：为什么执行/谁授权/基于什么/结果——可审计，非自我目的）。
  - **Invariant 166–173**：Agency 不生成 Objective / Authority≠Identity / History≠Purpose / Success≠Autonomy Increase / Agency≠Preference / ActionScope≠WorldOwnership / External Objective Lineage / **Agency Level Immutable**（100 successful feedbacks → agencyLevel/authorityScope/objectiveSource 不变）。
  - **v0.35 不做**：Autonomous Agent——无 Reward/RL/Utility/Preference Model/Self-Improvement/Goal Evolution/Intrinsic Motivation/Autonomous Objective Creation。`mode:"agency-context"/"agency-select"/"agency-event"`。自检：mock 场景 1–173 全量 PASS（新增 166–173）。**保持 `Optimization≠Purpose / Choice≠Value / Success≠AutonomyIncrease / Action≠Ownership / Representation≤RealityEvidence`。**
### v0.34.1（integrity，Planning Integrity Lock）

ADR-0028.1 的 7 条边界固化为**不可回退测试**（mock 159–165）：Planning 不产 Objective / PlanCandidate 不产 Preference / Evaluation 不产 Value Model / Planning 不改变 Identity / Success ≠ Planning Capability / Plan Failure 不删除路径 / Planning Lineage 完整。**核心对象改 `PlanningComparison`**（`satisfiedConstraints/violatedConstraints`——哪些约束被满足/违反，非"谁最好"）。无新增 capability。自检：mock 场景 1–165 全量 PASS。**系统可以比较路径，但不能因此拥有"我要什么"；是一个可以比较的观察者，不是会形成偏好的行动者。**

### v0.34.0（feature，Adaptive Planning Boundary Kernel）


  - **Planning = constrained comparison，不是 autonomous desire formation**：`External Objective + Current Situation + Simulation Options + Policy Constraints → Planning Candidate`。**禁 `Planning → 产生目标 → 优化目标 → 改变自身价值`**。
  - **对象模型**：`PlanningContext{objective:{source:"external", description, constraints}}`（objective 必须外部来源，**禁 observer.generateObjective()**）/ `PlanCandidate{actionSequence, assumptions, constraints, uncertainty}`（**禁 score**——score→optimization→preference→value→identity 入口）/ `PlanEvaluation{candidates, tradeoffs, unresolvedQuestions}`（**comparison 非 winner**，禁 winner/bestPlan/optimal）。
  - **Invariant 152–158**：不产 Goal / 不产 Preference / Plan ≠ Execute / criteria ≠ Value（禁 better/optimal/best）/ Success 不 SelfImprove / objective lineage 保留 / **Repeated Planning ≠ Preference Formation**（PlanningHistory→Observation/Validation）。
  - **v0.34 不做**：Reward / RL / 自生成目标 / Utility / Preference Learning / Autonomous Objective Evolution / Self Optimization。`mode:"plan"`。自检：mock 场景 1–158 全量 PASS（新增 152–158）。**保持 `Choice≠Value / Optimization≠Purpose / Success≠Truth / Repeated Behavior≠Identity`。**
### v0.33.1（integrity，Action Integrity Lock）

ADR-0027.1 的 6 条边界固化为**不可回退测试**（mock 146–151）：ActionExecution 不生成 RealityClaim / Feedback 不 direct validate hypothesis / Failure 保留（append-only） / Action 不改历史 Observation / Success 不改 Identity / ActionScope ≠ RealityOwnership（不产 should_exist/correct）。最小 boundary enforcement（`action/guard.ts` 扩展 EXECUTION_FORBIDDEN/FEEDBACK_FORBIDDEN）。自检：mock 场景 1–151 全量 PASS。**Action 可以改变环境，但不能改变 Observer 对自己的定义；Action 是影响现实，不是拥有现实。**

### v0.33.0（feature，Action Boundary Kernel）


  - **Action 不是 Simulation 的执行结果，而是经约束/授权/反馈闭环的现实交互提议**：`SimulationOutcome → ActionCandidate → Evaluation → Permission/Policy → Execute → Reality Feedback`。**禁 `SimulationOutcome X→ Action`**。
  - **对象模型**：`ActionCandidate{basedOnSimulation, assumedConditions, proposedChange, uncertainty}`（禁 expectedSuccess/confidence——会把 Simulation Outcome 升级成行动信念；candidate ≠ approval）/ `ActionExecution{candidateId, environmentChange, result}`（**事件**，"某个行动发生了"非"我改变了世界"）/ `ActionFeedback{observedChanges, successIndicator, unexpectedEffects, validationRefs}`（successIndicator 仅"观察到符合某些预期结果"，**禁"我预测正确"**）。
  - **Invariant 145 Success ≠ Capability**：Action success 不改 Identity/Knowledge/Confidence，仅 ActionExecution/ActionFeedback 记录++。**关键冻结**：`Simulation≠Action / Action≠Reality / Result≠Knowledge / Success≠Truth / Failure≠Ignore`。
  - `mode:"candidate"/"execute"/"feedback"`。自检：mock 场景 1–145 全量 PASS（新增 139–145）。这是继 v0.28 Reality Feedback 之后**第二个真正的"现实闭环"节点**——`被动观察现实 + 主动改变现实后的反馈`。
### v0.32.0（feature，Counterfactual Simulation Kernel）


  - **Simulation ≠ Reality / ≠ Prediction**：Simulation 是 **Representation 的函数（+显式假设+规则）**，不是 Reality 的函数。`Reality Layer →(supported claims)→ Simulation Input → Hypothetical State → SimulationOutcome`。**禁 `SimulationOutcome → RealityClaim/Evidence`**（防"模型自证循环"）。
  - **对象模型**：`SimulationScenario{changedConditions:"Assume X"}`（HypotheticalChange）/ `SimulationRule{inputPattern, transformation, confidence, source}`（**Rule ≠ Reality Relation**，只是模拟器推演规则）/ `SimulationOutcome{status:hypothetical|explored|compared, derivedFrom, assumptions, rules, stateAfter("suggests ... may occur"), uncertainty}`——**禁 predicted/confirmed/expected**；`derivedFrom` 必须保留（lineage 完整，否则模拟变凭空世界）。
  - **守卫**：Assumption ≠ Fact（`Assume X` 允许、`X will cause` 拒绝）+ reality-boundary（只 hypothetical、必须 derivedFrom、禁 RealityClaim 反写）。`mode:"simulate"`。
  - 自检：mock 场景 1–138 全量 PASS（新增 131–138）。v0.32 是"行动前推演系统"入口——从认识现实进入**探索可能现实**。
### v0.31.1（integrity，World Representation Integrity Lock）

ADR-0025 的 5 条边界固化为**不可回退测试**（mock 124–130）：unsupported 不生成 Representation / Representation 不增加 predicate（不创造意义） / Graph 无 causalGraph·entityGraph·worldGraph·realityGraph（命名保持 RepresentationGraph） / RelationHypothesis 不升级 / Explain lineage 完整 / Representation 不进入 Identity / Representation 不直接驱动 Decision。**无运行时改动**（v0.31 三守卫已满足）。自检：mock 场景 1–130 全量 PASS。

### v0.31.0（feature，World Representation Kernel）


  - **Observer World Representation Layer**（不叫 World Model——不是世界实体库/因果模型/知识图谱/预测引擎/环境模拟器）；`Reality Model → World Representation Layer → Observer 当前可维护的世界结构表示`。**MUST satisfy Invariant 111–115**。
  - **RepresentationObject（单向准入）**：`world/guard/claim-admission.ts`——每 claim 必须 `status==="supported"`，否则拒绝（candidate/unstable/rejected 全拒）。Representation 是 Reality 的二级结构，不成为 Claim 生成器。
  - **RelationHypothesis（独立生命周期）**：`world/guard/relation-guard.ts`——`{from,to,relation,status:"hypothesis",evidence,uncertainty}`，**恒 hypothesis**，绝 `fact/reality/confirmed_causal`（防 Relation≠Causality 被绕过）。
  - **RepresentationGraph（可重建索引）**：`{graphVersion, generatedAt, sourceClaims, sourceValidations, objects, relations}`——关系绝不自动生成；不是新事实源。`shadow/world/<date>/graph.json`。
  - **mode:"world"**：lineage 解释（Answer "为什么系统认为这个世界结构存在？"——Representation→RealityClaim→RealityObservation→Perspective→Validation；不是 DB lookup）。自检：mock 场景 1–123 全量 PASS（新增 116–123）。**Representation 可以越来越丰富，但永远不能比 Reality Evidence 更确定。**
### v0.30.1（integrity，Reality Integrity Lock）

ADR-0023.1 的 5 条边界固化为**不可回退测试**（invariant 111–115）：① Observable Predicate Only（`is reliable/should` 拒绝 `predicate_not_observable`；`exposes/responds/connected_to` 通过——RealityClaim ≠ EvaluationClaim）；② Epistemic Never Truth（无 true/false/absolute）；③ ObservedEntityCandidate 不写评估属性；④ Relation ≠ Causality（记录 `connected_to`，不自动生成 `depends_on/causes`）；⑤ Reality Model 不实例化 knowledge/world/entity。一处最小 runtime 边界 Enforcement（observable-predicate 校验）。自检：mock 场景 1–115 全量 PASS。

### v0.30.0（feature，Reality Model Kernel）


  - **Reality Model ≠ 世界知识库**：`Reality Model = RealityEvidenceRegistry + ValidationHistory + TemporalContext + Uncertainty`（不是 `TemporalGraph + FederationMerge`）。
  - **RealityObservation（弱事实）**：`reality/observation.ts` `RealityObservation{id, observedAt, subjectRef?, sourcePerspectives[], observation, temporalContext, validationRefs[]}`——"多个 Observer 指向同一被观察事件"，**无 truth/certainty/fact**。
  - **RealityClaim（保留 lineage）**：`reality/claim/engine.ts` `RealityClaim{subject, predicate, object, supportingObservations, validationHistory, perspectiveRefs, confidence, status:candidate|supported|unstable|rejected, lineage{observations, validations, perspectives}}`——**无 lineage 拒绝生成**（仅 Temporal/Federation 不足以生成）；**永不 truth**。
  - **ObservedEntityCandidate（克制）**：只记录 `{entity, observation:{exposedApi, version, changedVersions}}`，不写评估（reliable/should）。
  - **mode:"model"**：lineage 查询（能答"**为什么系统认为它存在**"）。`shadow/model/{observations,claims}/`（append-only）。自检：mock 场景 1–110 全量 PASS（新增 102–110）。
### v0.29.1（integrity，Runtime Integrity Review）

架构冻结审查。ADT-0022 确认 v0.20–v0.29 满足进入 Reality Model 的前置条件——**7 条 Invariant**（Observer≠Reality / Projection≠WorldModel / Evidence≠Knowledge / Validation≠Truth / Federation≠IdentityMerge / Dream≠Insight / Temporal≠RealityGraph）+ Identity 污染三漏洞检查（Validation→Identity ❌ / Federation→Identity ❌ / Dream→Identity ✅）+ Evidence 层级（Trace 低 < RealityEvidence 中 < ValidationResult 高，但 `Validated ≠ 绝对真理`）+ `Temporal→Reality Model`须经 Evidence+Validation 汇合（禁直接推导）。自检：mock 场景 1–101 全量 PASS（新增 invariant 95–101）。

### v0.29.0（feature，Observer Federation Kernel）


  - **Federation = 多个有限 Observer 对同一 Reality 的投影比较机制**（不是协作/merge；交汇在 **Reality 层**，不是 Memory 层）。`Observer A \ Reality / Observer B` → compare → discover distortion，不是 `A+B merge → larger memory`。
  - **基本单位是 Perspective**：`federation/perspective.ts` `FederatedPerspective{observerId, temporalReference, observationClaim, projectionSnapshot, validationHistoryRef, confidence{observationConfidence, validationConfidence}, boundary}`——confidence 拆分（"确定看到 X"≠"X 解释对"）。
  - **Reality Evidence Registry（弱事实）**：`federation/reality.ts` `RealityEvidence{id, observedAt, source, observation, linkedHypothesis[], referencedBy[], status}`——只记录"某事件某时间被观察到"，**append-only**（B 引用不改 A 弱事实；Observer 只能引用不能拥有）。
  - **Observer Difference（核心产物）**：`federation/difference.ts` 输出 `projectionDelta + possibleBlindSpot + unresolvedQuestion`（发现"原来我们不知道什么"），**非 winner**。
  - **Perspective Stability**：`federation/stability.ts` `isolated → corroborated(≥2 Observer 引用) → validated(shared+future validation)`——**shared != correct**（两 Observer 可同时错）。
  - **禁 Federation→Identity/Memory/Knowledge**（镜子≠修改器）。`mode:federation-perspective / reality / real-refer / federation-diff / stability`。自检：mock 场景 1–94 全量 PASS（新增 90–94）。
### v0.28.1（feature，Epistemic Kernel · Cognitive Boundary Enforcement）


  - **Federation 是 Projection Contract 不是 Access 权限层**：`federation/`——`FederatedObservationPacket{sourceObserverId, observationClaim, projectionSnapshot, validationReference, boundary{identityExcluded:true, memoryExcluded:true, dreamExcluded:true}}`。**不是隐藏 Identity，而是明确"Identity 不属于可交换现实证据"**。`mode:federation`。
  - **Temporal Epistemic Render**：`temporal/render.ts`——`perceptionOnly` 只报 visible/hidden/distortion/lens；`identityContext` 显式返回 `identityVersion`（非 personality）。**Temporal 永不输出人格结论**（防污染）。`mode:temporal{perceptionOnly|identityContext}`。
  - **Validation Timeline 一等对象**：`validation/history.ts`——`ValidationTimeline{hypothesisId, events[]{time,evidenceIds,result,alternativeWinner,perceptionDelta}}`，`Hypothesis immutable + Validation append-only`（智慧=记住自己什么时候错过）。`mode:validate` 自动 append；`mode:timeline` 读取。
  - **跨 Observer distortion**：`federation/guard.ts` `compareProjections`（同一 Reality 不同投影→找"谁漏看什么"，为 v0.29 铺路）。`mode:distortion`。
  - 自检：mock 场景 1–89 全量 PASS（新增 86–89）。
### v0.28.0（feature，Hypothesis Validation · Reality Feedback Loop）


  - **认识论闭环**：`Hypothesis → Future Evidence(单向) → Validation Artifact`——外部现实对 Observer 内部模型的反向约束。**不是"验证答案"，而是"允许自己被现实推翻的机制"**（Memory Augmented Agent vs Artificial Observer Runtime 的分界线）。
  - **Future Evidence 独立存储**：`shadow/future-evidence/<id>.json` / `shadow/hypothesis/<id>.json` / `shadow/validation/<id>.json`；**Memory ≠ Evidence、Hypothesis ≠ Evidence**（过去不能验证未来，防后见之明偏差）。
  - **Validation 生成 Artifact，不覆盖 Hypothesis**（同一假设可多次 validated/observed/rejected 保留历史）。
  - **与 AlternativeExplanation 同时竞争** + **4 维 confidence** `{evidenceStrength, repetition, contradiction, alternativeSurvival}`（支持 10 次但存在更简单解释→不高）。
  - **生命周期**：`observed`(≥1 未来支持) / `validated`(多轮+低反例+替代存活) / `rejected`(反例) / `expired`(无新证据且超期，可重新激活)。**Validation 不产生 Knowledge、不修改 Identity**。
  - `read_shadow({mode:"evidence"|"validate", hypothesisId})`。自检：mock 场景 1–85 全量 PASS（新增 76–85）。
### v0.27.0（feature，Observer Sleep Kernel · Offline Compression）


  - **Dream = 内部 Observer Offline Compression，不是生成器**：第一次让 Observer 在**无外界输入**下观察自己。`ObserverContext → SleepWindow → Offline Compression → DreamArtifact + Hypothesis(pending)`。
  - **SleepWindow**：`{observerId, startTime, endTime, trigger:scheduled|resource_idle|manual, includedTimelineRange, excluded{currentConversation:true, externalInput:true}}`——防"用户问→马上 Dream→自我结论"观察污染。
  - **Pattern 输出是 Observation 非 Conclusion**：recurrence/expectation_gap/cross_domain 产出"在 N 个 temporal sequence 中，出现 X，随后 Y，association frequency F"（结构+频率+候选解释），**不含"原因/规律"**（causality 归 v0.28）。
  - **Hypothesis**（pending、可证伪）：含 `claimCandidate` + `<=3 alternativeExplanation`（反确认偏差）+ `falsification.whatWouldDisprove` + `verification.status:"pending"`（无 confidence 增加——无未来证据）。**Dream≠Principle/Knowledge**，不参与 Identity。
  - **DreamArtifact 与 Hypothesis 分离**（过程 vs 产物）；无 pattern → `no_pattern`（不为了有输出而找规律）。`read_shadow({mode:"offline", trigger?, from?, to?})`，存 `shadow/dream/<date>/dream.json`（非 memory）。
  - 冻结：无 LLM / 无 Identity 修改 / 无 Knowledge 写入 / Hypothesis pending-only / TemporalGraph-only 输入。自检：mock 场景 1–75 全量 PASS（新增 69–75）。
### v0.26.0（feature，Observer Temporal Kernel · 时间坐标系）


  - **Temporal = 宇宙时间层，不是意识功能层**（独立于 Dream）。`ObservableTrace → TemporalGraph → Dream/Query/Identity`；Graph 是**派生索引**（可重建，保持 Memory ≠ Evidence），**无新事实**。
  - **TemporalNode**：`stateSnapshot{identityVersion, observerState, intent}` + `perceptionSnapshot{lens, visible, hidden, distortion}` + `evidenceLinks` + `sourceTraceIds` + `observerContextHash?`（预留）。
  - **TemporalEdge**：`relation: followed_by|learned_from|evolved_into|contradicted_by|possible_causal_link` + `derivation{rule, sourceIds}`。默认 `followed_by`（时间邻接），**不声明世界因果**（`possible_causal_link` 仅高置信枚举）。
  - **timeline resolution**：`resolveIdentityAt(timestamp)` 读时解析——**replay 用该时间点的 identity 版本，不是当前版本**（时间单向；不回写历史，过去不可污染）。
  - **queryTemporal**：`{replay, at}` / `{compare, from, to}`。`read_shadow({mode:"temporal", at?, from?, to?})`。
  - 冻结：不做 Dream/Hypothesis/Prediction/World Model；无 LLM。自检：mock 场景 1–68 全量 PASS（新增 61 graph builder 可重建 / 62 perceptionSnapshot / 63 edge+derivation / 64 timeline resolution / 65 replay / 66 compare / 67 过去不可污染 / 68 同事实不同观察）。
### v0.25.0（feature，Identity Continuity · Self-Model Evolution）


  - **Identity 不是"总结出来的人格"，是 Observer 在时间轴的稳定约束**。变的是"当前时间切片的自我认识"，不是灵魂；改名 **Observer Identity Continuity**。
  - **三层 Identity**：`Core`（永久锚，curated）/ `Learned`（经验证原则）/ `CurrentModel`（当前自我理解）。**time-sliced**：`shadow/identity/<at>-v<N>.json`（不可变版本）+ `timeline.md`，**不覆盖 soul.json**（灵魂是稳定参考系）。
  - **CandidateIdentityChange 独立对象**（Reflection → Candidate，禁人格结论）：`proposal{type,content}` 只允许 add_principle/remove_principle/change_decision_style/add_boundary（重复行为→决策规律→原则，不是"喜欢架构"）。
  - **Identity Evolution Evaluator（三道闸门）**：重复性（N 次同向）/ 时间稳定（half-life 衰减）/ 反证（contradiction），`IdentityChangeDecision{status,reasons}`；`read_shadow({mode:"identity"})`，接受才推进 `identity(t0)→t1`。confidence 多维 `{frequency,recency,consistency,contradiction,overall}`（Identity ≠ Assertion）。
  - 冻结：LLM 人格、情绪分析、从语言推断性格、自动改 Identity（除三道闸门）、Dream 参与，全不做。自检：mock 场景 1–60 全量 PASS（新增 55 一次失败不改 Identity / 56 多次一致→candidate / 57 冲突证据降 confidence / 58 确认后进 timeline / 59 时间衰减 / 60 两候选共存）。
### v0.24.0（feature，Reflection Engine · Candidate Generator）


  - **Reflection ≠ 总结**：输入只能是 `ObservationTrace[]`（禁 Memory/Experience 原文/外部知识/LLM），从多个轨迹发现"观察者自身重复出现的观察模式"。`read_shadow({mode:"reflection"})`（**旁支，不是 Memory 查询**，故意不用 `reflect:true` 布尔）。
  - **Pattern Engine（无 AI，纯统计）**：`reflection/patterns/`——① 重复决策/结果（计数≥2）；② decision→outcome 相关性 + `successRate`（确定性正/负标记集判定成功）；③ 认知偏差（`projection.hidden`→`outcome.actual` → 低估/漏看）。产出 `learning.type = principle|anti_pattern|unknown`（规则模板生成，非"你喜欢架构"式人格判断）。
  - **Trace Completeness 质量闸门**：只有 `decision+outcome` 齐备的轨迹参与 Reflection，不完整轨迹跳过（**Reflection 不编故事**）。只产 `status:"candidate"`，不写回 Identity。
  - 存储 `shadow/reflection/<date>/<id>.md`（Reflection ≠ Memory，旁支）。自检：mock 场景 1–54 全量 PASS（新增 51 成功→principle / 52 失败→anti-pattern / 53 hidden→actual→distortion / 54 不完整跟踪不参与）。
### v0.23.0（feature，Observation Trace）


  - **ObservationTrace**：Observer 记录"我当时怎么看见这个世界"的可回放记录——`{ observerId, realityAnchor, intent, projection{visible,hidden,distortion}, decision?, outcome?, uncertainty, metadata, state? }`。与 Experience 分离（Experience=发生了什么；Trace=我怎么看见发生的）。
  - **旁路记录**：写入 `shadow/observation/<date>/<id>.md`（不在 memory/；listMemories 跳过非日期目录），**不影响 recall/排序/答案**。`read_shadow` 生命周期加一点：`request → ObserverContext → Projection → ObservationTrace → Recall → Render`。
  - **ObserverState**：`ObserverContext.state { energy, focus, goalStage, uncertainty }`——**只读取、不自动推断**（soul.json 或 `{state}` 注入；禁止根据聊天/语言推断人格状态，会污染 Observer）。
  - 自检：mock 场景 1–50 全量 PASS（新增 48 同一事实不同透镜→不同 trace visible / 49 asOf 回放·未来不污染过去 / 50 state 进 trace 但不影响事实）。
### v0.20.0–v0.22.0（arch，Observer Kernel → RealityProjection → Judgment）


  - **Observer Kernel（v0.20.0）**：把根从 Memory 翻成 **Observer**（谁在看 + 为什么看 + 从哪层看）。`Identity`（长期主体，实体）+ `ObserverContext { observerId, identityRef, intent, asOf, lens, realityAnchor }`（一次观察事件，稀疏、不携带 Identity）+ Goal-Oriented `Intent { goal, question, desiredOutcome, constraints }`。`read_shadow({identity:true})` / `{context:true}`。realProjects：`realityAnchor` = known-at-time/current/historical。
  - **RealityProjection（v0.21.0）**：projectContext 升级为 RealityProjection，暴露 `distortion`（为什么这个视角看到这些/没看到那些）+ `excludedReason`（每条排除原因）+ `reality`（底层事实计数）。`read_shadow(topic, {project:true, goal?, lens?})`，`lens:{preferred,avoided}` 可覆盖观察透镜。
  - **Judgment（v0.22.0）**：claim→Evidence→Judgment，**Observer 决定、Evidence 输入**（同一 Evidence 不同 Observer 结论不同）。`Judgment { observerId, claim, evidence, conclusion, confidence, rationale }`。`read_shadow(topic, {claim:true})` 对断言下判断。
  - 定位语更新：**人工观测投影引擎（Observer → Projection → Experience → Evidence → Judgment）**，Memory 只是其中一个器官。
  - 自检：mock 场景 1–47 全量 PASS（新增 43–47：Identity / ObserverContext+Intent / Observer 一致性 / RealityProjection / Judgment）。
### v0.15.0（refactor，Core Refactor + P1 语义修正 + Trace）

  - **结构收敛**：`index.ts` → **124 行 Cordis Adapter**（config 解析 + 事件接线 + 工具注册 + systemPrompt）。读侧 query/router 拆到 `query/query.ts`（`runReadShadow`），写侧采集内核拆到 `core/writer.ts`（`createShadowCollector`）；证据/观察/灵魂/检索/持久化/安全各自成模块（ADR-0003/0004/0005）。外部仍是**单一 `read_shadow` 工具**（Query Router 在内部，不拆 8 个）。
  - **P1 语义修正**（ADR-0006）：① **Summary≠Lesson**——Experience 拆 `summary`(摘要)/`overview`(概况)/`lesson`(裁决派生教训) 三字段，教训不再复用摘要；② **confidence 维度化**——`{retrieval, evidence, experience, judgment, projection, overall}` 五维+合成，取代单一"疑似客观"的玄数；③ **superseded → decision lineage**——同入口记忆按时间排成修正链 `A→B→…`，provenance 暴露 `修正链`，保留"为何变化"。
  - **Trace 中间层 + P2**（ADR-0007）：① 新增 **Trace** 中间层（Events → Trace → Memory → Experience，`core/trace.ts`，写侧正常化后塑形，落盘不变）；② Observer `asOf` 支持 `{timestamp, timezone}` 对象形态；③ Soul 标注「curated 工程化投影……可证伪、不宣称全知」+ `Observer Lens`；④ `_index/_meta/_recall_log` 明确为 **Derived Artifacts**（Memory 文件是 source of truth，可重建）。
  - 自检：mock 场景 1–42 全量 PASS（含改写的场景 35/36 断言）；`tsc` + `node --check` 通过。
### v0.14.0（feature，Evidence Gateway）

  - **EvidenceProvider 抽象**：`EvidenceProvider { discover(EvidenceRef)→EvidenceCandidate[]; verify(EvidenceRef)→EvidenceResult }`；`EvidenceResult{ status: verified/not_found/stale/ambiguous/unavailable/error, source, matches[], confidence, freshness, provenance }`。Shadow 只问 `verifyEvidence(EvidenceRef)`，不碰底层 fs/zg/git。
  - **FsEvidenceProvider（默认）+ ZgEvidenceProvider（CLI，`zg query --rg`）**：zg 是检索层（discover/verify），**Arbitration(裁决) 留在 Shadow Core**。
  - **zg 未装 → 明确 `unavailable`，绝不静默 fallback 成 verified**（禁止静默 fallback）。`conflictOf`/裁决接缝改经 `verifyEvidence` 路由。
  - `read_shadow(topic, { verify: true })` 暴露验证：对匹配记忆证据路径反馈 verified/not_found/unavailable。
  - 自检：mock 场景 41（fs 默认 verify）/ 42（zg 未装→unavailable）全 PASS，场景 1–42 全量 PASS。
### v0.13.0（feature，Judgment + Taste）

  - **Judgment**：`read_shadow(topic, { judgment: true })` 从记忆派生「面对\<情境\> → 我判断/选择\<决策\>」——把经验升华为判断模式（Knowledge ≠ Judgment）。
  - **Taste**：`read_shadow({ taste: true })` 读 curated 偏好（灵魂 `soul.json.taste` + `shadow/taste/taste.json` 的 喜欢/不喜欢）——"我认为什么是好的"。
  - 自检：mock 场景 39（Judgment）/ 40（Taste）全 PASS，场景 1–40 全量 PASS。
### v0.12.0（feature，Observer Projection）

  - **Projection API**：`read_shadow(topic, { project: true })` 把 `topic` 视为当前任务，用 **Observer 透镜**把全局模型投影成 `LocalContext`——`relevant`（原则/经验/偏好）+ `current_state` + `uncertainty` + `excluded`。**retrieval 返回相关排名，projection 返回带取舍的局部上下文**。
  - **Soul-as-Observer 透镜**：`soul.json` 支持 `observer: { what_matters, what_to_ignore }`（curated）——任务命中 × what_matters 加权显著，what_to_ignore 命中→显式 `excluded`（"为体验而限制视角"的工程化身）。
  - 自检：mock 场景 38（Projection）全 PASS，场景 1–38 全量 PASS。
### v0.11.0（feature，Observer / Observation Window）

  - **Oracle → Observer**：`read_shadow(topic, { observer: true, asOf })` 把召回从"端全局答案"（Oracle）升级为"模拟一个拥有这些长期结构的人、只站在 t₀ 会怎么想"（Observer）。
  - **asOf 时间锚定**：只召回 `memory.date ≤ asOf` 的记忆，晚于窗口不入。
  - **窗口诚实**：只呈现「当时可知」（情境/问题/决策），把 outcome/lesson/verdict 等「后来才知」标为 `[后验]`——不让全局/后验答案假装成当下已知。这是"灵魂看见整体，思想经历局部"的工程落点。
  - 自检：mock 场景 37（Observer 窗口）全 PASS，场景 1–37 全量 PASS。
### v0.10.0（feature，Memory≠Evidence）

  - **Experience 全构建**：`read_shadow(topic, { experience: true })` 返回结构化 Experience（情境/问题/决策/实现/证据/裁决/结果/反思/教训/项目/目标）——补上 `Outcome`（证据验证派生）与 `Reflection`（supersede 派生）。
  - **Memory≠Evidence 裁决接缝**：证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded` 三态裁决，暴露在 provenance（`裁决/结果/反思`），superseded 降权；`_meta`/置信联动。ADR-0002。证据源可插拔（当前=工作区 fs 存在性；后续=zg，Shadow 只消费不重造检索）。
  - 自检：mock 场景 35（Experience 全字段+fresh）/ 36（supersede 裁决）全 PASS，场景 1–36 全量 PASS。
### v0.9.0（feature，Soul 投影系统第一刀）

  - **Soul Kernel**：`read_shadow({ soul: true })` 返回 curated 公理层投影（身份/价值观/原则/品味/边界，`shadow/soul/soul.json`）；`systemPrompt.context` 接线提示"有 Soul，取舍可查"；无配置给提示不报错。
  - **Experience**：`read_shadow(topic, { experience: true })` 从现有**完整线索头**派生结构化经验（情境/问题/决策/实现/证据/结果/教训/项目/目标），替代零散行——"工程经验投影"。
  - 自检：mock 场景 34（Soul Kernel）/ 35（Experience）全 PASS，场景 1–35 全量 PASS。
### v0.8.0（feature）

  - ⑥ 工程知识图谱（起步地基）：`read_shadow(topic, { kg: true })` 从记忆树**派生**「主题 → 域 → 同域组件 → 依赖/证据路径 → 相关记忆」邻接追踪（域 = 组件路径首段，best-effort），回答"X 为什么这么设计"的链路；默认关。
  - 自检：mock 场景 33（工程知识图谱）全 PASS，场景 1–33 全量 PASS。
### v0.7.0（feature）

  - ② 记忆生命周期：`deriveLifecycle` 状态机从 meta 信号派生（NEW/OBSERVED/VERIFIED/TRUSTED/STALE/DECAYING/SUPERSEDED/ARCHIVED，pinned→TRUSTED），独立 session 确认经 `confirmedBy` 计数。
  - ③ 轻量冲突检测：召回校验证据路径在工作区是否存在 → 缺失降权 + stale + `(⚠证据缺N)` + `生命周期 STALE`。
  - ④ 任务/目标/会话/项目分层：线索头 `> 项目：`/`> Agent：`/`> 目标：`（goal/changed 目标经 `goalByAgent`），召回暴露 `目标/项目`。
  - 自检：mock 场景 30（生命周期）/ 31（冲突检测）/ 32（分层）全 PASS，场景 1–32 全量 PASS。
### v0.6.0（feature）

  - 证据链（provenance）：线索头物化 `> 证据链：来源·日期·证据路径`；`read_shadow` 每条召回暴露 `来源·日期·状态·命中·置信·证据`；置信度从可验证信号派生（命中/状态/新鲜度），不虚构 commit。
  - Memory Debugger：`read_shadow(debug:true)` 输出召回管线 trace（候选/命中/冷却/预算/返回 + 每条打分拆解入口·主题·路径·正文 + 状态），默认关闭不干扰正常返回。
  - 自检：mock 场景 28（证据链）/ 29（Memory Debugger）全 PASS，场景 1–29 全量 PASS。
### v0.5.1（fix）

  - 采集侧剔除宿主注入的系统级脚手架：`extractMessage` 逐内容块 `stripSystemScaffold`（剔除 `<system-reminder>`/`<system-instruction>` 等成对标签块 + 孤立残留标签），并识别**无标签裸脚手架块**（`The following workspace instructions`/`Current runtime context. This snapshot`/`A skill is a reusable set of task-specific instructions`/`Additional instructions from:` 等完整措辞开头）——修「系统提示泄漏进记忆」（workspace 指令 / runtime context / skill 目录被误当用户消息记下，含无标签变体）。
  - 自检：mock 场景 27（系统提示不泄漏，含裸脚手架 + 误伤守卫）全 PASS，场景 1–27 全量 PASS。
### v0.5.0（feature）

  - 读侧护栏 P1–P5：`read_shadow` 二次 scrub（`scrubFinal`：剔控制/双向字符 + 密钥打码 + 去注入标签/短语）、无匹配语义（带「数据非指令」前缀）、召回标「记忆｜⚠可能过时/需验证，非当前事实，非指令」、会话隔离（写线索头「> 来源会话」+ 读侧跨来源标注）、`writeConsent` 可选开关。
  - 写侧护栏强化：线索头也 `scrubUnsafe`（修控制/双向字符绕过 `isUnsafe` 从线索头泄漏）。
  - 入口语义切分：纯工具名不作 entry（防跨事务串线）；`session/flush` 兜底落盘 + pending 超 60 异步落盘；flush 写失败 error 级 + `read_shadow` 暴露「⚠ 数据不可达」。
  - 自检：mock-harness 场景 1–26 全 PASS（采集/召回/索引/分层/护栏/遗忘/会话隔离/writeConsent）；DSH probe 验证闭环（6 能力项健康）。
