# references.md — 参考材料（用户提供，先记录）

> 用户 2026-09-02 提供的参考仓库清单，用于后续设计/实现参考（含「投影模式」预设与能力扩展）。
>
> **本地全部材料（含 DSH 本体、生态插件、在用工具）的名册与状态见 [`MATERIALS.md`](./MATERIALS.md)** ——
> 那是**磁盘枚举**生成的唯一台账（文件数/字节/许可/已吸收/未读/优先级）。
> **本文件只登记与记忆层相关的参考材料**的核实记录；**同一事实不在两处重复登记**（避免两处各写一遍而漂移）。

## ★ 重点材料（2026-09-11 用户指定）

> 本节是**用户点名「作为重点材料」的条目**。其余条目按时间序记在下方各节，性质是「登记备查」。
> **重点材料 ≠ 已吸收**：它只表示**要持续跟进、优先对标**。本条目**已立 ADR 裁决**
> （`adr/0073-hl-mem-benchmark.md`）—— 结论是「标定 + 一条可借鉴项（→ `BACKLOG.md` 的 **D8**）+ 逐条不吸收」，
> **无代码、无行为改动**。

### `lohr13/hl_mem`（HL-Mem）— 证据驱动的长期记忆系统

- 链接：https://github.com/lohr13/hl_mem ｜ **完整核实记录见本文 §6**
- **为什么是重点**：与本仓**同题**（agent 长期记忆），且**在证据链与生命周期治理上走得比本仓远**——
  每条记忆回查到 `event/<id>`、双时间模型（valid / recorded time）、`forget` 走统一删除闭包 + tombstone 且歧义一律
  fail-closed、逐特性一张「成熟度 / 默认模式 / 是否调外部 API / 是否写库 / **降级行为** / **晋级标准**」矩阵。
  本仓的对应面是 `evidence` 字段 + ADR-0044 + ADR-0049 ⇒ **对标价值集中在「治理形态」，不在检索算法**
  （检索上本仓已按 ADR-0060 定形为「单索引 + 层级 + 路由」，详见 CONTEXT.md）。
- **一条硬冲突（对标前必须先记住）**：它是「**LLM 负责提取**」；本仓铁律是**纯函数派生、不猜字段、
  LLM 不能制造关系**（ADR-0042 / 0043 / 0051）。⇒ 对标时**只取治理与文档形态，不取它的写入路径**。
- **两条立刻可用的借鉴**：① `docs/capability-matrix.md` 的**六列逐特性表**——比本仓「按版本记 CHANGELOG」
  更适合回答「此刻到底是什么状态」，且**「降级行为」与「晋级标准」都是必填列**；
  ② ADR 的**「被放弃的方案」逐条给放弃原因 + 末尾「重新评估条件」**体例（`docs/adr/0001-core-strategy.md`）。
- **许可**：**Apache-2.0**（本仓 MIT）——与 OpenViking（AGPLv3，只可看不可抄）**不同**，它理论上可复用代码。
  但本仓既定口径仍是「**只借鉴思想与文档结构，不引依赖**」，**本条目不改变该口径**。
- **核实状态**：GitHub API + 仓库 raw 文档核实（2026-09-11）；**未克隆、未运行、未试装，评测分数未复现**。
- **决策记录**：`adr/0073-hl-mem-benchmark.md`（2026-09-11 已接受，`v1.15.30`）—— 沿用 `adr/0065` 体例，给出
  ① 事实读数 ② 对标表（可借鉴 / 差异 / 暂不借鉴）③ **唯一可借鉴项 → `BACKLOG.md` 的 D8**（README「默认开关」
  表补**成熟度 / 降级行为 / 晋级标准**三列）④ **逐条不吸收 + 理由**（LLM 提取写入路径 / 常驻服务 / 向量库 /
  物理删除 / 双时间字段体系 / 其评测分数）⑤ 许可边界。
- **许可边界（要点）**：**Apache-2.0**，与 OpenViking 的 **AGPLv3** 不同 ⇒ 它**理论上可复用代码**；但本仓
  **仍不引其代码或依赖** —— 理由是架构判据（ADR-0001 否决常驻服务 / ADR-0043·0060 否决向量库），**不是许可**。
  **「许可允许」≠「该引」。**
- **与 `adr/0065` 的区别**：0065 的对象是**已决定吸收**（OpenViking）；本条是**重点材料** —— **两者不可混用同一动词**。

---

## 完整清单

- https://github.com/firecrawl/open-lovable
- https://github.com/asgeirtj/system_prompts_leaks
- https://github.com/datalab-to/marker
- https://github.com/shadcn-ui/ui
- https://github.com/volcengine/OpenViking
- https://github.com/DataExpert-io/data-engineer-handbook
- https://github.com/tt-a1i/archify
- https://github.com/Leonxlnx/taste-skill
- https://github.com/obra/superpowers
- https://github.com/harry0703/MoneyPrinterTurbo
- https://github.com/colbymchenry/codegraph
- https://github.com/Fission-AI/OpenSpec
- https://github.com/eze-is/web-access
- https://github.com/addyosmani/agent-skills
- https://github.com/browser-use/browser-harness
- https://github.com/Z4nzu/hackingtool
- https://github.com/affaan-m/ECC
- https://github.com/google/langextract
- https://github.com/usestrix/strix
- https://github.com/VectifyAI/PageIndex
- https://github.com/zvec-ai/zvec-grep

> 上表是 2026-09-02 那一批。**2026-09-08 起另有补充材料**，见下方各节（§1–§4 / §5 / §6 / §7–§13 / §16–§18）；
> 其中 **`lohr13/hl_mem` 是用户 2026-09-11 指定的重点材料**，已提到本文顶部单开一节。
> **口径**：同一条材料**只在一处完整登记**；后到的重复指定**不重写旧段**，只在**新日期段**里补核实或刷新读数
> （§8 是首次补核实，§9 只是刷新读数 —— 因为 §3 早已完整登记过）。

## 按与本项目（dsh-shadow / 投影模式 / 能力扩展）的关联度粗分

**强相关（记忆 / 设计拷打 / 能力扩展 / DSH 生态）**
- `volcengine/OpenViking` — 自进化上下文库（本项目 ADR 的对照项）。
- `VectifyAI/PageIndex` — **免向量库、基于推理的 RAG/上下文索引**（`Document Index for Vectorless, Reasoning-based RAG`；Python，35.7k⭐）。与 dsh-shadow 的「不引向量库 + 分层/推理式召回」同向（呼应 ADR-0001），**已克隆到 `vendor/_src/PageIndex`**。
- `zvec-ai/zvec-grep` — **本地优先工作区搜索（bm25 + 语义/向量 + ripgrep）**，面向人与 AI agent（TypeScript，3.1k⭐）。这正是本项目 Evidence Gateway 里 **`zg`（证据传感器）** 的检索后端实现；`evidence/zg.ts` 用它做 discover/verify，**已克隆到 `vendor/_src/zvec-grep`**。
- `tt-a1i/archify` — 已在用的架构图/可视化插件（报告 L2）。
- `obra/superpowers` / `leonxlnx/taste-skill` — skills 体系/元技能（design 与能力沉淀参考）。
- `addyosmani/agent-skills` — agent skills 汇总。
- `usestrix/strix` — （需查，疑似 agent 相关）。
- `eze-is/web-access` / `browser-use/browser-harness` — 浏览器自动化/CDP（参考实现）。
- `Fission-AI/OpenSpec` / `colbymchenry/codegraph` — 规格/代码图谱（工程化参考）。

**其它（一般技术/工具参考）**
- `asgeirtj/system_prompts_leaks`、`shadcn-ui/ui`、`datalab-to/marker`、`DataExpert-io/data-engineer-handbook`、`harry0703/MoneyPrinterTurbo`、`Z4nzu/hackingtool`、`affaan-m/ECC`、`google/langextract`、`firecrawl/open-lovable`。

> 备注：本表只是"记录 + 粗分"，未逐一核实仓库内容与最新状态；使用时需按 research-before-action 三步核对。

## 补充材料（2026-09-08 用户提供，本轮已逐一核实）

> 用户 2026-09-08 提供的 4 条补充材料。**已联网核实**（GitHub API + 官网文档，抓取时间 2026-09-08 17:12 +08:00），
> 每条给出「是什么 / 值得借鉴什么 / 与 dsh-shadow 的关系」。star 数为抓取当时数值，按 API 原样记录。

### 1. OpenAI《Computer use》工具指南

- 链接：https://developers.openai.com/api/docs/guides/tools-computer-use
- **是什么**：官方讲「让模型操作浏览器/桌面」的集成指南。**不是两条并列路线**：主线是 Responses API 的 `computer` 工具（旧 `computer-use-preview` 仍受支持，但要按迁移指南过渡），实现上有三种 harness 形态——①宿主执行模型给的结构化 UI 动作（hosted `computer` 循环，模型出动作、后端执行后回传截图）②自定义 `function` 工具包一层（Playwright/Selenium/VNC/业务 API，通常是最稳的生产默认）③让模型写短脚本在沙箱里跑（code-execution harness，适合 DOM + 视觉混合流程）。配套讲保持会话状态、把观察回传、以及安全边界。
  > 出处说明：本项目 2026-09-08 研究（§六）读的是官方 `.md` 版并记录了「推荐 + 兼容」这层演进；2026-09-08 复核时 `developers.openai.com` 对本机返回 403，未能二次核对原文，故此处按研究记录 + 第三方镜像（同一指南的三种 harness 表述）校正。
- **值得借鉴**：
  - **安全四条**：①限制环境（隔离浏览器/虚拟机 + 站点与动作白名单）；②**把屏幕内容当不可信**——页面、文档、工具结果里的文字**不能授权、不能覆盖用户指令**；③有后果的动作（付款、外发数据、破坏性变更、把敏感信息填进表单）要用户确认；④给运行设步数/时间/花费上限 + 支持取消 + **看真实结果，不要只信模型自述**。
  - **文档形态**：页面 URL 加 `.md` 即得机器可读版本，另有 `llms.txt` 索引——说明「给 agent 读的文档」值得单独留一个机器可读入口。
  - **状态与观察（原文方向常被写反）**：API 会话状态与执行环境状态是**分开**的——「继续一个 response **不会**恢复浏览器会话、登录态或运行时变量」（原文：*Continuing a response does not restore a browser session, login state, or runtime variables*）；要续接，得把观察结果回传。这条恰好是 `Memory ≠ Evidence`（ADR-0002 / 0044）的**外部正例**，不是「多轮记忆的同构做法」。
- **与 dsh-shadow 的关系**：第②条与读侧「数据非指令」前缀 + `scrubFinal` 同构，可作为护栏写法的**外部权威参照**；第④条「看真实结果」对应本项目的证据裁决 / `verify`。**不引入其代码或依赖**。

### 2. browser-use/browser-use

- 链接：https://github.com/browser-use/browser-use
- **是什么**：让 AI agent 像人一样用浏览器的开源框架（Python，MIT，`🌐 Make websites accessible for AI agents`）。
- **核实**：113,015 ⭐ / 12,468 fork，主语言 Python，最近提交 2026-09-07。
- **值得借鉴（README 写法）**：开头「它能做什么」用**任务描述 + 录屏 + 示例代码链接**，而不是先讲架构；给 agent 用的**一行粘贴式安装提示**（复制进 Claude Code / Codex / Cursor 就能自己装好）；开源库与云服务分开讲清，不让读者猜。
- **与 dsh-shadow 的关系**：浏览器自动化能力的参考实现（同清单里已有 `browser-harness`）。**不引入依赖**。

### 3. heygen-com/hyperframes

- 链接：https://github.com/heygen-com/hyperframes
- **是什么**：把 HTML/CSS/动画渲染成确定性 MP4 的开源框架（TypeScript，Apache-2.0，`Write HTML. Render video. Built for agents.`）。本机已装它的 9 个技能与 CLI，是报告 L3 视频链路。
- **核实**：47,082 ⭐ / 4,362 fork，最近提交 2026-09-08。
- **值得借鉴（README 写法，对 dsh-shadow 最直接）**：
  - 一句话定位 + 一排入口链接（Quickstart / Showcase / Playground / Catalog / Docs）；
  - **「先用 agent」的快速开始**：一条安装命令 + 一句示例提示；
  - **路由器技能 + 领域技能表**：一张表用「**Use when**」列说清「什么情况下用哪个」，比按主题罗列能力更好用；
  - **安装克制**：核心集常驻、其余按需装，并明确「不会在背后偷偷拉全套」。
  - **安装克制要补一个坑**（按本机 hyperframes 技能文档核实）：CLI 的**裸 `skills` 会显式装全量已发布技能集**；走 `npx skills add` 时必须 `--skill <workflow>`（只装一个）或 `--all`（全量），**不给就是「一锅端」**。`skills check` 在技能陈旧/核心集不全时非零退出；刷新要用 `skills update`（`npx skills add` 走 registry，可能滞后）。**且缺件时不许照记忆里的流程往下走**——原文：*Treat a failed update as a visible tool failure; do not continue from a remembered workflow contract*（正是 dsh-shadow「缺件不静默」纪律的外部来源，见 ADR-0049）。
- **与 dsh-shadow 的关系**：dsh-shadow 的读侧同样模式很多（`read_shadow` 的 episode / decision / task / context / query / observation…），目前 README 是**按主题罗列能力**，缺一张「什么情况用哪个模式」的路由表——这是最值得抄的一条。

### 4. mattpocock/skills

- 链接：https://github.com/mattpocock/skills
- **是什么**：作者日常在用的 agent 技能集（Shell + `SKILL.md`，MIT，`Skills for Real Engineers`）。
- **核实**：256,453 ⭐ / 21,605 fork，最近提交 2026-09-04（star 数偏大，按 GitHub API 原样记录）。
- **值得借鉴（README 写法 + 技能组织）**：
  - 正文主干是「**为什么存在**」→ 四类失败模式（#1 没按我要的做 / #2 太啰嗦 / #3 代码跑不起来 / #4 建成一坨泥），每类给「**问题 → 修法 → 对应技能链接**」——先讲痛点再讲能力；
  - **按「谁能调用」分类**：用户显式调用的技能 vs 模型可自动调用的技能，并规定前者可以调后者、后者不能调前者（很清晰的一条权限轴）；
  - `CONTEXT.md`（共享语言）+ ADR 内联更新，与本项目已有 CONTEXT.md / ADR 做法同源；
  - 有专门的 `writing-for-agents` 技能（讲怎么写给 agent 看的文档）。
