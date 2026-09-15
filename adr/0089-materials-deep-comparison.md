# ADR-0089: 材料对标总账 —— 22 份外来材料与三份「参考资料清单」的逐一深对比

- 状态：**已接受**（2026-09-15 / `v1.15.88`）
- 关联 ADR：**ADR-0001**（不引重服务 —— 本条 §3① 的判据源）· **ADR-0002 / 0044**（Memory ≠ Evidence）·
  **ADR-0042 / 0043 / 0051**（纯函数派生、LLM 不制造关系）· **ADR-0049**（缺件不静默）· **ADR-0060**（多粒度检索）·
  **ADR-0064**（脚本一律 `.ts`，与本条同一天）· **ADR-0065**（OpenViking 对标）· **ADR-0073 / 0076 / 0077 / 0078**（hl_mem 四轮）·
  **ADR-0080**（MemStrata 论文）· **ADR-0087**（rtk + langextract 判定，**本轮只登记不实装**）
- 关联材料清单：`references.md`（题材内核实记录）· `MATERIALS.md`（文件/状态台账，**本轮核对出它是旧口径，见 §1**）·
  `../../references-agents/<名>/AGENTS.md`（**第三份清单**：19 份给 agent 读的材料说明书；**注意是两级上跳** ——
  `..` = `vendor/`（`.docs` 在这一级），`..\..` = `dsh1/`（`references-agents` 在这一级），两者**不是同一级**）

## Context：用户 2026-09-15 的指令是「这个项目和参考资料对比 一一对比，深层次」

**本轮不再深读任何材料**（已读的见上面各 ADR；`references.md` §6.3 的覆盖率台账记着读过什么）。
本轮做的是**对账 + 逐份判定**：先证明「参考资料」到底是哪一套（三份清单口径不同），
再**逐份**回答四问：**它是什么 / 与本项目哪个机制可比 / 深层差异在哪 / 判什么**。

**为什么要先对账**：本仓自己的纪律是「**口径由磁盘枚举生成，不由手写清单生成**」
（`MATERIALS.md` §5）。三份清单互相之间、以及与磁盘之间**已经对不上** —— 在那之上做对比，
比的是**清单**而不是**材料**。

## §1 对账：三份清单 vs 磁盘（**先做，否则比错对象**）