- **与 dsh-shadow 的关系**：dsh-shadow 的模式里有「用户显式调用」与「提示词里自动使用」的区别，可借这条轴把工具面说清；「为什么存在 → 失败模式 → 修法」的结构可作 README 开头。

### 四条共同点 → 对 dsh-shadow README 的直接结论

1. 开头一句话定位 + 谁该用它；
2. 先讲「解决什么痛点 / 失败模式」，再讲能力清单；
3. **一张「什么情况用哪个」的路由表**（本项目最缺）；
4. 给 agent 的粘贴式快速开始 + 机器可读文档入口；
5. 明确写边界 / 限制 / 安全，而不是只讲能力。

## 补充材料（2026-09-10 用户提供，本轮已核实）

> 用户 2026-09-10 指定补录 `volcengine/OpenViking`。**已核实**：GitHub API（抓取时间 2026-09-10）+ 本机克隆 `G:\project\dsh1\openviking`（HEAD `592c0fe`）的 `README_CN.md` 与 `docs/zh/agent-integrations/16-capability-reference.md`。

### 5. volcengine/OpenViking

- 链接：https://github.com/volcengine/OpenViking ｜ 官网：https://openviking.ai/
- **是什么**：面向 AI 智能体的**开源上下文数据库**（`An Agent-native context database`；仓库自述 `Self-evolving Context Database for AI Agents. Unify Agent Memory, Knowledge RAG and Skills.`）。Python，**AGPLv3**（注意：`crates/ov_cli` 与 `examples` 是 Apache-2.0，主项目是 AGPLv3）。
- **核实**：**36,445** ⭐ / 2,790 fork / 690 open issues；创建 2026-01-05，最近推送 2026-09-10；topics 含 `agent-memory` / `agentic-rag` / `context-database` / **`dsh-plugin`**。
- **核心机制**（README_CN 原文要点）：
  - **`viking://` 虚拟文件系统**——记忆 / 资源 / 技能各有 URI，智能体用 `ls` / `tree` / `find` 浏览自己的上下文，**不查黑盒向量库**；
  - **写入时生成 L0（摘要）/ L1（概览）/ L2（详情）三层**，按需加载；每个目录自带 `.abstract` / `.overview`，读完整文件前就能判断相关性；
  - **目录递归检索**：向量检索先定位得分最高的**目录**，再逐层向下探索；**每次查询保留目录浏览轨迹**，结果不对时能看它出自哪条路径；
  - 会话提交后**异步提取**用户偏好与智能体经验写入长期记忆。
- **一条与本仓 ADR-0050 同向的纪律**：`ov reindex <uri> --mode` 只接受 `vectors_only` / `semantic_and_vectors` / `prune_orphans`，README 明写「**没有 `semantic` 或 `full` 这样的模式别名**」——与本仓「正名硬切、不留兼容别名」是同一取向的**外部正例**。
- **仓库自报评测**（未经本仓复现，按原文记录）：LoCoMo 准确率 OpenClaw 24.20% → 82.08%、Hermes 33.38% → 82.86%、Claude Code 57.21% → 80.32%；输入 token 减少 34.3%–91.0%，查询时延降低 58.45%–66.10%；tau2-bench 任务成功率 Retail +6.87pp、Airline +11.87pp。方法论文 `VikingMem`，arXiv:2605.29640，称已被 VLDB 2026 接收。
- **值得借鉴**：
  - **「读之前先判相关性」的目录级 L0/L1**：把摘要挂在**目录**上而不只挂在文档上，是本项目「分层召回」可以再往前走一步的地方（本仓目前 L0/L1/L2 落在**记忆文件**粒度）。
  - **检索轨迹可观察**：本仓已有 `read_shadow(topic,{debug:true})` 的管线 trace，可对照它「按目录浏览路径」的呈现形态。
  - **无别名的模式命名纪律**（见上）。
  - **`16-capability-reference.md`**：把 9 个 harness 的接入形态逐项列成矩阵（注入位置 / 预算 / 超时 / 提交时机 / subagent 会话 / 关闭方式 / 离线队列），是一份少见的**跨 harness 集成对照**写法，可作本仓文档结构的参照。
- **与 dsh-shadow 的关系（两条要分清）**：
  1. **它是 ADR-0001 的对照项**——本仓当年评估后选择**自建投影文件树**，理由是 OpenViking 需要额外跑 DB/RAG 重服务，对「agent 缺上下文就去翻」这种低成本诉求过重。**本仓已借鉴其思想**：README 明写「借鉴 OpenViking 的 L0/L1/L2 分层思想，但**不引入向量库**」，`retention` 的 hotness 也注明是 OpenViking 式。
  2. **它原生支持 DSH，因而是本项目记忆层的直接替代品**：`examples/dsh-memory-plugin` 是 **Cordis 原生插件**（同进程），`dsh plugin add ./examples/dsh-memory-plugin` 安装，注册 **7 个 `viking_*` 工具**，经 `agent/pre-step` waterfall 注入召回，teardown 时 commit（3s 超时、**无阈值**），并 `ctx.provide("openvikingMemory")` 供其他 Cordis 插件二次开发。其能力对照表记录的两条本仓需要注意的边界：**dsh 不感知 compaction**（注入内容随宿主压缩一起收缩、profile 不重投）；**每个 subagent = 独立 `dsh-<id>` 会话，父子关系不保留**。
- **许可证约束（重要）**：主项目 **AGPLv3**、本仓 **MIT** ⇒ **只可借鉴思想与文档结构，不可复制其代码**（否则触发 copyleft）。本仓既有的「不引入其代码或依赖」口径继续成立。
- **未核实**：其自报评测数字、`Agent Plugins 1.0` 与本机 DSH 的兼容性、`examples/dsh-memory-plugin` 在 **0.1.5-rc.1** 上是否可直接装载——**均未在本机实测**。

## 补充材料（2026-09-11 用户提供，本轮已核实）

> 用户 2026-09-11 指定补录 `lohr13/hl_mem`。**已核实**：GitHub API + 仓库 raw 文档（抓取时间 2026-09-11；star / fork / 提交数按 API 原样记录）。**未在本机克隆、未运行、未试装**。

### 6. ★ lohr13/hl_mem（HL-Mem）—— **用户指定的重点材料；摘要见本文顶部「★ 重点材料」节，决策见 `adr/0073-hl-mem-benchmark.md`**

- 链接：https://github.com/lohr13/hl_mem
- **是什么**：面向 AI Agent 的**证据驱动长期记忆**系统（仓库自述「lohr 的 agent 记忆系统」；`pyproject.toml` 描述 `Evidence-aware local memory service`）。Python 3.12+，**本地优先、SQLite-first 的单机服务**：不拿对话摘要当记忆，而是把不可变 Event 经 LLM 提成结构化 Claim，落 SQLite，再用 FTS5 + 向量混合召回，最后经 REST / MCP / Hermes 适配器交给 agent。README 的定位句写得很明确——**每条记忆都可追溯到原始事件，而不是一段没有来源的模型文本**。
- **核实**：**7** ⭐ / 0 fork / 5 open issues；创建 2026-07-19，最近推送 2026-09-08；最新 release **v1.1.7**（2026-09-08，标题「系统报告回灌修复」）；**Apache-2.0**；主语言 Python；`main` 分支 **983** 次提交，contributors API 只返回 1 人（`lohr13`）；tree 共 **1110** 个条目（含目录）——其中 `docs/superpowers/plans/` 有 20+ 篇完整计划留档、`benchmarks/archive/v030/` 是整段历史归档。
- **核心机制**（README + `docs/architecture.md` 原文要点）：
  - **数据流**：Event 摄入（幂等 `idempotency_key`）→ LLM 提取结构化 Claim → 准入与后处理（证据 / 时间 / 实体）→ SQLite（权威源，WAL + FTS5 + 向量 BLOB）→ 混合召回（FTS/BM25 + Dense）→ RRF / 可选 Reranker → Context Packet（REST / MCP）。
  - **双通道**：① **事实通道** `Event → Atomic Claim → Observation → Mental Model`；② **经验通道** `Episode/Trace → Reward → Policy → Procedure/Skill`。ADR-0001 给的决策理由很直白——「避免把『用户现在喜欢什么』和『上次怎样成功部署』压进同一种记录」。
  - **双时间模型**（valid time / recorded time，召回可 `as_of` 查历史）+ TTL / decay / archive / forget + 反馈驱动维护。
  - **删除完整性**：`forget` 走统一删除闭包 + 独立 tombstone sidecar，**账本先写**；candidate / disputed / expired / open-manual 等歧义状态与账本失败一律 **fail-closed**，MCP 不留一条更宽松的「只撤回状态」旁路。
  - **接口**：CLI（`hlmem remember/recall/list/explain/forget/doctor`）、FastAPI REST、**MCP stdio 7 个工具**（`memory_save` / `memory_recall` / `memory_get` / `memory_correct` / `memory_forget` / `memory_explain` / `memory_feedback`，runtime 直接复用同一份 JSON Schema，避免 transport 与业务契约各自演进）、Hermes Provider。
  - **明确不做的**（README「质量与边界」原文）：不做 PostgreSQL / 外部图数据库 / 分布式 worker / 高可用 / 多租户隔离；`namespace` 只是相关性标签，**不是认证、授权、加密或侧信道边界**；Provider 插件是**受信任的进程内代码，不是安全沙箱**；**真实组件失败时不自动切到 Fake Provider**。
- **值得借鉴**：
  - **`docs/capability-matrix.md`——最值得抄的一张表**：每个特性一行，固定六列 **成熟度（stable / beta / experimental）/ 默认模式 / 是否调外部 API / 是否写数据库 / 降级行为 / 晋级标准**。比本仓现在「按版本记 CHANGELOG」更适合回答「此刻到底是什么状态」；尤其**「晋级标准」明写什么条件下才允许 beta→stable**，与本仓 ADR 的「重新评估条件」同型，但更细、可逐条核对。
  - **「降级行为」是表里的必填列**：逐项写清「超时 / 预算耗尽 / 解析失败 → 只用原始 query」「API 失败不生成 proposal，核心 Claim 写入继续」「verifier 失败 fail-open 并记录错误」「某通道无候选则用其余通道」。与本仓 ADR-0049「缺件不静默」同一取向，且**把降级口径钉在表里**，而不是散落在代码注释里。
  - **ADR 的「被放弃的方案」段**（`docs/adr/0001-core-strategy.md`）：把「直接用 MemOS」「直接用 Hindsight」「双 Provider 并行」「fork 上游大改」四条各自写清「优点是…**放弃原因是**…」，末尾另有**「重新评估条件」**清单（满足任一即新开 ADR 重评）。体裁与本仓 ADR 同源，可作对照范文。
  - **README 结构**：加粗一句话定位 → mermaid 数据流 → 快速开始（三条命令）→ 能力表 → 安装与集成 → 常用配置表 → **质量与边界** → 文档索引；并明写「**README 不复制容易过期的历史分数**」（评测数与协议留在 `evaluation/results/`、`tests/eval/README.md` 索引里）。
  - **`docs/archive/` 分层**：完成的提案 / 历史设计 / 旧 release 记录整体归档，并明写「不代表当前路线图，当前行为以 `architecture.md` + `capability-matrix.md` 为准」。
  - **`docs/archive/research/competitor-comparison.md`**：与 Mem0 / Zep+Graphiti / LangMem / Letta 逐项对照，每行直接给「什么时候选它 / 什么时候选 HL-Mem」——一份现成的同类系统对照写法。
- **与 dsh-shadow 的关系（三条要分清）**：
  1. **同题不同解，且与本仓 ADR-0001 否掉的备选项同类**：ADR-0001 否掉 OpenViking 的理由是「要额外跑一个重服务（DB / RAG）」。HL-Mem 是**同一理由下的第二个样本**——常驻服务（SQLite WAL + FTS5 + 向量 BLOB + 后台 worker），且业务上要求跑 LLM 提取。差别是它**把证据链与生命周期治理放在第一位**（Event 证据、双时间、删除闭包），不是纯向量库。
  2. **一处硬冲突、一条同向**：**硬冲突**是「LLM 负责提取」——本仓的派生原则是**纯函数、不猜字段、LLM 不能制造关系**（ADR-0042 / 0043 / 0051）；**同向**的是「无证据不返回」「删除 fail-closed」「降级必须可见」，可当这几条纪律的外部正例。另外它把「证据」做成**必须回查的 `event/<id>` 链接**，这一点值得与本仓 `evidence` 字段的呈现形态对照。
  3. **许可证**：**Apache-2.0**（本仓 MIT）⇒ 与 OpenViking（AGPLv3）不同，**理论上可复用代码**；但本仓既定口径仍是「只借鉴思想与文档结构，不引依赖」，**本条目不改变该口径**。
- **未核实**：它的评测分数（LongMemEval / MemDaily / PerLTQA）**未在本机复现**；未克隆、未试装，未验证其 MCP 与本机 DSH 0.1.5-rc.2 的兼容性；`docs/superpowers/plans/` 与 `benchmarks/archive/v030/` 只看了路径未逐篇读。

#### 6.1 第二遍深读（`v1.15.37`，决策见 `adr/0076-hl-mem-deep-read-2.md`）

> ADR-0073 是**第一遍**（表层对标）；本轮**深读第二遍**，补齐它`## 自检`里明确留空的几处。
> **仍未克隆、未运行、未试装。**

- **本轮新读的一手文件**（raw，2026-09-11）：
  | 文件 | 0073 状态 | 本轮 |
  |---|---|---|
  | `docs/adr/0004-config-version-deterministic-latest-wins.md`（26 KB） | **完全未提** | ✅ 全文 |
  | `AGENTS.md`（10 KB） | 未提 | ✅ 全文 |
  | `docs/capability-matrix.md` | 只读前段 ~7 KB | ✅ **全文（41 行）** |
  | `evaluation/README.md` / `evaluation/results/README.md` | 未提 | ✅ 全文 |
  | `benchmarks/archive/README.md` | 只看路径 | ✅ **只有这一份**（代码仍未读） |
  | `docs/superpowers/plans/`（22 篇）+ `specs/`（11 篇） | 只看路径 | ⚠ **仍未逐篇读**（仅取路径清单） |
- **最重要发现**：`docs/adr/0004` 是一份**完整的确定性取代协议**，与 `BACKLOG.md` **D3** 直接对题 ——
  坐标是**四元组** `(namespace, canonical_subject, canonical_slot, coordinate_qualifiers)`（不是三元组）；
  六分支关系枚举；**「版本大小不决定时间方向」**；九项前置 + 八条硬否决。
  它**独立支持本仓 ADR-0059**「不把语义裁决交给 LLM」，并**给出数字**：
  E1C 70 案 exact **54/70**、**2 个危险反向**；29 个双序案一致率 **21/29 = 72.4138%**。
- **一条可直接搬的判据**（本仓尚未成文）：**「并存噪音是可观察问题；错误关链是静默破坏」** ——
  与 ADR-0049「缺件不静默」**互补**（一个管缺失可见，一个管破坏保守）。
- **它的失败史（有教育价值）**：v0.30.0 状态实验在同一份 dev 上 **13/13**，独立 held-out-r5 **仅 3/13**
  （27 条错误 edge、3 条反例误 supersede）⇒ 整批撤回，并催生「calibration / 冻结 A / 冻结 B」三层数据
  与「**烧语料前必须先跑零 LLM 缝合线冒烟**」。
- **一处罕见诚实**：其 `evaluation/results/README.md` 公开的 LongMemEval 口径里，
  **自家结构化路径 43/50（86.0%）低于两条对照臂**（full-context 92.0% / native RAG 90.0%）。
  ⇒ **结构化 ≠ 更好**，且它把这件事写在索引里。
- **成熟度定义（0073 漏读的三行）**：`stable` = 默认主路径 + **契约与降级行为受回归测试保护**；
  `beta` = 有安全默认值、仍需更多观察；`experimental` = 显式选择、边界仍可能调整。
  ⚠ 这是**别家的**定义，**不回改 D8**（D8 判的是「本仓无等级口径」，成立）。
- **结构对照**：hl_mem = **4 篇 ADR + 41 行矩阵**（**故意跳过 0003** 以免两决策共号）；
  本仓 = **76 篇 ADR + 18 行表**。0073 说的「补三列」只是该差异的表层。


### 6.2 吸收裁决（v1.15.38，`adr/0077`）—— **哪些真的能吸收，哪些不能**

> 用户 2026-09-12 指令「**能吸收哪些？做**」。下面是逐条裁决，**已做的标注落地处**，**不做的给出判据**。
> 纪律不变：hl_mem 的一切都是「**别家**」，**不得当作本系统的证据**；本轮**仍未克隆、未运行、未试装**。

| hl_mem 的做法 | 裁决 | 落地处 / 判据 |
|---|---|---|
| `lifecycle.py` 的 `assert_transition()`：状态机**单一收口** | ✅ **移植形态** | `test/lifecycle-signal-table.test.ts`（4 组棘轮）。**不照搬位置**：它是**写侧守卫**，而本仓 `lifecycleOf` 是**纯函数**、无可写坏的持久状态 ⇒ 硬加就是**假闸门**（ADR-0042/0043/0051） |
| 「**烧语料前先跑零 LLM 的完整缝合线冒烟**」 | ✅ **已做** | `npm run verify`（工具类型门 + 插件 `tsc --noEmit` + `test:all` = build + **45 项**确定性检查）。**当轮即抓到两处既有失败** |
| **错误方向不对称**（并存噪音可观察 vs 错误关链静默破坏） | ✅ **已做** | `CONTEXT.md`（术语级）+ `adr/0061` 补记（判据级）+ `BACKLOG.md` D3（待决策级） |
| 状态机守卫**写在写侧** | ⛔ 不吸收 | 本仓无持久状态机可守卫；写侧守卫在这里拦不到任何东西（见上行） |
| `historical_predecessor`（乱序到达 ⇒ 只接前驱、不反向关 current tip） | ⏸ **越界** | 属 **D3 决策范围**（是否引入细粒度取代），**用户尚未拍板**；本轮只把它作为 D3 的首要对照材料（`adr/0076` §1） |
| 四元坐标 / 六分支关系枚举 | ⏸ **越界** | 同上（D3）。本仓现行是**单键 `entry` + 时间序**（ADR-0061） |
| 三层冻结语料（calibration / validation A / B）+ held-out 与 dev 分离 | ⏸ **待语料决策** | `BACKLOG.md` **T11①**：本仓语料是**用户自己的真实记忆**，切成 dev/held-out 涉及「在真实语料上调参」的伦理与可比性 ⇒ **那是决策不是实现**。照搬 400 案冻结集**属过度设计** |
| 成熟度等级（`stable`/`beta`/`experimental`） | ⛔ 不吸收 | 0073/0076 已判：引入别家定义＝引入**外来口径**，与 D8「用可核实代理信号」冲突。**只登记为定义样本** |
| LLM 抽取 / 向量库 / 物理删除 / 双时间字段 / resident service | ⛔ 不吸收 | 0073 已逐条否决，**本轮判据不变**（ADR-0059 / 0042 / 0043 / 0051 / 0031） |
| `AGENTS.md` 的「测试运行预算」（最终候选只跑一次核心全套） | ⛔ 不采纳 | 本仓规模小、全量仅数十秒；但它的**存在**解释了「为什么别人不做我们做的这件事」 |
| 「配置来源单一」（只从 `hl_mem.toml` 读，环境变量不参与） | ➖ 不适用 | 本仓读的是**宿主**的 `DSH_PERMISSION_MODE`（ADR-0074），那是**宿主的**约定，不是本仓自造 |

**吸收后的净效果**：本仓第一次有了**一条命令跑完全部确定性检查**；「读一条没人写的状态」在结构上会被报警；
「错误方向不对称」从建议变成成文判据。**代价**：新开 **T12**（时间炸弹 fixture 的风险面只拆了一颗）。

### 6.3 **覆盖率台账（由磁盘枚举生成，不由手写清单生成）** —— v1.15.39 / `adr/0078`

**为什么加这一节**：0073 与 0076 的「未读清单」都是**手写的散文**，于是第三轮（本地克隆后）一核对就发现它**漏了整片**面。
手写清单的两个本质缺陷：① 不完整且**无法自证完整**；② 与「靠自觉不是闸门」同族（本仓 ADR-0049 / 0077 D2 反复记录的形态）。
⇒ 从本轮起，覆盖率**以 `git ls-files` 为基准**。

**基准**：`hl_mem` v1.1.7（HEAD `aa5d068`）= **1025 文件 / 16.03 MB**（`git ls-files`）。

| 面 | 文件 | 字节 | 一手读过？ | 读到的边界 |
|---|---:|---:|---|---|
| `src/hl_mem/state_latest_wins.py` | 1 | 6.5 KB | ✅ **全文** | 取代协议核心（六分支函数） |
| `src/hl_mem/lifecycle.py` | 1 | 4.5 KB | ✅ **全文** | 状态矩阵 + 四个守卫函数 |
| `src/hl_mem/storage/claims.py` | 1 | ~40 KB | ⚠ **只读关键段** | `update_status` / `supersede`（`:160-169`、`:893-931`） |
| `src/hl_mem/application/latest_wins.py` | 1 | 6.5 KB | ✅ **全文** | 应用层接线 + 审计事件 |
| `src/hl_mem/config/models.py` | 1 | ~45 KB | ⚠ **只读 `:500-513`** | 默认模式与 slot 白名单 |
| `src/hl_mem/evaluation/smoke_full_chain.py` | 1 | ~16 KB | ⚠ **只读 `:392-423`** | 13 项检查断言 + 四条 seam |
| `src/hl_mem/evaluation/state_experiment_thresholds.py` | 1 | 3.3 KB | ✅ **全文** | 13 条冻结阈值 + 可满足性审计 |
| `scripts/check_imports.py` | 1 | 4.6 KB | ✅ **全文** | 分层 AST 检查 |
| `docs/benchmark/core-v1.md` | 1 | 2.8 KB | ✅ **全文** | 零网络基准门 |
| `docs/research/p1-extraction-ab-v2-protocol.md` | 1 | 7.5 KB | ⚠ **只读 `:1-42`** | 预注册 + 冻结臂 |
| `src/`（其余 ~344 文件 / 2.41 MB） | 344 | 2.41 MB | ❌ **未读** | —— |
| `tests/` | 384 | 3.17 MB | ⚠ **门禁面已读**（v1.15.43：`tests/eval/` 的 `ci_gate.py` / `gate_check.py` / `README.md` / `relation_chain_holdout_manifest.json` / `test_test_suite_policy.py` / `test_default_zero_model_calls.py` + `conftest.py`）；其余 ~375 个测试体**未读** | 见 `references.md` §6.6 |
| `docs/superpowers/plans/` | 22 | 492 KB | ✅ **全部读完**（子代理，父代理抽查引用） | 撤回台账**不在**此目录 |
| `docs/superpowers/specs/` | 11 | 112 KB | ✅ **全部读完**（子代理） | 取代/生命周期/证据三主题在 `2026-09-01-...completion-design.md` 最集中 |
| `docs/research/` | 7 | 106 KB | ✅ **全部读完**（子代理） | A/B 协议、TTL 评测、回归诊断 |
| `docs/archive/` | 21 | 242 KB | ⚠ **子代理在读，本轮未整合** | —— |
| `docs/*.md` 顶层（除 `capability-matrix.md`） | 13 | 287 KB | ❌ **未读** | 含 `architecture.md`（41 KB） |
| `docs/dev/` + `docs/benchmark/` | 2 | 11 KB | ✅ 读完（子代理） | `patch-points-v0293.md` 与本主题无关 |
| `storage/migrations/` | 69 | 147 KB | ✅ **读完**（子代理，父代理核计数） | 60 `.sql`(001-060) + 9 `.py` |
| `evaluation/` | 67 | 8.15 MB | ⚠ **门禁面已读**（v1.15.43：`scripts/` 11 个 `check_*.py` + 5 个 workflow + `benchmarks/release/` 的协议/比较器/签入 results）；`evaluation/tools/` 其余 **15 个 runner 未读**；**`evaluation/results/` 实测只有 `README.md`（2130 B）** ⇒ 公开分数**无原始结果可核** | 见 `references.md` §6.6 |
| `benchmarks/` | 46 | 512 KB | ⚠ 部分（子代理） | `archive/v030/` 是被撤回批次的归档 |
| `.github/workflows/` | **5** | —— | ✅ **全部读完**（v1.15.43；此前题面误记 ~25 个） | `publish` / `quality-smoke` / `release-gates` / `security` / `test` |

**本轮之后仍未读**（诚实边界）：`src/` 绝大部分（~344 文件）、`tests/` 的 ~375 个测试体（**门禁面已读**）、
`docs/archive/`（21）、`docs/*.md` 顶层（13）、`evaluation/tools/` 其余 15 个 runner、`benchmarks/archive/v030/*`。
**纪律**：本台账的数字来自 `git ls-files` + `Get-ChildItem` 实测；**任何一轮改这张表必须重跑枚举命令**，不得凭记忆改数。
**v1.15.43 回填**：只改「已读/未读」状态与来源指针，**未改任何计数**（文件数与字节数与首版一致，未重跑枚举）。

### 6.4 **MemStrata 论文（2026-09-12 第 3 轮；裁定 `adr/0080`）** —— 并**认领本仓早已引用的「0.59」的原始出处**

**为什么单列**：本仓 `README.md` / `CONTEXT.md` 早就引用过「**余弦相似度分辨「被推翻」vs「换个说法」AUROC 仅 0.59**」
这条数字，但**从未标注它的一手来源**。本轮深读 **MemStrata**（*Temporal Validity in Retrieval Memory*，
`arXiv:2606.26511v1`）后确认：**该数字的原始出处就是这篇**（Table 1：duplicate n=32 均值 0.7998 /
contradict n=22 0.8119 / merge n=22 0.9381 / novel n=22 0.4773；**AUROC 0.5926**）。

**引用级别从「二手数字」升级为「一手可核」**，且拿到了比 AUROC 更强的表述：

> 「The **maximum precision achievable at any duplicate threshold is 0.667**; the **0.95 floor a safe automatic
> rule would need is unreachable**.」

⇒ 这直接否证「**调阈值即可安全自动化取代**」，是 **ADR-0059**（不把语义裁决交给 LLM/相似度）的**不可达性证明**。
**措辞纪律不变**：这是「**别家的读数支持我们的判据**」，**不是**「我们验证了」——其模型、语料、任务与本仓完全不同。

**其余可吸收项**（指标与协议，见 `adr/0080`）：`stale-fact-error rate` + 允许/强制作答**两 regime 同报**；
**marker-free 不变式 + 词边界 tell 自检**（T11①）；**两侧夹逼的消融形态**（G1）。
**边界**：A.1/A.2 表体与 Table 4/5 **未读到**（HTML 截断，尝试路径见 `adr/0080`）；**本版无任何可克隆地址**（双盲）。

### 6.5 **平台 `invariants` 契约实测**（2026-09-12 第 4 轮，T16 第 3 项前置）—— 两问已答，第三问**经实测改判（见 §6.5.1）**

**为什么单列**：`BACKLOG.md` T16 第 3 项把 `ctx.invariants` 列为本仓**唯一**值得吸收的平台服务，但挂了
**两条前置未确认**（(a) 失败是否阻断宿主启动；(b) 选择由谁配置、默认是否执行）。若 (b) 的答案是「默认不跑」，
注册了就是**假闸门**。本轮**回运行体与安装体**逐条查证。

**证据面（三处，互不依赖）**：
| 面 | 路径 | 用途 |
|---|---|---|
| 源码（克隆 0.1.2-alpha.1） | `dsh-w/deepseek-harness/packages/runtime-diagnostics/invariants/src/index.ts` | 读实现与默认值 |
| **安装体**（运行版 0.1.5-rc.2） | `…\pnpm\store\v11\links\@deepseek-ai\dsh-invariants\0.1.5-rc.2\…\lib\index.js` | **核对源码结论和运行体一致** |
| 包文档（同仓 `README.zh.md`） | 同包 `README.zh.md:36,46-53,90,118,153,156` | 官方口径（默认值表 + 失败语义 + 限制） |

**逐条结论（每条带 `文件:行号`）**：

1. **(b) 默认执行 —— 是。**`src/index.ts:96` `enabled: z.boolean().default(true)`；`:115` `config.enabled ?? true`；
   `:120-126` `selected()`：`enabled` 为真、`package_allowlist` 为空 ⇒ **全部接纳**；blocklist 后置排除。
   **安装体 `lib/index.js:45,62,67-70` 与源码逐字同构** ⇒ **版本偏差不影响本项结论**（0.1.2-alpha.1 → 0.1.5-rc.2 未改语义）。
   官方口径同：`README.zh.md:36`「注册表默认启用，并在没有过滤器的情况下检查每个已注册的包」；`:46-50` 默认值表。
   **选择由谁配置**：由**挂载该行的组合**用 `config` 给 —— 实例见安装体 `dsh-sdk-minimal/cordis.patch.yml:103-104`
   （`- id: invariants` / `name: '@deepseek-ai/dsh-invariants'`，**无 config ⇒ 全默认**）。
   过滤器在**服务生命周期内固定**（`:153`），改它要 reload。