| 清单 | 条数 | 载体 | 定位 |
|---|---|---|---|
| `MATERIALS.md` §1 | **8** | 版本控制内 | 「本地**全部**材料」总台账（自述唯一来源） |
| `references.md` §完整清单 + §1–§13 | **21 + 5** | 版本控制内 | 「与**记忆层**相关」的参考材料核实记录 |
| `../../references-agents/*/AGENTS.md` | **19** | **仓库之外** | 给 agent/人读的**逐材料说明书** |
| **磁盘本体** | **22 个目录** = **21 份材料** + 1 份上版快照（`langextract--snapshot-v1.6.0`）｜笔记 **19** | `D:\project\dsh1\vendor\_src\` | 实际存在的克隆 |

**两条口径说明**（不先写清楚，表里每个数都会被误读）：

- **磁盘 22 ≠ 材料 22**：`Get-ChildItem ..\_src -Directory` 得 **22**，其中 `langextract--snapshot-v1.6.0`
  是**同一份材料的旧拷贝**（v1.15.79 换成正规克隆时留的备份）⇒ **独立材料 = 21 份**。
  反过来，§2 里还有 **3 份只有清单/笔记、磁盘无本体**（`hl_mem` / `codegraph` / `browser-use`）
  ⇒ **§2 一共 24 个名字**（21 + 3）。
- **「21 条 URL」不是「21 份材料」**：`references.md` §完整清单 的 21 条 URL 与磁盘的 21 份材料**不是同一个集合**
  （前者含 `codegraph`、不含 `hl_mem`；后者相反）⇒ 两个数**只是巧合同值**，不要互相印证。

**四件对不上的事**（每条都可用 §5 的命令复算）：

1. **`codegraph` 有清单、有笔记、没有本体**：它在 `references.md` §完整清单 第 11 条，也有
   `../../references-agents/codegraph/AGENTS.md`（10.9 KB），但 `vendor/_src/` 里**没有它** ⇒ **从未克隆**。
2. **`MATERIALS.md` 的名册已是「换机前」的口径**：它的 8 项里 **`hl_mem` / `awesome-dsh-plugin` / `ppt-master` /
   `voyager` / `dsh-w/deepseek-harness` 五项目前磁盘上都没有**；且 §5 的更新命令写着 `cd G:\project\dsh1`
   （**G: 盘**），而当前工作区是 `D:`。⇒ **本表§1/§2 的 HEAD、许可、规模是那次枚举的快照，不得据它断言现状。**
   ⚠ 最要紧的一项：**重点材料 `hl_mem` 的本机克隆已不在**（全盘搜 `hl[-_]mem` 零命中）⇒
   `adr/0078` 那次「一手源码更正」**现在无法复核**（当时读的是 1025 个文件，现在一个都没有）。
3. **21 份材料里只有 4 份带 `.git`**（`langextract` / `PageIndex` / `rtk` / `zvec-grep`）⇒
   名册里那些 HEAD（`592c0fe` / `aa5d068` / `82e63c9` …）**无法从磁盘复算**；其余 18 份是**无版本信息的目录拷贝**。
4. **三份清单的命名互不一致**（同一份材料四种写法）：`ecc` / `ECC` · `money-printer-turbo` / `MoneyPrinterTurbo` ·
   `openspec` / `OpenSpec` · `shadcn-ui` / `ui` ⇒ 任何「按名字 grep 一遍」的统计都会**漏**。

**许可面（本轮实测，与判定直接相关）**：**2 份没有许可文件** —— `data-engineer-handbook` · `web-access`；
**1 份探针未识别、人工可读** —— `system_prompts_leaks` 的 `LICENSE` 首行 = **CC0 1.0 Universal**
（探针只按 `MIT` / `Apache` / `AGPL` 几个关键词判 ⇒ **「探针未识别」≠「不可识别」**；与 `adr/0086` §8.5 同型：
**报「实测」前，工具的实现与被量那一侧的写法都要看过**）。
其余：**AGPL-3.0 仅 `OpenViking` 一份**；Apache-2.0 有 `langextract` / `marker` / `rtk` / `strix` / `zvec-grep`（+ 快照）；
其余为 MIT。⇒ 本仓既有判据「**许可允许 ≠ 该引**」（ADR-0073）继续成立，且**这两份连许可都没有** ⇒ 引用前必须先查。

## §2 逐份深对比

**判定的量尺（本仓自己的坐标）**，四问：
① **它是不是在做本仓的活**（同题/可直接替代）？ ② **它把权威源放在哪**（DB / 服务 / 文件树）？
③ **它的"结论"从哪来**（LLM 提取 / 纯函数派生 / 外部引擎）？ ④ **它有没有本仓缺的形态**（判据、门禁、体例）？
—— 这四问对应本仓的四条铁律：ADR-0001（不引重服务）、ADR-0002/0044（Memory≠Evidence）、
ADR-0042/0043/0051（纯函数派生）、ADR-0049（缺件不静默）。

**「痕迹」列 = 跟踪文档里的提及次数**（`README`/`CONTEXT`/`BACKLOG`/`MATERIALS`/`references`/`adr/*`，命令见 §5）
—— 它是**可复算的「喂过没有」的代理**，不写死解释。
⚠ **口径必须「排除本条自身」**：`adr/0089` 自己就反复提到这些名字，不排除的话**表里写进去的数在落盘那一刻就自失真**
（同一命令实测：不排除时 `hl_mem` = **137** / `OpenViking` = **91**；排除后 = **123** / **83**，即下表的值）。

### A. 同题：直接做本仓的活（3 份）

| 材料 | 本质（实测） | 可比面（本仓） | **深层差异** | 判定 / 痕迹 |
|---|---|---|---|---|
| **OpenViking** | 上下文数据库；`viking://` 虚拟 FS + 目录级 L0/L1 + 向量定位目录 | 整个记忆层（**直接替代品**：`examples/dsh-memory-plugin` 是 Cordis 原生插件、7 个 `viking_*` 工具、`agent/pre-step` 注入） | **权威源在 DB/服务、查询走"黑盒"向量库**；本仓 `.shadow/*.md` 是 source、`_index.md`/`_meta.json` 是**可重建派生件** ⇒ 差异不是功能，是**「谁是可重建的视图、谁是权威」** | **只取概念**（AGPL）：目录级 sidecar（0065→**0075 已实现**）· L0=f(L1) 构造性一致 · 无别名模式命名。**痕迹 83** |
| **hl_mem** | Event →**LLM 提取 Claim**→ SQLite → FTS5 + 向量 → MCP | 记忆层 + **治理形态**（证据链 / 生命周期 / 门禁 / 文档体例） | **两处硬冲突**：它靠 **LLM 提取**（本仓纯函数派生，ADR-0042/0043），它是**常驻服务**（本仓无依赖插件，ADR-0001）⇒ 它落在本仓**当年否掉的同一类备选**里 | **只取治理与体例**（Apache-2.0 但**仍不引代码**）：六列能力矩阵（D8）·「被放弃方案 + 重新评估条件」体例 · 门禁三形状（0078 → **v1.15.41/42 已落地两处**）。**痕迹 123（最高）** ⚠ **本体已不在本机**（§1-2） |
| **zvec-grep** | 本地优先工作区搜索：bm25 + 语义/向量 + ripgrep | 本仓的 **`zg` 证据传感器**（`evidence/zg.ts` 只做 discover/verify） | **它做检索，本仓只用它做"传感器"**：裁决（Arbitration）留在 Shadow Core ⇒ 「检索层 ≠ 裁决层」（ADR-0002） | **已在用**（可插拔 provider，未装则报 `unavailable`）。**痕迹 17** |

### B. 同题方法论：不替代，但给判据（3 份）

| 材料 | 本质 | 可比面 | **深层差异** | 判定 / 痕迹 |
|---|---|---|---|---|
| **PageIndex** | 免向量、**基于推理**的分层文档索引 | 分层召回 + **召回信封**（成功/失败都带下一步） | 它是**文档索引器**（先建树、查询时推理遍历），本仓是**记忆投影**（每回合一个文件、索引是派生件）—— 同向的是「**都不引向量库**」（ADR-0001） | 已吸收形态（信封）；**痕迹 55** |
| **rtk** | 命令行输出压缩 + 记账/门禁 | `read_shadow` 的分层省略路径 + 两个审计门 | **没有共同消费方**（它压命令输出、本仓压记忆投影）⇒ 只可能取**判据形态** | **只登记不实装**（0087）：8 条形态（`never_worse` 守卫 / 有损必须声明损失形态 + 交出恢复句柄 / 估算与实测分字段 + 弱档自带标记）。**痕迹 56** |
| **langextract** | LLM 结构化抽取（把原文段落抽成带区间的事实） | 证据链 / provenance | **它靠 LLM 抽取**；本仓取的是**对齐判据的形状**（不许幻觉对齐）—— 与 ADR-0049「缺件不静默」同构 | **只登记不实装**（0087）。**痕迹 34** |

### C. 工程形态样本：DSP 插件 / skill 工程（7 份）

| 材料 | 本质 | **深层差异** | 判定 / 痕迹 |
|---|---|---|---|
| **archify** | 架构图/可视化插件（**唯一"真 DSH 插件"**：`dsh.bundle` + `cordis.patch.yml` + 适配器测试 + 独立 CI） | 它产出**可视化产物**，本仓产出**上下文产物** ⇒ 可比面在**插件工程形态**（挂载 / 自检 / CI），不在能力 | 在用（报告 L2）。**痕迹 11** |
| **superpowers** | 元技能集（`.claude-plugin`/`.codex-plugin`/`.cursor-plugin`/`.opencode` … 多 harness 投放） | **skill = 给模型的行为指令（散文 + 脚本）**，**插件 = 给宿主的代码契约（`inject`/`provide`/生命周期）** ⇒ 本仓的 inv 178/182、ADR-0049 那类判据在 skill 形态里**没有对应物** | 仅登记。**痕迹 14**（多为清单） |
| **agent-skills** | 技能汇总（196 文件；`agents/{code-reviewer,security-auditor,test-engineer,web-performance-auditor}` 等） | 同上：**角色化 agent 定义** vs 本仓的**单一插件 + 多 mode** | 仅登记。**痕迹 3** |
| **taste-skill** | 「品味」技能（64 文件 / 1.7 MB） | 本仓的对应面是 `soul/`（身份/价值观/品味投影）—— 但本仓**纯函数派生**，它是**给模型的散文指令** | 仅登记。**痕迹 2** |
| **OpenSpec** | 规格驱动开发（`@fission-ai/openspec@1.12.0`，specify → generate → verify） | 它把意图落成**可生成的工件**；本仓把意图落成**决策留档 + 门禁**（`adr/` 99 篇 + `audit:*`）⇒ **一个生成产物、一个守判据** | 仅登记。**痕迹 2** |
| **codegraph** | 预索引代码知识图谱（一次 `codegraph_explore` 返回"手术式上下文" + 影响半径） | **组织轴不同**：它按**符号/调用图**（结构轴），本仓的记忆按**入口点 + 时间**（时间轴）；两者都在回答"这条信息还成立吗"——它用 `impact`，本仓用**证据路径是否还存在** | 仅登记 ⚠ **本体不在盘**（§1-1）。**痕迹 3** |
| **web-access** · **browser-harness** · **browser-use** | 浏览器/CDP 自动化（**web-access 无许可文件**） | 本仓**不操作浏览器** ⇒ **无可比面**；唯一同构的「把观察回传、别信模型自述」已由 §C-下 的 OpenAI 指南覆盖 | 仅登记（web-access 无许可 ⇒ 引用前先查）。**痕迹 2 / 3 / 4** |

### D. 无可比面（登记备查，9 份）

`system_prompts_leaks`（各家系统提示词语料；**CC0-1.0** —— 探针未识别，人工读 `LICENSE` 首行才认出）· `ui`（shadcn/ui 组件库，包含 `ui@0.0.1 (private)`）·
`marker`（PDF→Markdown）· `MoneyPrinterTurbo`（短视频生成）· `hackingtool`（安全工具箱）· `ECC`（`ecc-universal@2.2.1`，
多 agent 配置集）· `data-engineer-handbook`（数据工程书单/教程；**无许可文件**）· `open-lovable`（`open-lovable@0.1.0 (private)`，
Next.js 应用）· `strix`（`strix-agent`，自动化渗透测试）。

**判据（为什么判"无可比面"）**：本仓的可比面只有四处 —— **记忆/上下文的组织与召回**、**证据与裁决**、
**治理形态（判据/门禁/体例）**、**DSH 插件工程**。这九份**一处都不落在**其中（它们是具体领域的应用或资源集）。
⇒ 它们对本仓的价值只剩**README 体例**，而那一层已由 `references.md` §1–§4 的「四条共同点」收口，**不再重复采**。

### E. 论文层（7 条线索）

| 线索 | 与本项目的关系 | 状态 |
|---|---|---|
| **MemoryBank**（Ebbinghaus 衰减） | `retention` 的 **hotness** 的**真实出处**（ADR-0065 勘误：曾误标为"OpenViking 式"） | 已在用（**痕迹 14**） |
| **MemStrata**（`arXiv:2606.26511`） | 与 `BACKLOG` **D3** 同题，且是**本仓早已引用的「cosine AUROC 0.59」的原始出处**；给出 `stale-fact-error rate` 与"允许弃答/强制作答两 regime 必须同报" | **已一手读完**（`adr/0080`，**痕迹 17**）；**分数未复现**；A.1/A.2 表体与 Table 4/5 **未读到** |
| 工具数量拐点（`2606.30317`） | 工具台账规模判据（10–15 个工具 → 选择准确率跌破 90%） | 已在用 |
| RAPTOR / HeteRAG / UMG-RAG | ADR-0060 多粒度检索层的**学术等价物** | 已在用（作对照） |
| LongMemEval | 长期记忆评测口径（hl_mem 用过） | 登记 |
| **两篇综述**（`2602.06052` / ACL 2026 Findings） | 只用来做 **G1–G4 的空白核对** | ⚠ **仍只检索、未读全文** |
| **Scrub Jay**（`2608.04746`） | 「什么该忘、什么该留」的原则 | ⚠ **仍只检索、未读全文** |

## §3 四条跨材料的「深层次」结论

**① 本仓与**所有**同题材料在一条轴上反向：权威源的位置。**
OpenViking 把权威放 DB、hl_mem 放 SQLite、zvec-grep 放索引 —— 本仓把权威放在**工作区里的 Markdown 文件**，
其余（`_index.md` / `_meta.json` / `query-log` / sidecar）**一律是可重建的派生件**（ADR-0003 / 0075）。
⇒ 因此**不能吸收**它们任何一份的运行时（ADR-0001），但**能吸收**它们在**派生件治理**上的形态（目录级摘要、
覆盖率自报、`freshness`）—— 这正是 0065 / 0075 做的事。

**② 本仓真正吸收的是「判据与门禁」，被拒的是「运行时与算法」。**
痕迹排前四的 `hl_mem`(123) / `OpenViking`(83) / `rtk`(56) / `PageIndex`(55) 里，
**没有一条**把它们的检索算法搬进来；落地的是：能力矩阵三列（D8）、`audit-layers`、`retrieval-eval`、
召回信封、目录级 sidecar、8 条判据形态（0087 待实装）。
⇒ 「**对标**」在本仓的正确形态 = **对标判据**，不是对标实现。

**③ 证据的"来源"被判据分开了三档，这是本仓与所有材料最本质的不同。**
材料里"证据"多是一个**字段**（hl_mem 的 `event/<id>`、langextract 的对齐区间、codegraph 的 `impact`）；
本仓把它拆成三层并**分别判**：**记忆（可能是模型说的）≠ 证据（可核验的事实）≠ 指令（可以做的动作）**
（ADR-0002/0044 + 读侧 `RECALL_PREFIX`「数据非指令」）。
`references.md` §1 那条 OpenAI 指南（"继续一个 response **不会**恢复浏览器会话"）是这条的**外部正例**。

**④ 三份清单本身就是**一条**纪律缺陷的样本：手写清单必漂移。**
同一批材料有四种写法、四种条数（8 / 21+5 / 19 / 22），且**主体已经换过盘**。
⇒ 由此立一条判据（写进 `references.md` §14 与本条）：
**凡"清单"这类可由磁盘推出来的字段，登记时必须带「枚举根 + 枚举时刻」**，
否则它会在换机后变成一句**看起来权威、实际不可复核**的话（与 ADR-0085 §8.7 的「能推出来的字段不要手写」同源）。

## §4 判定汇总（本仓「喂过没有」的一览）

| 档 | 材料 | 处置 |
|---|---|---|
| **已吸收（落代码/门禁/体例）** | OpenViking（概念）· hl_mem（治理与门禁形态）· PageIndex（信封）· zvec-grep（作为 `zg` 传感器）· MemoryBank（hotness 出处）· 工具拐点（台账判据） | 见各自 ADR |
| **已判定、只登记不实装** | rtk · langextract（`adr/0087`） | 待下一版 |
| **已一手读完、未复现** | MemStrata（`adr/0080`） | 分数未复现 |
| **仅登记（已定位）** | archify（在用工具）· superpowers · agent-skills · taste-skill · OpenSpec · codegraph（无本体）· web-access · browser-harness · browser-use | — |
| **无可比面（登记备查）** | system_prompts_leaks · ui · marker · MoneyPrinterTurbo · hackingtool · ECC · data-engineer-handbook · open-lovable · strix | — |
| **仍在读** | 两篇综述 · Scrub Jay（**只检索未读全文**） | — |
| **⚠ 台账失效** | `MATERIALS.md` 名册（8 项的旧口径）· `hl_mem` 本体（已不在本机） | 见 §1-2 |

## §5 怎么重放

```powershell
# ① 三份清单与磁盘的条数（对账事实）
cd D:\project\dsh1\vendor\dsh-shadow
(Select-String -LiteralPath references.md -Pattern '^- https://github.com/').Count           # 完整清单的 URL 条数 = 21
(Get-ChildItem ..\..\references-agents -Directory).Count                                     # 第三份清单/笔记条数 = 19（两级上跳！）
(Get-ChildItem ..\_src -Directory).Count                                                     # 磁盘目录条数 = 22（= 21 份材料 + 1 份上版快照）
# ② 逐份身份（规模/许可/清单文件/README 首标题/语言分布/顶层条目）—— 可重放探针
node ..\.docs\fix\2026-09-15\probe-materials-identity.ts D:/project/dsh1/vendor/_src
# ③ 只有 4 份能核 HEAD（带 .git）
Get-ChildItem ..\_src -Directory | Where-Object { Test-Path (Join-Path $_.FullName '.git') } | ForEach-Object { $_.Name }
# ④ 每份材料的「痕迹」（跟踪文档里的提及次数）—— ⚠ 必须排除本条自身，否则数会自失真
$files = @('README.md','CONTEXT.md','BACKLOG.md','MATERIALS.md','references.md') + `
         (Get-ChildItem adr -Filter *.md | Where-Object { $_.Name -notlike '0089*' } | ForEach-Object { "adr/$($_.Name)" })
(Select-String -Path $files -Pattern 'hl_mem' -SimpleMatch | Measure-Object).Count   # 换成任意材料名；本表的值就是这个口径
# ⑤ 本体是否存在（以 codegraph / hl_mem 为例）
Get-ChildItem D:\project\dsh1 -Recurse -Directory -Depth 5 | Where-Object { $_.Name -match 'codegraph|hl[-_]mem' }
# 实测只命中 1 条：`references-agents\codegraph` —— 那是**笔记目录**，不是本体
# ⇒ 本体（`_src\codegraph`）与 `hl_mem`（全盘）本轮**零命中**
```

## §6 未做 / 未验证（诚实边界）

- **本轮没有深读任何材料的内容**（§2 的"本质"栏用的是 `references.md` 已核实的记录 + 本轮实测的身份，
  **不是**本轮重读源码）。⇒ 想把 §2 的 D 类九份从"无可比面"改成有判据的结论，必须**真读**。
- **`hl_mem` 无法复核**：本体已不在本机（§1-2）⇒ `adr/0078` 的一手源码更正**只能引用、不能重放**。
- **`codegraph` 从未克隆** ⇒ 它的结论（§2 C）**全部来自 `../../references-agents/codegraph/AGENTS.md`**（他人整理），
  **未经本仓一手核实**。
- **无许可文件 2 份**（`data-engineer-handbook` / `web-access`）⇒ 可用性**不可判**（`system_prompts_leaks` 的 CC0-1.0
  是**人工读 `LICENSE` 才识别**的 —— 探针只认 MIT / Apache / AGPL 三类，见 §1 许可面）。
- **评测分数一律未复现**（OpenViking 的 LoCoMo、hl_mem 的 LongMemEval、MemStrata 的分数）——
  与既有口径一致（`references.md` §6 与 `adr/0080`）。
- **`MATERIALS.md` 的数字没有被本轮改写**（按它自己的 §5 纪律：**改数必须重跑枚举命令**，而它的枚举根 `G:\` 已不存在）
  ⇒ 本轮只在它「§1 名册」上方**就地加了一条口径标注**（换盘前的枚举 + 现枚举根），
  并给出当前根的枚举结果（`vendor/_src` 22 个目录 = **21 份材料**）。