2. **(a) 失败不只是 dispose 子 fiber —— 还会让注册方自己的 `apply` 失败。**`src/index.ts:136-197` 的调用链：
   `:149` 先**保留包名**（`registrations.add`，与是否被过滤无关）；`:154-158` 未选中 ⇒ 返回一个**只删保留**的 disposer，
   **不建子 fiber、不跑检查**；`:166-168` 选中 ⇒ `ctx.plugin(installer)` 建**子 fiber**（`inject` 取 `installer.inject`）；
   `:171` `await child` **join 其启动**；`:161-163` `fail()` 的实现是 `throw new InvariantError(...)`；
   `:172-175` 子 fiber 抛错 ⇒ `await child.dispose()` **并 rethrow**；`:184-187` 再删保留并 rethrow。
   该 rethrow 从 `ctx.effect(async …)` 冒出 ⇒ `register()` 返回的 thenable **reject** ⇒
   调用方（`Promise.resolve(ctx.invariants.register(...))`，即**配套入口自己的 `apply`**）**失败**。
   ⇒ **准确表述：失败 → dispose 子 fiber + 回滚保留 + 注册方自身激活失败**。
   官方口径同：`README.zh.md:90`「installer 本身失败的配套入口会被释放，其注册会回滚」；`:118`「失败会释放子级并原子地收回保留」。
   ⚠ **仍未验证的一半**：**是否阻断整个宿主启动**（`dsh web` 是否退出）——这取决于 Loader 对**某一行激活失败**的处置，
   属**运行体实验**（要另起一个 profile 才敢试）。**不得写成已知。**
3. **新查到的、比 (a)(b) 更影响裁决的一条**：**「只挂服务不挂配套入口 == 没有检查」**。
   `README.zh.md:12`「单独加载服务不会安装任何检查」；`:156`（已知限制）「**没有配套入口就没有检查**——注册表自身不携带
   产品检查；只挂载服务的组合观察不到任何行为」。⇒ 即使拿到 registry，**检查是否真的跑，取决于 `register()` 是否被调用**，
   而不是取决于服务在不在。对本仓的含义：**必须在插件体里主动 `register()`**（别人不会替本仓挂配套入口），
   这反而是**有利**的——不需要改宿主组合。
4. ⚠ **【本条已作废 —— 同轮运行时实测推翻，见 §6.5.1】** 原文（保留以留档我的错误）：
   **仍未定位（诚实标注，不猜）**：**运行中的 web 宿主确实有 `invariants` 服务**（`cordis_inspect_query` 宿主
   Service 目录里有该项，描述逐字为「Package-owned invariant registry with global and regex-based selection」），
   但**我没有在它声明的任何一层组合里找到挂载行**。已排除（逐项 grep，见下）：`dsh-base` / `dsh-web-app` /
   `@tt-a1i/archify-dsh` / `dsh-shadow` 的 `cordis.patch.yml`、用户在 `~/.dsh/profiles/web/cordis.patch.yml` 的补丁层、
   随包发布的 4 个 agent preset（`presets/{cordis,minimal,ptc,standard}/*.yml`）、
   以及部署闭包里**任何 `*.js` 对 `dsh-invariants` 的引用**（仅 `package.json` 的依赖声明命中）。
   **唯一含该行的是 `dsh-sdk-minimal/cordis.patch.yml:103-118`，而它不是 web profile 的 bundle。**
   ⇒ **待查**：它挂在**宿主根上下文**还是**会话/`isolate` realm 内**。这一条对本仓是**决定性**的：
   `dsh-shadow` 是 **host-plane bundle 插件**，若服务只在会话 realm 内，`ctx.get('invariants')` 在宿主面**取不到** ⇒
   本仓用不了。**在定位之前，T16 第 3 项不得开工。**
5. **顺带核对（版本偏差面，T16 第 4 项的一个数据点）**：`dsh-invariants` 0.1.5-rc.2 的 `files` 只发布
   `lib/index.js` + `lib/types/**/*.d.ts`（安装体 `package.json:24-27`）——**不含 `lib/invariant.js`**；
   而 0.1.1-rc.x 的安装体**含** `lib/invariant.js`。即该包**自己的空配套入口**在新版里不再随包发布，
   但 `src/invariant.ts` 仍在源码里（`:1-30`）。**这不算缺陷**（其 installer 是空的、`README.zh.md:71` 明说其余包是空配套入口），
   但说明**「每个包都发布 `./invariant`」这条纪律在发布产物上并不统一** ⇒ 引用该纪律时要注明版本。

**本轮新增的枚举纪律（方法层，已复现）**：
> **PowerShell 的 `Get-ChildItem -Recurse` 默认不跟随 junction/symlink。**
> 实测：`…\dsh\0.1.5-rc.2\…\node_modules\@deepseek-ai` 下 **70 个条目里 69 个是 reparse point**；
> 用它做递归 grep 会**静默跳过 69 个包**，得出**看似确凿的 0 命中**。加 `-FollowSymlink` 后同一个搜索
> 立刻命中 `dsh-sdk-minimal/cordis.patch.yml`。
> ⇒ 与 ADR-0074 补记里那次「只 grep 三个包就断言环境变量不存在」是**同一族错误的第二个变体**：
> **不是范围写小了，而是工具静默缩小了范围**。**纪律**：凡以「0 命中」为结论的搜索，
> 必须**先证明枚举到了一个非空且完整的语料**（计数、或同时用第二种工具交叉验证）。

#### 6.5.1 **更正（同轮，实测后）—— 上面第 4 条是错的：`invariants` 并没有被挂载**

> 上面第 4 条写「**运行中的 web 宿主确实有 `invariants` 服务**」，依据是**运行体 Service 目录**。
> 我随后做了一次**运行时读取**，结论被推翻。**第 4 条作废**，本条取代它。

**探测方式**：定义一个**只读**动态 Host 插件，在 `apply(ctx)` 里读 `ctx.get(name)`，把结果以异常送出
（动态插件没有别的即时回传通道；`console.log` **不进** `~/.dsh/dsh-web.stdout.log`——该文件是**旧文件**，
2026-08-20 之后未再写入）。探测代码**不 `JSON.stringify` 任何活对象**，只读 `constructor.name` 这类叶子字段。

**逐名读数（verbatim，两次探测合并）**：
| 名字 | `ctx.get` 结果 | 名字 | `ctx.get` 结果 |
|---|---|---|---|
| `llm` / `tools` / `web` / `sessions` / `agents` | 有 | **`invariants`** | **`undefined`** |
| `jobs` / `storage` / `storageDomain` / `sessionProjections` / `sandboxPolicy` | 有 | `e2b` / `terminal` / `terminals` | `undefined` |
| `subprocess` / `attachments` / `skills` / `goals` / `subagents` / `settings` / `commands` | 有 | **`authorization`** / **`inspector`** | `undefined` |
| `spillStore` / `tokenMeter` / `shellEnv` / `userQuestions` / `codeRuntime` / `sessionTitle` | 有 | `definitelyNotAServiceControl`（对照） | `undefined` |
| `credentials` / `fs` / `shell` / `sessionTelemetry` / `fileReferences` / `directoryPicker` | 有 | | |
| `webServer` / `clientModules` / `typert` / `agentLoop` / `sessionQuery` / `agentDefaultModel` / `agentPresets` / `approval` | 有 | | |

**为什么这组读数能定性**：左列里 `spillStore` / `tokenMeter` / `shellEnv` / `codeRuntime` / `webServer` /
`clientModules` / `sessionTitle` / `sessionQuery` **都是只在宿主 / Web 层 patch 里挂载、任何 agent 预设都不提供的行**
（`dsh-base/cordis.patch.yml`、`dsh-web-app/cordis.patch.yml`）——它们**全都读到了** ⇒
**动态沙箱的 `ctx.get` 读的是全局服务表，不是「本 realm 的表」**（否则这些宿主层服务一个都不该可见）。
⇒ 左列「有」是真的有，右列 `undefined` 是**真的没有**；对照名 `undefined` 说明这不是「什么都返回对象」的假门面。

**于是得到两条新事实（都带反例，不是推断）**：
1. **`@deepseek-ai/dsh-invariants` 在正在运行的 web 部署里没有被挂载**（`ctx.get('invariants') === undefined`）。
   ⇒ **T16 第 3 项的「阻塞项」不成立**：不是「挂在宿主根还是会话 realm」的问题，而是**根本没挂**。
   ⇒ **本仓若照原计划写 `ctx.get('invariants')?.register(...)`，在这个部署里是静默 no-op = 假闸门。**
   要用它必须**同时把挂载行写进部署组合**（`dsh-sdk-minimal/cordis.patch.yml:103-104` 是范本；
   本仓 `cordis.patch.yml` 只有一行 `dsh-shadow`），或退一步在**缺件时响亮报告**（ADR-0049）。
2. **「运行体 Service 目录」不是活性判据 —— 它是「已声明的契约目录」。**
   三条反例：① **`e2b` 在目录里，而 `dsh-e2b` 在本 profile 里根本没有安装**（`Test-Path` = `False`）；
   ② `dsh-invariants` **装了但没挂**（上条）；③ `authorization` / `inspector` 在目录里而 `ctx.get` 均为 `undefined`
   （`inspector` 尤其反直觉：它是 Inspect 自身的宿主侧门面）。
   ⇒ **`cordis_inspect_query` 的 Service 目录可以读「契约原文」，不能判断「运行时在不在」。**
   这与 §6.5 那条枚举纪律**同族但更险**：那条是**范围被工具静默缩小**，这条是**工具回答的不是我问的问题**
   （我拿「契约目录」当「活性表」用）。
   **纪律**：凡结论是「某能力在运行体里有没有」，**唯一判据是运行时读取**（真实插件里的 `ctx.get` 或等效运行时观测），
   **不得**用目录、文档、或「安装包里存在」代替。

**动态沙箱的另两条边界事实（同一次探测得到，供写 Cordis 插件时参考）**：
- **沙箱 ctx 不暴露** `root` / `fiber` / `registry` / `extend` / `plugin`。运行体原话：
  「sandbox ctx does not expose "root". Available: ctx.tools.register / ctx.on / ctx.provide /
  the timer helpers after injecting timer, and any service you declared in inject.
  **Framework internals (root, fiber, registry, extend, plugin, …) are withheld by design.**」
  ⇒ 动态插件**无法**枚举运行时树；判活性只能**逐名 `ctx.get`**。
- **回传通道只有三种**：`console.log`（**不入宿主日志文件**）、`harness.handle`（Client→Host）、
  `harness.registerTool`（模型可见工具）；**抛异常**是最省事的诊断通道（本轮用它）。
  ⚠ **本轮我自己踩了坑**：第二次探测把 promise 链写成**浮动**的（`apply` 没 `await` / `return`），
  产生一个**未处理的 Promise 拒绝**；紧接着宿主进程在 `16:40:02` **被整体重启**（pnpm wrapper 与 node 主进程
  **PID 全新**），本会话动态插件表被清空（`cordis_inspect_self` → `{"mode":"plugins","plugins":[]}`，
  此后 `realm-1` 报「lost on DSH restart」）。**因果未证明**（也可能是一次有意重启），但两条事实成立：
  ① 我写出了一个未被消费的拒绝；② 动态插件定义**不跨进程存活**（文档早已声明）。
  **纪律**：动态插件的 `apply` 里**不得留浮动 promise**。

### 6.6 **hl_mem 测试面/评测门禁的可移植机制**（2026-09-12 第 4 轮，服务 T13 / T14 / T11① / V6）

**为什么单列**：T13（结构门）、T14（确定性基线门）、V6（审计门）此前只有**判据**没有**形状**。
本轮把 hl_mem 的门禁面读完（`scripts/` 11 个 `check_*.py` + 5 个 workflow + `benchmarks/release/` + `tests/eval/`），
得到一份**可照抄的形状清单**。**纪律不变：这是「别家」的机制，不是本系统的证据；也不代表它自己接对了线。**

**最值钱的三件事（按收益排序）**：
1. **「生成器 + 签入产物 + 门禁逐字比对」三件套**，同形复制 6 次，**唯一更新入口是 `--update`/`--write`**
   （`check_openapi_snapshot.py:27,36-42` 的确定性序列化 `sort_keys` + 固定 indent + 尾换行；`check_provider_plugin_api.py:139-144`
   的**缺件即 1** + 失败文案自带更新指引）。⇒ **正对本仓 T13**，且与 ADR-0049「缺件不静默」同源。
2. **allowlist 反向自检**（`check_complexity_budget.py:221-229`：白名单里的路径/函数**不存在也算违规**）
   —— 这条最容易漏、收益最大；配套还有**棘轮只降不升**（`:297-326`）。
3. **协议文件与代码分离 + 先证同源再比数值**（`benchmarks/release/core_v1_protocol.json:1-9` 9 行冻结常量；
   `compare_core_v1.py:28-30` 先校验 `dataset_sha256`/`protocol_sha256`/`case_count` **逐字相等**，
   `:38-41` 容差失败信息同时给**实测退化量与允许量**，`:43-55` 把「外部调用必须为 0」**在比较层再判一次**）。

**它自己没接上的线（照抄形状时不要照抄这些洞）**：
| 洞 | 证据 | 对本仓的含义 |
|---|---|---|
| 比较器 `compare_core_v1.py` **在任何 workflow 里零调用** | 仅 `docs/`、`tests/` 引用 | T14 要**把比较器挂进 `npm run verify`**，不是重写比较器 |
| 「两次运行功能字段逐字相同」**只有散文、无脚本** | `docs/benchmark/core-v1.md:21-22` | T14 后半要**自写双跑逐字比** |
| 同一判据两处数值（覆盖率地板 CI 80 vs 本地 60） | `test.yml:56` vs `pyproject.toml:81` | 本仓 ADR-0063/0070「判据收一处」的现成反例 |
| 缺件即通过（棘轮基线缺失时 `return 0`） | `check_complexity_budget.py:396-400` | 与「缺件不静默」直接冲突 |
| 一个检查脚本**没有任何 workflow 调用** | `check_usage_pricing_schema.py` | —— |

**T13/T14/V6 的落点（已写进 `BACKLOG.md` 对应条目）**：T13 = `check_imports.py:12-19`（分层禁令表）
+ `check_complexity_budget.py:25-27,221-229`（预算 + 白名单腐化自检）；T14 = 协议 JSON + 比较器 + **签入 `results/*.json`**
+ **双跑逐字比**；V6 = 退出码用**合取式**表达（`run_extraction_quality_smoke.py:255-257`
「全通过 ∧ 恰好 1 次外部调用 ∧ 保留 ≤16」）。

## 补充材料（2026-09-14 用户提供，本轮已核实）

> 用户 2026-09-14 指定补录三条：`rtk-ai/rtk`（**新**）、`google/langextract`（清单里已有裸 URL，**此前无核实段**）、
> `heygen-com/hyperframes`（**§3 已完整登记**）。
> **已核实**：GitHub API + 原始 raw 文件，抓取 **2026-09-14 09:13 +08:00**。
> **可重放**：`node ..\.docs\fix\2026-09-14\fetch-references-meta.ts`（元数据）与 `dump-readmes.ts`
> （README 原文落盘，产物见同目录 `readme-*.md`）；怎么跑写在两个文件头的注释里。
> **口径**：同一条材料**只在一处完整登记** —— 重复指定**不重写旧段**，只在**新日期段**里补核实或刷新读数（§8 = 补核实，§9 = 只刷新）。

### 7. rtk-ai/rtk（RTK — Rust Token Killer）— **新**

- 链接：https://github.com/rtk-ai/rtk ｜ 官网：https://www.rtk-ai.app
- **是什么**：把 shell 命令输出**在到达 LLM 上下文之前**做过滤与压缩的 CLI 代理（仓库自述
  `CLI proxy that reduces LLM token consumption by 60-90% on common dev commands. Single Rust binary, zero dependencies`）。
  单一 Rust 二进制、零依赖、README 自报 <10ms 开销。安装面：Homebrew（`brew install rtk`）、
  **Windows：`winget install rtk-ai.rtk`**、`cargo install --git …`、`install.sh`。
- **核实**（GitHub API，抓取 2026-09-14 09:13 +08:00）：**80,196** ⭐ / 5,079 fork / **1,733** open issues；
  创建 2026-01-22、最近推送 2026-09-13；**Apache-2.0**；默认分支 **`develop`**（不是 `main`）；
  最新 release 是 `dev-0.50.0-rc.*`（同日多个 RC），稳定 tag 到 **v0.49.0**；
  topics 含 `token-optimization` / `agentic-coding` / `claude-code` / `cost-reduction`。
- **核心机制**：`rtk init --global` 装一个**命令改写 hook**（README 以 Claude Code 为例：`git status` → `rtk git status`），
  结果送进四种策略 —— **智能过滤**（去注释 / 空白 / 样板）、**分组**（按目录 / 规则聚合）、
  **截断**（保相关上下文）、**去重**（重复日志行折叠计数）。覆盖面：`ls/read/find/grep` ·
  `git status/log/diff/push` · `pytest/go test/vitest/jest` · `lint/tsc/cargo build/ruff` ·
  `docker ps/logs` · `kubectl pods`。另有两条分析命令：**`rtk gain`**（节省统计，可 `--graph`）与
  **`rtk discover`**（发现遗漏的节省机会）。
- **值得借鉴（本条最有价值的不是压缩算法，而是它的自曝口径）**：README 把自己的头条数字**当场切开量纲** ——
  「削减**多达 90% 的 bash 输出**」紧接一句「**这正是 RTK 所测量的指标，它与「账单降低 90%」不是一回事**」；
  并继续说明：bash 输出只是**输入 token 的来源之一**（还有提示词 / 系统提示词 / 对话历史），
  输入 token 又**只是账单的一部分**（还有输出 token），「削减效果在每一步都会被稀释」；
  且「token 数量按 `字节数 / 4` 估算：RTK 不内置分词器，因此**百分比是可靠的，但 token 绝对数值只是近似值**」。
  ⇒ 这与本仓 **ADR-0072**（台账「实测」标签比事实强 —— **标签不得强于事实**）是同一纪律的外部样本；
  它比本仓更狠之处是：**连自己产品的头条数字都当场限定口径**。可作材料核实记录的对照范文。
- **另一条**：`rtk discover`「主动找还没省的地方」与本仓 `tools/audit-drift.ts` / `tools/audit-wiring.ts`
  （**造工具去发现缺口**，而不是等人来报）同族，且它把这个能力做成了**用户可见的一等命令**。
- **与 dsh-shadow 的关系（三条要分清）**：
  1. **互补，不是替代**：本仓的 token 预算是**记忆侧**（`tierFor`/`renderByTier` 的 L0/L1/L2 分层渲染、
     `max_tokens`、`recall.cooldownTurns` 冷热淘汰）；RTK 削的是**工具输出侧**。**本仓现在没有工具输出压缩这一层** ——
     证据：刚落盘的一条记忆正文只有 `- [09:11:18] [pwsh] 调用 pwsh` 这类**动作行，不含命令输出**。
  2. **它是工具台账的候选 `kind:"reference"` 条目**（通用 CLI 目录，不影响插件行为），且**恰好满足台账格式**
     （Windows 有精确 winget 包 ID `rtk-ai.rtk`）。**但入台账必须走 ADR-0058 的纪律**：**包 ID 由人裁决、机器只核验**
     （按名字自动解析已被实测证伪）；台账硬边界仍在 —— **装完本会话不可见**（宿主 PATH 是启动时快照）
     ⇒ **不能按「先装再派」做计划**。**本条目只是登记，不代替那个裁决。**
  3. **一条边界要先想清楚再采**：RTK 靠**改写命令**介入执行路径（hook 层）。本仓取向是**不代装 / 不扩执行范围**
     （inv 178–182、ADR-0049）；采它意味着在**宿主 / 预设层**接线，属**外部环境决策**，不在本仓代码面内。
- **未核实**：**未装、未跑、未复现 90%**；未核实其 hook **是否支持 DSH**（README 只举 Claude Code）；
  未核实 winget 包 `rtk-ai.rtk` 在**本机**是否可解析（此处只记录仓库 README 自述）。

### 8. google/langextract —— **注册补全（此前只有清单里一个裸 URL，无核实段）**

- 链接：https://github.com/google/langextract ｜ PyPI：https://pypi.org/project/langextract/
  ｜ demo：https://google-langextract.hf.space/
- **是什么**：用 LLM 从非结构化文本里抽结构化信息的 Python 库（自述 `extracting structured information from
  unstructured text using LLMs with precise source grounding and interactive visualization`）。Apache-2.0；有 Zenodo DOI。
- **核实**（GitHub API，抓取 2026-09-14 09:13 +08:00）：**38,577** ⭐ / 2,705 fork / 124 open issues；
  创建 2025-07-08、最近推送 2026-09-13；最新 release **v1.7.0**（2026-09-13）。
- **核心机制**：**Precise Source Grounding** —— 每个抽取结果都映射到原文的**精确字符区间**（`char_interval`），
  可视化时据此在原文里高亮。长文走「切块 + 并行 + 多轮」提高召回。
- **值得借鉴（与本仓证据门同族，且把「指不回去」处理得比一般实现诚实）**：README 明写一个已知失效模式 ——
  **LLM 有时会从 few-shot 示例里抄内容，而不是从输入文本里抽**；它的处理是**自动检测**：
  定位不到原文的抽取项，其 `char_interval = None`，并给出用法 `[e for e in result.extractions if e.char_interval]`
  **只保留 grounded 的结果**。
  ⇒ 这正是本仓「**无证据不返回**」（Evidence 门 / ADR-0044）的 **LLM 侧对应实现**：
  **不让模型保证，而让产出可复算** —— 指不回原文的一律降级为 `None`，而不是当成事实。
  差别在对象：本仓的 Evidence Gateway 判**路径是否存在**，它判**抽取片段是否真落在原文的字符区间内**；
  两者同族（**可复算的存在性**）。
- **另一条**：few-shot 示例不逐字会触发 **`Prompt alignment` 警告（默认出声，需主动清理）** ——
  又一例「默认不静默」（ADR-0049 同向）。
- **与本仓的硬冲突（必须先记）**：它的整条写入路径**就是 LLM 抽取**；本仓铁律是**纯函数派生、不猜字段、
  LLM 不能制造关系**（ADR-0042 / 0043 / 0051）⇒ **只取「grounding 可复算」这个判据形态，不取它的抽取路径**
  （与 `adr/0073` 对 hl_mem 的处置同型）。
- **未核实**：未装、未跑；`char_interval` 在**中文 / 多语言**上的定位质量未验；「多轮提高召回」的调用量代价未读细节。

### 9. heygen-com/hyperframes —— **§3 已完整登记（2026-09-08）；本条只刷新读数，不重复事实**

- 链接：https://github.com/heygen-com/hyperframes
- **不重复登记**：是什么 / README 写法与安装坑 / 与本仓的关系，**全部见 §3**（一处事实只在一处）。
- **本条只做一件事：刷新读数**（抓取 2026-09-14 09:13 +08:00）——**49,604** ⭐ / 4,532 fork
  （§3 记录时为 47,082 / 4,362）；最近推送 **2026-09-14**；最新 release **v0.8.37**（2026-09-13）；
  许可仍 **Apache-2.0**；仓库体积 417,703 KB（约 408 MB）。
- **本机状态**：已装（9 个技能 + CLI），是报告 L3 视频链路 —— 该用途与 §3 记录一致，**未变化**。

## 补充材料（2026-09-15 用户提供，本轮已核实）

> 用户 2026-09-15 指定补录一条：`Vincentwei1021/video-shotcraft`（**新**）。
> **已核实**：GitHub API + 原始 raw 文件 + `tree?recursive=1`**逐目录计数**，抓取 **2026-09-15 12:22 +08:00**。
> **可重放**（都在 `..\.docs\fix\2026-09-15\`，怎么跑写在各文件头注释里）：
> `fetch-references-meta.ts`（元数据 + README 前 6000 字，产物 `raw-video-shotcraft.txt`）、
> `dump-video-shotcraft-docs.ts`（原文落盘：`readme-video-shotcraft.md` / `readme-video-shotcraft-zh.md` /
> `skill-video-shotcraft.md` / `plugin-manifest-video-shotcraft.json` / `tree-video-shotcraft.txt`）、
> `count-video-shotcraft.ts`（**不采信自报计数，从 tree 逐目录数**，产物 `counts-video-shotcraft.txt`）、
> `extra-video-shotcraft.txt`（`agents/openai.yaml` + `references/final-review.md` 原文）。
> **口径**：同一条材料**只在一处完整登记** —— 重复指定**不重写旧段**，只在**新日期段**里补核实或刷新读数。

### 13. Vincentwei1021/video-shotcraft —— **新**（agent skill 工程样本，不是记忆材料）

- 链接：https://github.com/Vincentwei1021/video-shotcraft ｜ 在线 Gallery：https://vincentwei1021.github.io/video-shotcraft/
  ｜ 姊妹仓库（口播版，2026-08 新开）：https://github.com/Vincentwei1021/video-talkcraft
- **是什么**：把 Claude Code / Codex 变成「动效工作室」的 **agent skill** —— 用 [Remotion](https://www.remotion.dev/)
  把前端项目 / 网页做成电影感产品宣传片（真实页面截图 + 2.5D 运镜 + 节奏卡点 + 声音设计）。TypeScript，**Apache-2.0**；
  自述 `An agent skill for crafting cinematic product videos: 157 shot recipe cards · 214 styles · 214 motion previews ·
  a production-ready template`。安装面：`npx skills add Vincentwei1021/video-shotcraft`，或 `git clone` 后软链进
  `~/.claude/skills/` 或 `~/.codex/skills/`。仓库另有 AtomGit 镜像与 Trendshift 收录徽章。
- **核实**（GitHub API + recursive tree，抓取 2026-09-15 12:22 +08:00）：**8,578** ⭐ / 775 fork / **4** open issues；
  创建 2026-07-19、最近推送 2026-09-09；默认分支 `main`；仓库体积 **188,979 KB**（≈184.5 MB，API 口径）；
  `tree?recursive=1` 读到 **truncated=false / 1,211 条 / 970 个 blob**，blob 字节和 **54,479,346**（≈52.0 MB）；
  **无 semver tag**，只有两个媒体素材 release（`gallery-media` 2026-07-26 / `showcase-media` 2026-09-01）；
  topics 含 `agent-skills` / `claude-code-skills` / `claude-skills` / `codex` / `remotion` / `motion-graphics` / `video-generation`。
  **逐目录计数（不采信自报数）**：`references/shots/**/*.md` = **157**（自报 157 ✅；一级目录 11 个 = **10 个功能类别**
  `camera data effects interaction opening outro rhythm transition typography ui-entrance` + `ATTRIBUTION.md`）；
  `demos/**/*.tsx` = **221**、`demos/<类别>/<卡名>/` 目录 **158**；`assets/audio/sfx/**` = **149** 分 **16** 类、
  `assets/audio/bgm/**` = **5**；`template/**` 60 · `workbench/**` 59 · `gallery/**` 238 · `assets/lib/**` 12。
- **一处读数分层（不判谁错，先分层）**：同一材料里有两套计数 —— README 标题与 `SKILL.md` 写 **157 卡 / 214 样片**，
  而「2026-08 · 新增 48 张」的归档条目与 **GitHub 仓库 description** 写 **152 卡 / 209 样片**。
  按本仓 `AGENTS.md`「历史文档 vs 当前态文档」的口径分层：**归档条目里的 152/209 是当时事实（合法，不改）**；
  而 **description 是当前态表面，未随卡库一并刷新**（落后 5 卡 / 5 样片）。**我未核实 description 的最近修改时间**，故只记现象。
- **核心机制**：三层结构 ——
  ① **契约层 `SKILL.md`**：调用时**先判三种模式**（直接使用模板 / 自主自由创作 / 共同创作；已选定时不重复询问、不改成另一种），
  再用一张「**何时读哪个文件**」表把读取面指向 `references/`；
  ② **方法论层 `references/`**：`pipeline.md` 六阶段流水线 · `shots/` **157 张镜头配方卡**（用途/能量/建议时长/参数/
  实现要点/**已知坑**）· `sequences/` 桥段模板 · `aesthetic-rules.md`（视觉 QA 准则）/ `music-beat-sync.md` /
  `sound-design.md` / `final-review.md`（独立终检清单）/ `workbench.md`（成片接入契约）；
  ③ **产物层**：`demos/` 每卡一份**调校过的 TSX**（缓动与时值参数真相）· `template/`（36.2 秒 / 1920×1080 / 30fps /
  10 镜头，`npm install && npx remotion render`）· `assets/{lib,audio,scripts}`（`assets/lib/` 主张 **copy 进新项目再改，
  不 import 本库**）· `workbench/`（交付后开的浏览器时间线编辑器，5198 端口，预览与渲染**逐帧像素一致**）·
  `jianying-export/`（剪映工程导出：Mac 11.2 实测，**Windows 自陈未真机验证**）。
- **值得借鉴（四条，按对本仓的价值排序）**：
  1. ⭐ **「测量对象必须是最终产物」**：`references/final-review.md` 的 A6 明写 —— 每条 SFX 要查「在**渲染产物**里是否真的
     听得见（**不看预览** —— 预览把 volume 钳到 1.0）」。这与本仓 `MATERIALS.md` §6 的五级链（**工件存在 ≠ 已安装 ≠
     已装载 ≠ 在跑 ≠ 可用 ≠ 已验证**）与「**凡『某能力在运行体里有没有』，唯一判据是运行时读取**」是**同一判据在另一个
     领域的实例**：中间态的展示层（预览 / 目录 / 安装包）会给出乐观假象，判据必须落在最终产物上。**这是本次登记最值钱的一条。**
  2. ⭐ **独立终检的三条硬约束**（`final-review.md` 头部）：审查 agent「**必须处于干净上下文**，不参与制作；**不要给它
     制作过程中的理由、辩解、修改历史或预期结论**」；「**缺少某项输入时标记『无法验证』，不要自行猜测制作基准**」；
     「索引、卡片文档、demo 源码与 Gallery 参考样片**互相冲突时，明确报告冲突来源，不自行挑一个当真相**」。
     三条分别对应本仓：派**干净上下文**审查者（用户级规则 `moe-subagent-dispatch` 的「自我审查天然有盲区，自己的错自己看不见」）、
     **ADR-0049 缺件不静默**、以及「**不猜字段**」（ADR-0042 / 0043 / 0051）。
  3. **两条纪律的外部正例**：① **「质量标准只升不降」的棘轮** —— 「允许适配性改动，但卡上『已知坑/命门』标注的参数
     **不得降档**」，对应本仓 `audit:ratchet`；② **确定性** —— 禁 `Date.now()` / `Math.random()`，伪随机固定种子
     （mulberry32 / 哈希，seed 从 index 派生）**逐帧可复现**，且仓库根 `npm test` 就断言这些纯函数的确定性，
     对应本仓「纯函数派生、可重建」（ADR-0042 / 0043）与确定性基准门（T14 / ADR-0078）。
  4. **一处粒度不同的路由表**：`SKILL.md` 的「何时读哪个文件」是**阶段 → 读哪个文件**（文件级）；本仓对应物是
     README「什么情况用哪个（模式路由表）」（**任务 → 用哪个 mode**，能力级，v1.12.3 已落地）与 `AGENTS.md` 的
     「每份文档 owned by 什么」。⇒ **本仓不缺这张表，本条只作外部样本，不构成待办。**
- **与 dsh-shadow 的关系（三条要分清）**：
  1. **不同题**：本仓管「记忆 / 上下文投影」，它管「创意视频制作」；既不是本仓的替代品，也不喂本仓的任何 ADR。
     它的价值是**「agent skill 工程」的对照样本** —— 本仓自己也是 skill / 预设双形态（`agent-presets/projection` +
     DSH bundle 插件）。它的「卡片（语义）↔ demo 源码（调校真相）」对应关系与本仓同向：它明写「凭卡名和理解新写＝
     **放弃全部调校积累**」，正是本仓**资源卡必须写 `source` 才上投影**（ADR-0051 证据门）与「每条断言带
     `文件:行号`」的同一取向 —— **判据要能回查到实现**。
  2. **对本工作区的实质用途**：它是在用的 hyperframes（报告 L3 视频链路）之外的**第二条视频路线**，且**技术栈不同** ——
     hyperframes 走 HTML/CSS 时间线 → 确定性 MP4；它走 **React/Remotion 组件 + 镜头配方卡**，并附 **149 个 SFX /
     5 个 BGM / 216 个 demo 动效 / 成片后浏览器工作台 / 剪映工程导出**。**它只声明 Claude Code 与 Codex 两个宿主，
     不提供 DSH 插件或预设形态**；要落到本机需另判（见「未核实」）。**本条只登记，不代替那个裁决。**
  3. **许可证要先分清两层**（与 OpenViking 的 AGPL 记号同型）：**仓库本体 Apache-2.0**，但它的渲染引擎 **Remotion
     有自己的许可**（README 自陈「个人与小团队免费、公司可能需要付费」）⇒ **「仓库许可允许」≠「整条链路可商用」**。
     另外它自陈多数配方卡是**研究官方产品片（ClickUp / Perplexity / Slack / Notion / Figma / Framer / Bear / Raycast /
     Pitch / Miro / Superhuman / Loom 等）的运动语言后重写**的，仓库不含任何原片素材与品牌资产，逐批来源记在
     `references/shots/ATTRIBUTION.md` —— 这条**取材与署名的处理方式**本身可作本仓「引外部材料必须写来源」的对照。
- **未核实**：**未克隆、未安装、未渲染**（本机没跑过 Remotion）；**未验证**它能否以 `~/.agents/skills/`（本机 DSH 技能目录）
  或 DSH 预设形态装载 —— 它只声明 Claude Code / Codex 两个宿主（`.claude-plugin/plugin.json` 的 `skills: "./"`，
  `agents/openai.yaml` 是 Codex 的 UI 元数据，其注释写明「由 Codex harness 读取，不是给 agent 读的；
  Claude Code 读的是 SKILL.md frontmatter」）；**214 条动态样片未逐条核对**（样片是生成的媒体，tree 里数不出来，
  我只核到 157 张卡 / 221 个 TSX / 158 个卡目录）；38 秒 Gallery 介绍片与 Ink Press 模板**未播放核对**；
  `jianying-export/windows_draft.py` 仓库自陈**未真机验证**。

## 补充材料（2026-09-16 用户提供，本轮已核实）

> 用户 2026-09-16 指定补录一条：`openclaw/openclaw`（**新**）。
> **已核实**：GitHub API + 原始 raw 文件（README 按关键词抽行 / `LICENSE` 全文 / `CHANGELOG.md` 首页 / `package.json` 前 60 行），
> 抓取 **2026-09-16 10:52 +08:00**。
> **可重放**（都在 `..\.docs\fix\2026-09-16\`，怎么跑写在各文件头注释里）：
> `fetch-references-meta.ts`（元数据 + README 前 6000 字，产物 `raw-openclaw.txt`）、
> `probe-openclaw-keywords.ts`（README 按关键词抽行 + LICENSE 全文 + CHANGELOG/package.json，产物 `keywords-openclaw.txt`）。
> **口径**：同一条材料**只在一处完整登记** —— 重复指定**不重写旧段**，只在**新日期段**里补核实或刷新读数。
> 编号说明：2026-09-15 的两个分析块已占用 §14 / §15，故本条为 **§16**。

### 16. openclaw/openclaw（OpenClaw 🦞）—— **新**（多渠道个人助理网关，**不是记忆材料**）

- 链接：https://github.com/openclaw/openclaw ｜ 官网 https://openclaw.ai ｜ 文档 https://docs.openclaw.ai
  ｜ 基金会 https://openclaw.org ｜ 插件市场 ClawHub https://clawhub.ai ｜ npm 包名 `openclaw`（`bin` = `openclaw.mjs`）
- **是什么**：跑在**你自己的电脑与设备上**、并**在你已经在用的聊天渠道里**出现的开源 AI 助理 ——
  Discord / iMessage / Slack / Teams / Telegram / WhatsApp 及另外 20 多个渠道，外加 macOS / iOS / Android /
  Windows / Linux 原生应用。一个 **Gateway** 既能当个人助理也能当团队部署，README 明写「**差别只在配置**」。
  仓库自述 `The AI that really does things. Any OS. Any Platform. The lobster way. 🦞`；
  `package.json` 的 description 写 `Multi-channel AI gateway with extensible messaging integrations`。
- **核实**（GitHub API + raw，抓取 2026-09-16 10:52 +08:00）：**389,802** ⭐ / **81,934** fork / **7,471** open issues /
  1,744 subscribers；创建 **2025-11-24**、最近推送 **2026-09-16**（抓取前几分钟）；默认分支 `main`；未归档；
  API 口径体积 **4,875,713 KB**（≈4.65 GB）；topics = `ai, assistant, crustacean, molty, openclaw, own-your-data, personal`；
  **无 Discussions、无 Wiki**（社区只在 Discord）。版本口径是 **CalVer** 而非 semver：`package.json` = **2026.9.4**，
  release `v2026.9.4`（2026-09-11）/ `v2026.6.35`（2026-09-10）/ `v2026.9.3`（2026-09-08），tag 同形（含 `v2026.9.1-beta.1`）。
- **许可（一处读数分层：先分层，不判谁错）**：`LICENSE` 原文 = **标准 MIT 正文**（`Copyright (c) 2026 OpenClaw Foundation`）
  **末尾多两句**「第三方通告记在 `THIRD_PARTY_NOTICES.md`」；`package.json` 的 `license` 字段 = `MIT`；
  README 徽章与其末行也写 MIT；而 **GitHub API 的 `spdx_id` = `NOASSERTION`（name=Other）**。
  ⇒ 按本仓口径记：**API 的 SPDX 判定 ≠ 许可原文**，原文与 `package.json` 一致指向 MIT（**NOASSERTION 的成因未证，
  只记现象：原文不是逐字标准 MIT**）。同时沿用 `adr/0073` 那句 —— **「许可允许」≠「该引」**。
- **架构与形态（均为 README 自述面）**：**Gateway = 本地控制面**（sessions / tools / events / 渠道连接），
  由 **Control UI / CLI / TUI** 接入；**Channels** 把助理接到各消息渠道；**companion apps / nodes** 提供语音、
  Canvas、摄像头、屏幕与设备本地动作。模型 provider 托管与本地都有；能力扩展面是 **tools / skills / plugins**，
  README 明写「**新能力通常应做成插件（plugin SDK）**」。安装面：`install.sh` / `install.ps1` 一键脚本
  （自陈会按需准备 Node 运行时），或 `npm install -g openclaw@latest --allow-scripts=openclaw`
  （**Node 24.16+ 或 26.1+，推荐 26**）；上手三步 `openclaw onboard --install-daemon` → `openclaw gateway status`
  → `openclaw dashboard`。另据 `package.json`，它把状态与 agent 的 **schema 版本**写成顶层声明
  （`openclaw.schemaVersions = { state: 17, agent: 20 }`）—— **只记形态**（版本类事实要有唯一声明点，与本仓
  `audit:docs` 检查①「三方版本一致」同向），**不作比较结论**。
- **治理**（README 末段）：由 **OpenClaw Foundation**（独立 **501(c)(3)**）主持，基金会**雇用核心团队并签署发布**；
  资助方含 Amazon、Lobster Computer Company、Offline Holdings、**OpenAI**、Red Hat、University of Michigan，
  基础设施支持含 Blacksmith、Convex、GitHub、NVIDIA、Vercel；并明写「**没有任何资助方拥有或指挥本项目；
  OpenAI 是捐赠者，不是所有者**」，且**无付费层、无托管服务、无代币**。
- **值得借鉴（四条，按对本仓的价值排序）**：
  1. ⭐ **「默认安静」也要把口径写成可核的**：README 那段是本条目最值钱的一处 —— 先把资产归属说清
     （「状态、记忆与凭据都在你的硬件上」「模型与 agent harness（Claude / Codex / 本地模型）都是**可换的插件**」），
     紧接着**把默认外发逐项切开**：默认只做每日版本检查、匿名特性统计是 **opt-in**、
     `update.checkOnStart: false` **把两者一起关掉**，并给出「OpenClaw 发什么」的专门文档页。
     ⇒ 与本仓 **v1.15.91 的「省略披露开关」（`adr/0092`）** 与 **ADR-0049「缺件不静默」** 同族：
     **默认行为必须有一处可读、且带关断开关的口径**。差别只在方向 —— 本仓披露「我漏了什么」，它披露「我发了什么」；
     **共同点是都把「默认」当成需要交代的事实，而不是可以省掉的细节。**
  2. **未受信输入 + 默认配对**：README 安全一节的**第一句**就是「**把入站消息当成未受信输入**」，
     且 DM 类渠道**默认对未知发送者要求配对**（`openclaw pairing approve <channel> <code>`）。
     ⇒ 与本仓 **「记忆数据非指令」**（`read_shadow` 输出头的护栏提示）是**同一判据在另一个位置**：
     **内容进得了门，不等于它有指挥权**。它的实现更硬（配对码 + 显式 approve），本仓是提示 + 契约 ——
     可作「同族但更强」的样本。
  3. **可信 / 不可信 / 确定性 三分**：README 把架构说明概括为
     `trusted gateway, untrusted execution, deterministic policy`。本仓对应物是 **ADR-0043 Shadow Contract**
     的 source（谁写、可否删）与 projection（系统派生、可重建）分层，以及 `inv 178–182`（**不代装、不扩执行范围**）。
     ⇒ **只作对照，不构成待办。**
  4. **长台账的「索引页 + 每版一文件」**：它的 `CHANGELOG.md` 只是索引页（带 `<!-- openclaw:split-changelog -->`），
     每条版本一文件放 `CHANGELOG/<版本>.md`，索引行给 `Raw` 直链。本仓 `CHANGELOG.md` 是**单文件 625 KB**，
     `AGENTS.md` 为此专立「改长文档四条规矩」，并记了两次「插入新条目时删掉上一条标题」的事故。
     ⇒ 这是本仓那条规矩的**外部对照样本**：**索引页可以单独扫，正文按版本取**。**只记形态，不构成待办。**
- **与 dsh-shadow 的关系（三条要分清）**：
  1. **不同题**：本仓管「记忆 / 上下文投影」（库内、纯函数派生、无常驻服务）；它管「**多渠道个人助理网关**」
     （常驻 Gateway + 渠道 + 设备端应用）。**不是本仓的替代品，也不喂本仓任何 ADR** ——
     本条目性质 = **登记备查 + 取上面四条形态对照**，**不含吸收裁决**（要与 `adr/0073` / `adr/0087` 那种
     「吸收 / 不吸收」的条目区分开）。
  2. **一条硬边界（先记住）**：它是**常驻服务 + 网关 + 设备侧执行**（`Dockerfile` / `docker-compose.yml` /
     `fly.toml` / `render.yaml` / `deploy/` 都在仓库根）。本仓 **ADR-0001 否决常驻服务**、
     ADR-0043 / 0060 否决向量库 ⇒ **形态层面不可移植**；能取的是**判据与披露口径**，不是它的架构件。
  3. **一处容易误判的相似**：它也有 `skills/`、`extensions/`、`plugins` 与插件 SDK，看上去与 DSH 的 Cordis 插件 /
     预设同生态 —— 但**它不为 DSH 提供宿主形态**（没有 DSH 插件，也没有 agent-preset）。要落到本机就是
     **另装一个宿主**，属**外部环境决策**，**不在本仓代码面内**。**本条只登记，不代替那个裁决。**
- **未核实**：**未克隆、未安装、未运行**（本机没装 openclaw，也没跑过它的 Gateway）；
  **未读文档全文**（`security` / `exposure-runbook` / `sandboxing` / `telemetry` 四页只按 README 链接登记）；
  **未核「曾用名」** —— topics 里有 `molty` / `crustacean`、README 贡献者名单里出现过 `moltbot886` 这样的用户名，
  **这只是现象，不构成改名史的证据**；**未拆解 4.65 GB 的体积构成**（不知道含不含 `node_modules` / 媒体资产）；
  **未读 `.agents/` 与 `custodian-skills/` 的内容** —— 只从 root tree 读到目录名（它把 agent 工作约定
  `AGENTS.md` / `CLAUDE.md` 与给 agent 用的技能**一起纳入仓库版本控制**，与本工作区 `~/.agents` + skills 同形
  但**随仓库走**；**内容未读，故不评价**）；389,802 ⭐ 只是**单一读数快照**，**不构成生态评价**。

## 落地核实（2026-09-16 第 2 轮 —— 用户「遗留 1 2 3」的 1：真落地 + 把 §16 的「未核实」读掉）

> 用户 2026-09-16 续指令「遗留 的 1 2 3」= ① 真落地（克隆 + 读掉 §16 未核实的文档）② 写记忆侧资源卡 ③（上一轮已完成）；
> **中途追加裁剪指令「不用跑起来 openclaw 只要代码」** ⇒ 只克隆源码，**不安装、不构建、不运行**。
> **口径**：本节**不改 §16 正文**（承本文一贯口径：重复指定不重写旧段，只在新日期段里补核实或刷新读数）。
> **可重放**（都在 `..\.docs\fix\2026-09-16\`，入口 = 同目录 `INDEX.md`）：`probe-openclaw-clone.ts`（克隆面读数，产物
> `clone-openclaw.txt`），三份只读专家报告 `expert-security-runtime.md` / `expert-memory-context.md` / `expert-agent-engineering.md`。

### 17.1 落地读数（本地克隆面；枚举命令与口径见 `INDEX.md`，枚举时刻 2026-09-16 11:11 +08:00）

| 项 | 读数 |
|---|---|
| 落点 | `vendor/_src/openclaw`（与其余外来材料同根） |
| 克隆方式 | `git clone --depth 1` —— **浅克隆**，本副本 `git rev-list --count HEAD` = **1** |
| HEAD | `c1c870a41755af2675f66766451931f9edade07a`（2026-09-15 20:01:43 -0700，标题 `fix(plugins): use vendor logos…`），分支 `main`，工作区干净 |
| 规模 | **43,322** 文件 / **561.6 MB**（**不含** `.git`；口径 = 递归文件计数 + 字节和） |
| 顶层分布 | `src` 19,209 · `extensions` 10,578 · `ui` 4,015 · `apps` 2,657 · `test` 1,574 · `scripts` 1,399 · `docs` 1,398 · `packages` 1,169 · `.agents` 222 · `CHANGELOG/` 135 · `skills` 77 · `custodian-skills` 4 |
| 语言面 | `.ts` **35,104** · `.md` 1,922 · `.json` 771 · `.yaml` 605 · `.mjs` 458 |
| 依赖 | **`node_modules` 不存在**（按「只要代码」策略，未 install） |
| `package.json` | `engines = {"node":">=24.16.0 <25 || >=26.1.0"}`（**比 §16 记的 README 口径更精确**）；`packageManager = pnpm@12.3.4+sha512…`；`license = MIT` |

> **一处读数分层（又一次）**：§16 记的「≈4.65 GB」是 **GitHub API 的 `size`**（含全部历史），本地实测**工作树 561.6 MB**
> （`.git` 另计，浅克隆后合计 ≈712 MB）。**两个数都对，只是量的不是同一个东西** ⇒ 按本仓口径，
> **体积类数字必须带「谁量的 + 量的是什么」**。

### 17.2 §16 的「未核实」逐条收敛

| §16 当时写的 | 本轮结果 | 依据 |
|---|---|---|
| 未读文档全文（security / exposure-runbook / sandboxing / telemetry） | **已读**（另加 `network-exposure` / `sandbox-vs-tool-policy-vs-elevated` / `what-gets-sandboxed` / `opentelemetry`） | `expert-security-runtime.md`（7 篇逐行引用） |
| （§16 未列）记忆面文档 | **已读 9 篇**（`memory` / `memory-architecture` / `memory-provenance` / `memory-search` / `active-memory` / `context-engine` / `compaction` / `dreaming` / `soul`） | `expert-memory-context.md` |
| 未读根目录 `.agents/` 与 `custodian-skills/` 的内容 | **结构已读 + 抽样读内容**：`.agents` 222 文件（220 在 `.agents/skills`，约 50 个 skill，多为维护者向）；`custodian-skills` 4 个（`add-model-provider` / `cloud-image-bake` / `configure-channel` / `diagnose-gateway`）；装载形态 = `.agents/skills/<id>/SKILL.md`，frontmatter 只有 `name` + `description`，**未声明宿主** | `expert-agent-engineering.md` |
| 未核「曾用名」 | **仍未核，且更明确地不能核**：浅克隆只有 1 个提交 ⇒ **本副本结构上无法核历史**；`topics` 的 `molty` / `crustacean` 与贡献者名 `moltbot886` **仍然只是现象，不是证据** | §17.1 的 `rev-list --count` = 1 |
| 未拆解 4.65 GB 的体积构成 | **已拆**（见 §17.1） | `probe-openclaw-clone.ts` |
| 「它也提供 skills/plugins/插件 SDK，但不提供 DSH 宿主形态」（§16 的相似点之一） | **证实，且给了证据**：全仓**无 `cordis.yml`、无 `agent-presets` 目录**，`package.json` 无 `dsh` / `cordis` 字样（父代理独立复核：0 / 0 / 0 命中） | `expert-agent-engineering.md` + 父代理复核 |
| 「389,802 ⭐」只是单一读数快照 | **未变**（本轮只读码，**未联网再抓**） | — |

### 17.3 读码后的对照结论（**本节主要产出**）

- **三条正面冲突（形态层面不可移植）**：
  1. **向量库**：它默认用 `OpenAI embeddings`（`docs/concepts/memory-search.md:16`），召回走「向量 + BM25 + 文件名」混合
     （`:82`），`provider:"none"` 才是纯全文检索（`:129`）—— 与本仓 **ADR-0001「不引向量库」**正面冲突。
  2. **常驻服务**：它自管 `llama-server` 托管服务（`memory-search.md:40`、`:222`）与 **cron 定时任务**
     （`dreaming.md:168`「auto-manages one cron job」）—— 与 ADR-0001「不常驻服务」正面冲突。
  3. **让 LLM 判关系**：dreaming 用一次「无工具 completion」**选择 additions / merges / supersessions**
     （`dreaming.md:68`）—— 与本仓「**LLM 不能制造关系**」（ADR-0042 / 0043 / 0051）冲突。
     ⚠ 同一份文档里**自相矛盾**：`:93` 说模型「returns operation decisions, not replacement memory prose」，
     而 `memory-architecture.md:176` 说它「produces a revised file」；专家报告**采信前者**，**未在源码层裁决**。
- **两条同族（可作外部正例）**：
  1. **来源不可判定就降级，绝不默认成可信**：`memory-architecture.md:82`「content whose provenance cannot be determined
     is treated as `untrusted`…**It is never defaulted to `owner`**」；且标签**存在 SQLite 列、由分类代码写**，
     **不从记忆正文里解析**（`:376`）。
  2. **缺件不静默，且不降级到宿主**：`memory-search.md:134` 把 embedding 失败的**脱敏原因**写进
     `debug.embeddingBootstrap`（**即使没有命中**）；`docs/gateway/sandboxing/what-gets-sandboxed.md:22`
     「it is absent, and OpenClaw **does not fall back to reading the host filesystem**」。
- **一条同族但边界更窄（最容易照抄错的一条）**：它的证据门**只挡「自动注入」，不挡「显式工具调用」** ——
  `memory-architecture.md:215` 说分类不合格/缺失的记忆「omitted from automatic context」，而 `:217` 明写**显式工具调用
  仍会返回**。⇒ 「无证据不返回」在它那里是**注入那条路**的规则，不是**读那条路**的规则；照抄成「一律不返回」就错了。
- **另有一条 agent 工程面的强判据**：`live-proof-routing.md:52`「**Source inspection is not runtime proof.**」与
  `autoreview/SKILL.md:225-226`「Absence means no outcome was published, **never a clean review**.」——
  与本仓 `MATERIALS.md` §6 的五级链（工件存在 ≠ 已安装 ≠ 已装载 ≠ 在跑 ≠ 可用 ≠ 已验证）与 ADR-0049 是同一判据；
  `evidence-ledger.md:44` 的「never round up」则与 ADR-0072「标签不得强于事实」同向。

### 17.4 对 §16 那条「披露口径正例」补一刀边界（**本轮最值钱的一条**）

§16 记的是它的正例：默认只做每日版本检查、匿名统计 opt-in、`update.checkOnStart: false` 把两者一起关掉，并有一页遥测文档。
**读码后要补的边界是：那个总开关并不覆盖全部外发** ——

- `DO_NOT_TRACK=1` **只关匿名统计，不关每日更新检查**（`telemetry.md:209-212`）；
- 即使关掉统计或设了 `DO_NOT_TRACK`，服务端**仍记录近似地理**（国/区码/市/时区，`:88-89`）；
- 关闭请求**不抹除已有记录**（`:92-93`），记录保留 3 个月。

⇒ 对**本仓「省略披露开关」（v1.15.91 / `adr/0092`）**，这是一条**反面提醒**：**「默认安静」不能只给一个总开关** ——
披露要**按每一条外发路径逐条列**，并写明**哪个开关覆盖哪几条**。

### 17.5 执行边界（据实记录，含一次已回滚的误装）

- 用户中途指令「**不用跑起来 openclaw 只要代码**」⇒ 本轮**未安装、未构建、未运行**任何 openclaw 能力；
  §16 里「未安装」「未运行」这两条**仍然成立**（变的只有「未克隆」）。
- 该指令到达前，一轮 `npm install -g openclaw@latest --allow-scripts=openclaw` 已经启动 —— 已**中止并回滚**：
  `npm uninstall -g openclaw` 移除 **311** 个包，复核全局 `node_modules` 与本机 PATH **均无 openclaw 残留**。
  （**记这一条的理由**：回滚本身也是要能被复核的事实，不能只写「没装」。）
- 记忆侧资源卡按用户「遗留 2」写在 `.shadow/resources/openclaw.md`（**源层卡片**，ADR-0051），并用**真实读侧**验证：
  `shadow_query(scope:["resource"])` 能召回该卡（含投影分段与 `source` 证据）。

### 17.6 未核实（本轮新增 / 延续）

- **openclaw 的实现代码一行未读**：`src/`（19,209 文件）与 `extensions/`（10,578 文件）⇒ 本文所有默认值均
  **取自它自己的文档声明，未核 schema、未对源码**。
- `.agents/skills/` 只抽样读了 3 个 skill（`auto-qa` / `autoreview` / `diagnose-gateway`）与
  `technical-documentation/references/principles.md`，**其余 50+ 未读**；`docs/` 1,398 文件里只读了上文点到的 16 篇。
- **未安装、未运行** ⇒ 「按文档声明能不能真跑起来」**未验证**（用户已明确不要跑，此项不是遗漏而是边界）。

## 补充材料（2026-09-20 用户提供，本轮已核实）

> 用户 2026-09-20 指令「顺便添加材料 https://github.com/browser-use/jev-ultrafast」。
> **口径**：本节与 §16 同形 —— **联网核实读数 + 对照结论**，**未克隆、未安装、未运行**。
> 抓取时刻：**2026-09-20 09:5x +08:00**，通道 = GitHub HTML 页面 + `raw.githubusercontent.com` 的
> `README.md` / `pyproject.toml` / `LICENSE` + `git ls-remote` + `commits/main.atom`。

### 18. browser-use/jev-ultrafast（Jev Ultrafast ⚡）—— **新**（浏览器 agent，动态索引动作空间；**不是记忆材料**）

**它是什么**（据 README 自述与 raw 元数据，逐条可核）

- 一句话（README 副标题原文）：**"A browser agent with a dynamic, indexed action space."** —— 给一个目标，
  [TypeSafe 的 Jev](https://docs.typesafe.ai/introduction) 选出「操作 + 元素」，**只有操作是 `TYPE_TEXT` 时**
  才让小 LLM 生成文本。`pyproject.toml` 的描述是另一句：**"A browser agent that chooses instead of generating."**
- **GitHub About 的 description 只有三个词：`i. am. speed.`**；website = `https://browser-use.com`；**topics 为空**。
- 语言 / 构建：**Python**（`requires-python = ">=3.12"`，`uv sync` 驱动）；**运行依赖只有两条** ——
  `browser-harness==0.1.13` + `httpx[http2]>=0.28,<1`；`pyproject.toml.version = 0.1.0`；`license = "MIT"`。
- 读数（**2026-09-20 抓取时刻，页面读数**）：**8,553★ / 540 fork / 20 watcher**；`license = MIT`
  （页面 `spdxId = MIT`；`LICENSE` 正文首行 = `MIT License` / `Copyright (c) 2026 Browser Use`）；
  `createdAt = 2026-09-16T21:30:12Z`；`defaultBranch = main`；**tag 数 = 0**。
- **提交面（读 `commits/main.atom`）**：`main` HEAD = **`1231850a`**（2026-09-18T16:28:35Z，
  「docs: announce the Cloud waitlist below the README title (#30)」）；往前两条 = `452c1ad2`
  （2026-09-17T02:20:01Z，「Reduce browser round trips and record a 7-second Flights demo」）与
  `68c077bf`（2026-09-17T01:44:17Z，「Build Jev Ultrafast browser agent and real-web demo」）。
  ⇒ **atom 只返回 3 条**（新仓 + 大颗粒提交），**不代表全史只有 3 笔**。
- **分支面（`git ls-remote --heads`，全量）**：共 **7** 个 ref = `main` + **6 个 `codex/*`**
  （`bu-bench-eval` / `bu-bench-eval-v2` / `cloud-waitlist-announcement` / `planner-loop` /
  `planner-state-final` / `state-action-hillclimb`）⇒ **只记形态**：像「用 Codex 跑实验分支」的开发方式，
  **不作因果结论**。

**值得借鉴（按价值排序）**

① ⭐ **「选择」与「生成」分开**：主策略只**选**（操作 + 元素），文本生成被收窄到 `TYPE_TEXT` 一个分支、
   且交给**小模型** ⇒ 大模型不参与每次决策。本仓的对照物是既有的层级分工 ——
   同族判据：**把昂贵的那一步收窄到真正需要它的分支**（本仓 `read_shadow` 的分层召回、`deriveShadowNodes` 收一处同款）。

② ⭐ **模型输出永不成为可执行物**（README 原话可核）：executed target 一律从**观察到的节点**解析，
   执行器**复查页面新鲜度与点击遮挡**；模型输出**不得**变成 selector / 坐标 / shell 命令 / 可执行 JS；
   text-helper 的输出必须能解析成**小 JSON 对象**才允许输入。
   ⇒ 与本仓「**记忆数据非指令**」（ADR-0043 + 读侧护栏横幅）**同判据、不同面**：它防「输出变执行」，
   本仓防「数据变指令」；两者都把**信任边界写在数据形状上**，而不是靠提示词祈祷。

③ ⭐ **有损要自报 + 边界要写明**：README 的 "Evidence and limits" 一段同时给好消息与限制 ——
   一次 Google Flights 实跑 **7,073 ms**；六次交替运行**两版各 3/3**；中位任务时间 **9.450 s → 7.092 s（−25%）**；
   浏览器协议调用 **1,092 → 101**；并**当场自我设限**：「这是同一任务的 3 次重复，**不是通用可靠性基准**」。
   ⇒ 与本仓「数字要带范围与时刻」+「不夸大」同款。它另有一句可直接借用的判据：
   **`DONE` 仍需要独立的结果验证**（模型说完成 ≠ 完成）。

④ **实现层面的四条（如实抄下来，供以后对照，本轮未读源码）**：默认 agent 循环**不用截图**
   （消费结构化状态，inspector 才 opt-in 截图 + 视频用单独连续录屏）；**一次浏览器调用**完成原子快照
   （可见控件、name/value/text 一次读全，并保留真实 DOM 节点引用）；等有用状态（combobox 输入后等可见建议，
   **上限 200 ms**；其它交互最多两帧或 50 ms）；**只发送可见文本**（离屏正文/页脚不占模型上下文）；
   **复用被中断的文本请求**（仅当 text-helper 输入**逐字未变**时才复用陈旧重试的生成值）。

**边界（它自己写明不在 MVP 内）**

- shadow roots / frames / canvas / uploads / 弹窗 tab / 嵌套滚动 / 任意键盘控件 —— **均未覆盖**；
  DOM reader 只处理常见 HTML 与 ARIA 控件，**不是完整 accessible-name 规范**。
- 那份跑分是**同一 task、同一浏览器 profile、3 次重复** ⇒ **不可当可靠性基准**；
  `DONE` 需外部独立验证；自有 tab 共用既有 Chrome profile。

**对 dsh-shadow 的关系**

- **不同题**：它管「浏览器里的动作选择」，本仓管「记忆/上下文投影」⇒ 本条性质 = **登记备查 + 形态对照**，
  **不含吸收裁决**（与 §16 对 openclaw 的处理一致）。
- **一条硬边界**：它是**浏览器侧执行器**（需 Chrome + Browser Harness + 两个付费 key：`TYPESAFE_API_KEY` /
  `TEXT_MODEL_API_KEY`），本仓是**宿主内插件、零常驻服务**（ADR-0001）⇒ 形态层面不可移植。
- **一处易误判的相似**：它也有 inspector（本地 `http://127.0.0.1:8766`），与本仓 `shadow_query` /
  `mode:"toolset"` 的人读面看起来同类 —— 但它是**实时运行可视化**，本仓是**派生投影**，别把两者的「面板」当同一物。

**未核实（据实标注，不写成已核）**

- **未克隆、未安装、未运行**（用户本次只要求「添加材料」）：以上全部取自 **README / `pyproject.toml` /
  `LICENSE` / GitHub 页面读数 / `git ls-remote` / atom feed**；**`jev_ultrafast/*.py` 源码一行未读**。
- **`docs/performance.md` 未读**（它把跑分、失败、源码哈希与测量边界放在那里）⇒ 上文第 ③ 条的读数
  **引自 README 的转述**，未回原表核对；`docs/banner.svg`、`docs/demo.gif|mp4` 也未看。
- 8,553★ 是**页面读数**（HTML 内嵌 JSON 的 `stargazerCount`），**不是 API 读数**：本次 `api.github.com`
  取数**撞限流**（403 `API rate limit exceeded`）⇒ 星/fork/创建时间均以页面 + raw 复核为准。
- 未核「它与同组织的 `browser-use/browser-use` 是否共用运行时」（README 只提到 Browser Harness）；
  提交面只读了 atom 给出的 3 条 ⇒ **历史深度未核**。

## 深读结论（2026-09-14 第 2 轮：**一手克隆 + 源码深读**；判定见 `adr/0087`）

> 用户 2026-09-14 指令「这两个**拉取后，学习，吸收**」。本轮完成**拉取 + 学习 + 判定**，
> **实装按待办走**（`BACKLOG.md` 的 D9 / D10 / D11），**理由与逐条判定见 `adr/0087` §C**。
> **口径**：本节只记「克隆落点 + HEAD + 对前文的更正 + 结论摘要」；**完整判定不在此重复**，去 `adr/0087`。

### 10. 两仓的一手事实（写死快照，避免引用会漂的数字）

| 仓库 | 本地落点 | HEAD | 声明版本 | 许可（`LICENSE` 原文） |
|---|---|---|---|---|
| `rtk-ai/rtk` | `vendor/_src/rtk` | `d402152`（2026-09-14） | `Cargo.toml` = **0.48.0** | **Apache-2.0** |
| `google/langextract` | `vendor/_src/langextract` | `70cfb98`（Prepare v1.7.0） | `pyproject.toml` = **1.7.0** | **Apache-2.0** |

- **langextract 此前在本机已有副本，但那是「无 `.git` 的 v1.6.0 快照」** —— 落后一个小版本，**且不是克隆**。
  本轮按「可逆改动先备份」改名为 `vendor/_src/langextract--snapshot-v1.6.0` 后重拉正规克隆。
  （**要删那份旧快照说一声**；它完全可由 GitHub 复现。）
- 第一次克隆被代理掐断（`early EOF`），按「网络受限换可达通道」降到 `--depth 1` 才过。
- **`rtk` 与 DSH / DeepSeek 无任何关联**（全仓搜 `dsh|deepseek` 的命中全是 *benchmark harness* 之类无关词）；
  它确有宿主无关的接入面（子进程 `rtk rewrite <cmd>` 退出码协议 / `rtk hook <agent>` / 环境变量），
  但那条面做的事（**改写命令**）正是本仓不该做的（见 `adr/0087` §A 不吸收项 2）。

### 11. ⚠ 对 §7 / §8 的更正（读源码后推翻只读 README 的描述 —— `adr/0078` D1 更正① 同款纪律）

**§8（langextract）的描述此前不完整，现更正**：

- 原描述只说了「它**自动检测**：定位不到原文的抽取项其 `char_interval = None`」，读起来像是**一道门**。
- **一手源码核实后的事实**：那是一个**软约定，不是门**。
  `langextract/resolver.py:1021-1038` 收 `unaligned_extractions` 只为跑一次 fuzzy 重试，
  **之后无计数、无 warn、无 raise**；`align_extractions` 在 `:1073` 直接 `return`
  （父代理复核：全文件仅两处 `logging.warning`，`:311`/`:319`，**都是解析错误，与对齐失败无关**）。
  唯一的硬断言 `tests/test_live_api.py:279-302` 落在 `tests/test_live_api.py`，
  而默认门 `tox.ini:25` 是 `pytest -m "not live_api and not requires_pip and not integration"` ⇒ **被排除**。
- ⇒ **本仓不得把它当「有门的先例」引用**。它恰好是 **ADR-0049 要防的那种形态：降级了，但不可见**。
  这条是本次学习**最值钱的单点结论**。

**§7（rtk）补充一条我方引用口径的更正**：仓库描述里的「Single Rust binary, **zero dependencies**」
在 `README.md` 里**找不到**；最接近的原句在 `docs/contributing/TECHNICAL.md:15`
（*"a single Rust binary with no runtime dependencies beyond the compiled binary itself"*），
而 `Cargo.toml` 有 **24 个直接依赖**。⇒ 引用这句时应引 `TECHNICAL.md` 的原句，且**说清是「无运行时外部依赖」**。

### 12. 结论摘要（**完整判定见 `adr/0087`**）

- **rtk**：压缩实现层（63 个 TOML 过滤器 + 命令改写 hook）对本仓**无用**（无共同消费方）；
  但**记账层与门禁层有 8 条判据形态**值钱，其中 `never_worse` 守卫与「实测/估算分类型」两条最贴本仓。
  **不吸收 8 条**，逐条理由见 `adr/0087` §A。
- **langextract**：**卖点是真的**（`char_interval` 是确定性 token 级对齐算出来的，不是让模型吐位置），
  但**纪律是软的**；它的精华判据（对齐分级 / 逐字判定 / 覆盖率+密度双闸）在**本仓今日没有消费方**
  —— 本仓 Evidence Gateway 判的是**路径是否存在**，不是文本对齐。⇒ **登记为对照，不实装**（避免假闸门）。
  **不吸收 10 条**，逐条理由见 `adr/0087` §B。
- **两仓均未安装、未运行**（本机无 Rust 工具链；langextract 未 `pip install`）⇒ 结论**止于源码阅读**。

---

## 材料面对账（2026-09-15 —— 「一一对比，深层次」的**清单那一半**）

> 用户 2026-09-15 的指令是「这个项目和参考资料对比 **一一对比，深层次**」。本轮做的是**对账 + 逐份判定**
> （**未重读任何材料的内容**）。**逐份的「本质 / 可比面 / 深层差异 / 判定」整体落在
> `adr/0089-materials-deep-comparison.md`**；本节只回答**本文件自己那一层**的问题：
> 「参考资料」到底有多少份、按什么口径数的、这份清单今天还能不能复核。

### 14. 材料面清单（**口径 = 枚举根 + 枚举时刻**）

- **枚举时刻**：2026-09-15（本机，`D:` 盘）。
- **四个口径，条数互不相同**（不是「谁错」，是**四个不同的集合**）：

| 口径 | 条数 | 复核命令（在本仓根下跑） |
|---|---|---|
| 本文件 §完整清单 的裸 URL（2026-09-02 那一批） | **21** | `(Select-String -LiteralPath references.md -Pattern '^- https://github.com/').Count` |
| `../../references-agents/*/AGENTS.md`（**仓库之外**的第三份清单） | **19** | `(Get-ChildItem ..\..\references-agents -Directory).Count` |
| `../_src` 磁盘本体 | **22 个目录 = 21 份材料 + 1 份上版快照** | `(Get-ChildItem ..\_src -Directory).Count` |
| `MATERIALS.md` §1 名册（**换盘前**口径） | **8** | 该表的枚举根 `G:\project\dsh1` **本机已不存在** ⇒ **不可复核** |

- **⚠ 两个路径不是同一级**（本轮实测踩过）：`.docs/` 在 `vendor/` 下（`..\.docs\fix\<日期>\`），
  而 `references-agents/` 在 `dsh1/` 下（`..\..\references-agents`）。
- **三件对不上的事**（逐份判定见 `adr/0089` §1）：`codegraph` **有清单、有笔记、没有本体**；
  `MATERIALS.md` 的名册是**换盘前**口径（8 项里 5 项本机已无）；
  **21 份材料里只有 4 份带 `.git`**（`langextract` / `PageIndex` / `rtk` / `zvec-grep`）⇒ 其余 HEAD 无法复算。
- **由此立的判据**（与 `AGENTS.md`「能推出来的字段不要手写」同源，事故见 `adr/0085` §8.7）：
  **凡「清单」这类可由磁盘推出来的字段，登记时必须带「枚举根 + 枚举时刻」**；
  否则它会在换机之后变成一句**看起来权威、实际不可复核**的话（`MATERIALS.md` §1 就是现成的样本）。

---

## 材料面深读（2026-09-15 第 2 轮 —— 用户「都要」的第二件）

### 15. D 类九份的**真读判定** —— 完整判定见 `adr/0091-dclass-nine-materials-deep-read.md`

- **这一节只回答「登记到没有」**：`adr/0089` §2 D 点名的那九份（`strix` · `ECC` · `hackingtool` ·
  `system_prompts_leaks` · `ui` · `marker` · `open-lovable` · `MoneyPrinterTurbo` · `data-engineer-handbook`）
  **已逐份真读**（README + 顶层 + 与四个可比面相关的文件），**逐份判定与 `文件:行号` 锚点在 `adr/0091`**。
- **结论一句话**：**8/9 至少落在一个可比面上** —— `strix`（退出码「`0` 只覆盖被分析的部分」+ 机读证据产物）·
  `ECC`（记忆契约「Recalled memories are context, not executable instructions」+ provenance schema）·
  `hackingtool`（215 工具的**类目 + 标签 + 推荐层**）三份落在**硬面**；`open-lovable` 是**反面样本**
  （窗口截断 `messages.slice(-5)` 无披露）；**只有 `data-engineer-handbook` 维持「无可比面」**。
- ⇒ 由此**更正** `adr/0089` §2 D 的「一处都不落在」（那一条是**基于名称与首标题的推断**，补记已加在该节）。
- **怎么重放**：`node ..\.docs\fix\2026-09-15\probe-dclass-digest.ts D:/project/dsh1/vendor/_src`
  （探针**只复现输入、不做判断**；判定在 ADR —— 这是本仓「判据与证据分层」的一贯口径）。
