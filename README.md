# dsh-shadow

agent「思维/上下文/灵魂」的投影——每条记忆都是一个文件；`read_shadow` 可按主题穿透。

**谁该用它**：想让 agent 跨会话记住「为什么这么做」的人；想给 DSH 加一层可追溯记忆、又不想引入向量库的人。

**给 agent 读的入口**：本文件给人看；agent 读这三处——`AGENTS.md`（在本仓库干活时的约定）/ `CONTEXT.md`（术语表 + 各 mode 的入参与返回）/ `adr/`（决策与边界，按编号）。

## 兼容性（验证基线）

| 项 | 值 |
|---|---|
| 验证基线 | **DSH `0.1.5-rc.1`**（在这一版上验证并运行） |
| 声明 | `package.json` → `engines.dsh: ">=0.1.5-rc.1"` |
| 更早版本 | **未经验证，不承诺可用** |

**这是一句「验证基线」声明，不是强制闸门。** 宿主与 pnpm 目前都不读 `engines.dsh`（对 `@deepseek-ai/*` 全量编译产物检索 `engines`：**无任何代码读取**，仅散文注释提及；`dsh plugin` 只转发 pnpm，并按「装了什么」同步 bundles 层），所以它拦不住低版本 DSH。**能观测到的防线是能力探测**——它只**报告**、不拦截：插件探测自己需要的宿主接口，缺哪个就报哪个：

| 档位 | 缺什么 | 表现 |
|---|---|---|
| 硬依赖 | `ctx.on` / `ctx.inject` / `ctx.get` / `fs` / `tools` | 控制台 **error**，写出缺哪一项、影响什么 |
| 可选依赖 | `llm` / `agents` / `agentDefaultModel` / `systemPrompt` | 控制台**一条 warn**，说明降级了哪项能力 |

探测**不放在 `apply()`、也不放在 `inject` 回调**：Cordis 的服务是异步挂载的，`apply()` 时可能尚未 provide（会误报）；而 `ctx.inject(deps, cb)` **只在依赖就绪时才回调** —— 依赖缺失时回调根本不执行，把「缺 X」写进去等于「缺了就不报」（v1.15.3 修正的正是这一点）。故服务面检查**统一在首个 `agent/turn-stopping`**（此时宿主已完全挂载，且只报一次）。

**为什么基线是 0.1.5-rc.1 而不是更早**：对照宿主包，本插件用到的接口（`fs` / `llm` / `agents` / `agentDefaultModel.currentSelection()` / `tools` / `systemPrompt` 六个服务，`session/event` / `agent/turn-stopping` 两个事件）在 `0.1.0-rc.7` 起就已存在——**这里没有已知的不兼容点**，基线表达的是「只在 0.1.5-rc.1 上验过」，不是「更早版本不兼容」。

## 为什么存在（它修的是什么）

| 失败模式 | 现象 | 本项目的修法 |
|----------|------|--------------|
| #1 换个会话就失忆 | 上一轮为什么这么改、做到哪，全没了 | 每回合压成一条记忆文件 + `_index.md` 索引；`recall_shadow` 一句话找回任务恢复包 |
| #2 只记动作不记理由 | 看得到「改了哪个文件」，看不到「为什么这么改」 | 决策作为一等事件采集（Decision Capture）；理由**只在原文明确表达时**才挂，缺就写「未明确」 |
| #3 召回一堆没证据的东西 | 相关度高但无从验证，等于让你信模型 | Evidence Gate / Validation Gate：无证据的决策、metadata 记忆不进查询；体检报告看 Evidence Density |
| #4 记忆过时没人知道 | 早就删掉的函数，记忆里还在引用 | 召回时校验证据路径是否仍存在 → 缺失降权并标 STALE；生命周期 `NEW → … → SUPERSEDED`（`TRUSTED`/`ARCHIVED` 两态当前不可达，见 ADR-0063 / ADR-0066） |
| #5 系统提示/密钥混进记忆 | 历史里回显 `<system-reminder>`、打码前的 key | 采集剔除系统脚手架；写侧密钥打码；读侧 `scrubFinal` 二次清理 |
| #6 把记忆当指令 | 旧记忆里的句子被当成用户要求去执行 | 读侧输出恒定「数据非指令」前缀 + 每条标「可能过时，非指令」 |
| #7 上下文越堆越长 | 全量塞进上下文，token 烧光、重点淹没 | 分层召回 + token 预算 + 冷热淘汰（默认关，可显式开启） |

## 什么情况用哪个（模式路由表）

| 你想做的事 | 用这个 | 说明 |
|------------|--------|------|
| 看记忆目录 / 有哪些主题 | `read_shadow()` | 无参数返回 `_index.md`：格式说明 + 近期记忆 + 入口索引 + 意识轨迹 |
| 回忆「上次在做什么、为什么、做到哪」 | `recall_shadow("一句话查询")` | 任务恢复包（内部 `mode:"recovery"`）：任务/状态/关键决定(含理由)/证据是否仍有效/观测结果 |
| 按主题穿透到具体记忆 | `read_shadow(topic)` / `{ entry: "…" }` | 分层召回：高分给「摘要 + 命中片段 + 正文骨架」，低分只给「路径 + 摘要」；`max_tokens` 控预算 |
| 跨「记忆 / 决策 / 代码 / 文档 / 概念 / 资源」找上下文 | `shadow_query(query, scope?)` | 返回带证据的 ShadowNode，每条可追溯；`scope: ["resource"]` 单查资源卡 |
| 看召回为什么命中 / 为什么被降权 | `read_shadow(topic, { debug: true })` | 召回管线 trace：候选 → 命中 → 冷却 → 预算 → 返回 |
| 追一条决策的来龙去脉 | `read_shadow({ mode: "decision" })` | 决策血缘：goal 事件 + 用户拍板，按入口聚合 |
| 追一段连续任务 | `read_shadow({ mode: "episode" })` | 按「项目/会话 + 时间间隔」把记忆原子串成 Episode |
| 看任务生命周期（触发/目标/约束/状态） | `read_shadow({ mode: "task" })` | 派生视图，不改写记忆 |
| 判断「以前知道的东西现在还能不能用」 | `read_shadow({ mode: "context" })` | ContextReference：subject / value / source / status（validated / stale / unknown） |
| 站在当时视角看（不剧透后来） | `read_shadow(topic, { observer: true, asOf: "YYYY-MM-DD" })` | 只给「当时可知」，后验内容标 `[后验]` |
| 要身份 / 价值观 / 品味 / 经验 / 判断 | `{ identity: true }` / `{ soul: true }` / `{ taste: true }` / `{ experience: true }` / `{ judgment: true }` | 灵魂投影四对象 + 主体锚（推进 Identity Continuity 用 `mode:"identity-advance"`） |
| 检索规范 / 文档（免向量） | `read_shadow({ mode: "knowledge" })` | 规范树 / 章节检索，结果带节路径引用 |
| 验证某条记忆的证据还在不在 | `read_shadow(topic, { verifyEvidence: true })` | Evidence Gateway：fs（默认）/ zg（CLI）可插拔；zg 未装报 `unavailable`，不静默当成已核实 |
| 体检：召回质量与稳定性 | `read_shadow({ mode: "shadow-report" })` / `{ mode: "query-log" }` | Evidence Density / Node 稳定性 / 类型分布 |

另有长程与边界族 mode（`agency-*`、`delegation-*`、`adapt-*`、`horizon-*`、`recall-*`、`federation*`、`distortion`、`real-evidence`/`real-refer`、`simulate`/`candidate`/`execute`、`validate`/`evidence`、`model-*`、`world-*`、`temporal`、`reflection`、`observer-*`、`workspace-*`、`continuity-index`、`identity-advance`、`recovery`），属 ADR 落地的按需查询，不是日常入口；**全部 61 个 mode 的语义、入参与返回见 `CONTEXT.md` 的「mode 参考」表**（工具 schema 里的 `mode` 描述只留常用 mode + 指针，避免每个请求都背上这份清单）。
> **命名口径（ADR-0050 / ADR-0053）**：mode 名与参数名以工具 schema + `CONTEXT.md` 为唯一现行口径；被取代的旧名本文件不登记（映射与理由见 ADR-0050 / ADR-0053），调用旧名会返回「已废止：X → 请用 Y」，不落空进默认召回。
> **取舍（有意为之）**：schema 不再携带各族边界语（如「非 Autonomous Agent」「不提升 epistemic/authority」）。不读 `CONTEXT.md` 的模型会少这层提醒——换来的是每个请求少约 1.2k 字符常驻上下文。要恢复，把 `CONTEXT.md` 的 mode 参考表接回 `mode` 描述即可。

### 谁能调用（用户显式 vs 模型自动）

借 mattpocock/skills 的权限轴：**模型能自己调的，不能反过来触发「只该用户要求」的动作**。

| 工具 / 动作 | 谁能调用 | 说明 |
|-------------|----------|------|
| `read_shadow` / `recall_shadow` / `shadow_query` | 模型可自动调用 | 纯读：不写工作区、不落盘、不改索引；提示词已接线「缺上下文先查」 |
| `read_shadow(..., { debug: true })` / `{ verifyEvidence: true }` / `{ kg: true }` | 模型可自动调用 | 只是多返回 trace / 证据验证 / 图谱邻接，仍不改状态 |
| `mode: "shadow-report"` / `mode: "query-log"` 体检 | 用户要求，或定期自查 | 只读、只生成派生报告（`rm -rf` 可重建） |
| 开启 `retention` / `forget` / `compact` / `projectionStore` / `knowledgeEngine` | **仅用户显式要求** | 会改召回集与索引行为，属有后果动作（改配置 + 重启） |
| `mode:"toolset"`（只读巡检 / 能力预检） | 模型可自动调用 | 只是探测可选 CLI 是否可用，不改任何东西 |
| `mode:"toolset"` + `install:"<id>"`（**安装**） | **仅用户显式要求** | 有后果动作：**一律先经宿主审批**，只有 `allowed-once` 才执行；装完**重探**再报结果 |
| `writeConsent: true` 之后的落盘 | **仅用户显式要求** | 用户没明说「记住」时只累积不落盘（默认 `false` 照常采集） |

## 快速开始

### 给 agent 的粘贴式安装

把下面这段丢给任意能读写本地文件的编码 agent（Claude Code / Codex / 本机 DSH 会话等）：

```text
把 D:/project/dsh1/vendor/dsh-shadow 以 link: 方式装进 DSH web profile：
1) profile 的 package.json 加依赖 "dsh-shadow": "link:D:/project/dsh1/vendor/dsh-shadow"，bundles 数组加 "dsh-shadow"；
2) 在本目录跑 pnpm install（源码是 TypeScript，改过源码先 pnpm run build）；
3) 重启 profile，跑 dsh --profile web --dump-config 确认没有 Error:；
4) 新开一个会话做几次工具调用，确认工作区出现 .shadow/<日期>/<时刻>-<主题>.md、.shadow/_index.md 生成、read_shadow 出现在工具列表；
5) 说一句「回忆一下上次在做什么」，确认 recall_shadow 能返回任务恢复包。
失败或要细节，读 README 的「安装（持久化）」「验证（重启后）」两节。
```

### 手动安装与验证

见下文「安装（持久化）」「验证（重启后）」两节；目录位置见「目录位置」。

### 让它主动用起来

在 agent 预设里通过 `systemPrompt.context(...)` 注入一句——缺上下文时先调 `read_shadow` 再回答（详见「提示接入」）。

## 哲学

它不是"记动作的日志"，而是把 agent 的思维与上下文**落成文件树**：`.shadow/` 就是投影，`_index.md` 是投影的索引。记忆以「入口点 + 时间」为纲，思维/决策为正文，动作为背景。

## 它做什么

`dsh-shadow` 把 agent 的一回合压成「一条记忆 = 一个文件」，可穿透召回，并逐步升级为一套「灵魂投影系统」。核心能力按主题分组如下。

### 默认开关（装完什么都不动会怎样）

**只读工具不写工作区；会写、会烧 token 的增强默认都关。**默认开的三项（采集、摘要、查询观测）都可一行关掉。

| 能力 | 默认 | 开着会怎样 / 怎么开 |
|------|------|---------------------|
| 采集与落盘 | **开** | 每回合压成一条记忆文件；`writeConsent: true` 改成「仅用户明说才落盘」 |
| 一句话摘要 `summary` | **开** | 落盘后后台 LLM 生成一两句摘要；`summary.enabled: false` 关（关掉后本项无 LLM 调用） |
| 查询观测 `queryLog` | **开** | 旁路写 `.shadow/query-log/<date>.jsonl`；`queryLog.enabled: false` 关 |
| Episode / 任务回溯 `episodes` | **开** | `_index.md` 生成任务回溯段；聚合间隔 `gapMinutes` 默认 60 |
| 语义召回 B 档 `recall` | 关 | 开需 `recall = { enabled: true, provider, model }`；关时走无外部依赖的关键词召回 |
| 冷热淘汰 `recall.cooldownTurns` | 关（0） | 设 `cooldownTurns: 5`：N 回合内不重复返回同一段 |
| 召回 trace `recall.debug` | 关 | 开需 `{ debug: true }` 或 `recall.debug: true` |
| 召回降权 `recall.deprioritize` | 空（不降权） | 路径/入口含这些子串的命中打分 ×0.4（**只降权不移除**，仍可搜到）；如 `deprioritize: ["references-agents", "_reports"]` |
| 记忆遗忘 `retention` | 关 | `retention = { enabled: true, halfLifeDays: 7 }`：hotness 加权 + stale 默认排除 |
| GC / 归档 `forget` | 关 | `forget.enabled: true` 才把低价值记忆移出活跃召回集（文件保留，Forget≠Delete） |
| Episode 收口归档 `compact` | 关 | `compact.enabled: true` 才合并原子文件 |
| LLM 推理导航 `llmRecall` | 关 | 开需 `llmRecall = { enabled: true, provider, model }` |
| Projection Store `projectionStore` | 关 | `projectionStore.enabled: true`（Node/query 稳定后再开） |
| Knowledge Engine `knowledgeEngine` | 关 | `enabled: true` 启用；其中 LLM 树上导航再单独 `llmNavigate.enabled` |
| 工程知识图谱 `kg` | 关 | 按需 `read_shadow(topic, { kg: true })` |
| 证据 Provider `evidenceProvider` | `fs` | 换 `zg` 需已装 CLI；未装报 `unavailable`，不静默 fallback |

### 采集与落盘

- **每回合采集四类**：入口点（真实改/读的组件，`fs/observed`，客观锚）、决策/意向（`goal/changed`）、动作（`tools/result`，背景）、交互与思维落点（`session/event` 的用户消息与 agent 结论，尽力而为）。回合结束（`agent/turn-stopping`）压成一条记忆：`<工作区>/.shadow/<日期>/<时刻>-<入口slug>.md`。
- **完整线索头（核心）**：每条记忆文件顶部带 `> 完整线索` 头，把「背景/材料」（本回合改/读过的路径 + 用户消息里引用的背景/材料，两路合并去重）+「用户提示/决策」（被分类为用户提醒/拍板的用户消息，标 `decision`/`reminder`）+「用户要点」（全部用户消息兜底，防漏记）+「概况」（动作/用户消息/决策计数）结构化列出——让一条记忆一眼能还原完整线索链。
- **说明文档 + 索引 + 意识轨迹**：`.shadow/_index.md` 讲清格式、列出近期记忆、给出「入口/主题 → 记忆文件」索引，并生成按时间的意识轨迹（可反推用户/自己的思考方向）。
- **入口语义切分 + 落盘兜底**：入口优先取语义路径（读/改文件路径的域，如 `acshModel`/`vendor/dsh-shadow`），纯工具名（`pwsh`/`edit`）不作 entry（防跨事务串线、命中错主题）；`session/flush` 收口时落盘全部 pending + pending 超 60 条异步落盘；落盘失败改 error 级 + `read_shadow` 显示「⚠ 数据不可达 / 请确认 shadowRoot 可写」（区分"数据不可达"与"召回不足"）。
- **一句话总结（增强）**：每一回合落盘后，detach 一个后台任务用 `llm.stream` 生成一两句中文摘要回填到记忆文件头（`> 摘要：…`）。纯聊天/无工具回合也能据此沉淀成可读记忆；失败/超时静默降级，不影响正文。默认路由取 `agentDefaultModel.currentSelection()`；可用 `rawConfig.summary` 配置 `{ enabled, provider, model, maxTokens, timeoutMs }`，`enabled: false` 关闭。
- **会话归属**：采集按各 session 自己的 agent 归属（`session/event` 用 `agents.get(session.id)`、`fs/observed` 优先 `actor.agent`），支持多会话/子 agent，不再一律挂到全局 initiator。
- **系统提示不泄漏**：采集时先剔除宿主注入的 `<system-reminder>`（workspace 指令 / runtime context / skill 目录 / 会话上下文）等系统级脚手架标签块（成对开闭 + 孤立残留变体），并识别无标签的裸脚手架块（以已知系统提示完整措辞开头）；纯系统消息整体跳过。这些是「系统提示 / 运行时上下文」，不是 agent 的思维/决策线索，不应写入记忆。

### 读取（`read_shadow`，可穿透）

- 无参数返回 `_index.md`（目录）；带 `topic`/`entry` 按主题穿透到具体记忆文件。穿透按**分层召回**：按「入口/主题标签 → 路径 → 正文 + 时间衰减」打分排序，在 token 预算内按深度返回——高分记忆给「摘要 + 命中片段 + 正文骨架」，低分只给「路径 + 摘要」；`max_tokens` 控制预算（默认 1600）。借鉴 OpenViking 的 L0/L1/L2 分层思想，但**不引入向量库**（见 ADR-0001）。
- **冷热淘汰（默认关，显式开启）**：`rawConfig.recall.cooldownTurns = 5` 时，`.shadow/_recall_log.json` 记录「带内容」发过的路径，N 回合内不重复返回；纯 URI 不带内容则不冷却。写失败降级为「不去重」。
- **语义召回（B 档，默认关）**：`read_shadow(topic)` 默认走加权关键词召回（A 档，无外部依赖）。要更接近语义，配置 `rawConfig.recall = { enabled, provider, model, maxTokens, timeoutMs }`——`enabled: true` 且给了 `provider/model` 时，先用 `llm.stream` 扩展几个相关检索词，再打分召回；失败/未配置时静默退回 A 档。
- **Memory Debugger**：`read_shadow(topic, { debug: true })`（或 `recall.debug: true`，默认关）返回召回管线 trace——`候选 → 命中(打分>0) → 冷却 → 预算 → 返回` 计数 + 每条召回「为什么命中（入口/主题/路径/正文打分拆解）/为什么被降权(cooldown/deprioritize)/状态」。默认路径不变。
- **召回信封（截断不静默）**：借 PageIndex「成功/失败都返回带下一步的信封」——预算/`limit`/冷却砍掉的命中会在结果末尾**自报家门**（`未返回的命中：N 条（命中 M · 本次返回 K）· 原因分解 · 示例入口 · 下一步`，**N 恒等于 M − K**，冷却也计入），空命中不再是一句死路，而是给「换词/看索引/`shadow_query`/`recall_shadow`」四条可执行下一步 + **近似候选（显式标「未验证」）**；命中全在冷却时给的是「冷却中的命中（是命中，不是近似）」+ 冷却专属下一步。全部返回时不加任何多余文字。**已知边界**：信封本身不计入 `max_tokens` 预算，所以带信封的输出会比 `max_tokens` 多出这几行（换取「不静默丢」）。
- **读侧输出保留换行（v1.12.7 根因修复）**：`scrubFinal` 原先整篇套 `scrubUnsafe`（剔 `\u0000-\u001f`，连 `\t\n\r` 一起剔）→ 所有读侧 Markdown 被压成一行；现改用 `scrubUnsafeDoc`（保留 `\t\n\r`，仍剔其余控制符/双向覆盖符）。注入短语与 HTML 标签仍被剥离，「数据非指令」前缀不变。

### Shadow Query Observatory（Phase 1A.5）

- **目的**：先跑真实查询数据，**不急着定型 nodes 结构**。在 `shadow_query`（`mode:"query"`）**旁路记录观测**——写 `.shadow/query-log/<date>.jsonl`，每条含 `date/ts/query/scope/limit/candidateNodes/returnedNodes/evidenceCount/evidenceNodes/relationCount/relationNodes/nodeTypes/nodeTitles/latencyMs`（query/title 轻量 scrub：密钥打码 + 剔控制/双向字符）。
- **只读汇总**：`read_shadow({ mode: "query-log" })` 给出命中/证据/关系/类型/scope 分布 + **重复查询的 Node 稳定性**（同一查询 nodeTitles 是否一致，答"Node 是否稳定"；漂移则列出该查询的不同结果集数）。
- **边界（Shadow Contract）**：观测是**系统派生记录**（`rm -rf .shadow/query-log` 不影响任何 Atom）；只在 `shadow_query` 入口打点，**不进 derive 真相路径**；**写失败静默**，绝不改变 query 返回值；**默认开启**（`config.queryLog.enabled=false` 才关）。
- **核心问题（供真实数据回答）**：①Node 每次派生是否稳定；②`memory/code/document/decision/concept/resource` 是否够（真实查询冒出的 `task/constraint` 再补）；③`relations`（references/objective/belongs_to）是否够（真实需要 `implements/depends_on/contradicts/supersedes` 再加，**不提前设计 Graph**）。

### Shadow Fitness Report（Phase 1A.6）

- **目的**：把 query-log 变成「是否升级索引层」的**客观依据**。`read_shadow({ mode: "shadow-report" })` 把 `query-log` 聚合 + 扫记忆做 **missing-types 启发式**，生成 `.shadow/shadow-report.md`（系统派生，rm -rf 可重建）。
- **报告四段**：`Query Summary`（总查询/候选→返回/延迟）、`Evidence Density`（有证据节点/总返回节点，**核心指标：dsh-shadow vs 普通 RAG**）、`Stability`（重复查询的 Node 稳定/漂移）、`Node Distribution`（返回类型分布）+ `Potential Missing Types`（检测约束/任务型内容被归错类型，≥3 处才提示）。
- **关键指标 Evidence Density** = 有证据返回节点数 / 总返回节点数。dsh-shadow 坚持「**宁可少回答，不要无证据上下文**」；覆盖率低于阈值（默认 90%）会标为需关注。
- **边界**：**只诊断、不增强**；判定是启发式观察（best-effort、无 LLM、不下结论），标注依据；缺失类型只在真实数据反复需要时才采纳（不理论驱动、不提前补 `task/constraint`）。

### Evidence Lineage Layer（v1.8.0，ADR-0044/0045/0046）

- **目标**：让每个高价值认知单元都能回答「**它为什么存在、来自哪里**」——提高**可信度与可审计性**（不是搜索/知识）。
- **AtomLineage**：`{ source(从哪产生), createdBy(user|agent|tool), evidence(AtomEvidenceRef[])，createdAt }`。**source ≠ evidence**（source=产生处；evidence=支撑材料）。`AtomEvidenceRef{type,locator,fragment}` 为 zg(文件+行号)/PageIndex(文档+页)/Git(commit+diff) 预留统一抽象（与 Gateway 的 `EvidenceRef{path}` 区分，见 ADR-0050）。
- **AtomKind（memory 二级属性，非新 type）**：`experience | metadata | session | task | artifact`；`kind != metadata` 才进入默认认知查询。
- **Validation Gate**：`validateAtomProjection`——`memory+kind∈{metadata,session}` / `decision 无 evidence` / `resource 无 source` → **不进** shadow_query context（**Atom/卡片保留**；决策发生过 ≠ 可靠；收进库 ≠ 有出处）。`resource` 实际由**解析层先挡**（`parseResourceCard` 无 `source` 就不产出卡片），validator 是同一道门的兜底。
- **Evidence 是事件溯源**：产生决策那一刻记录产生环境（`buildClueHeader` 已把当回合 `fs/observed` + 用户引用材料写进同一原子），读侧据此派生 `lineage.evidence`；**绝不 LLM 补写/推断**。
- **真实数据验证**（OpenAPI-Gateway 52 原子）：**52 → 14 个可证明节点**，排除 33 metadata memory + 5 无证据 decision。
- **边界**：不做 `nodes.jsonl` / Projection Store / zg / PageIndex / Graph 关系扩展 / 自动经验总结。

### 记忆生命周期与遗忘

- **记忆遗忘（retention，默认关）**：`rawConfig.retention = { enabled: true, halfLifeDays: 7 }` 时，`.shadow/_meta.json` 记录每条记忆的 `created/hits/status/confidence/pinned`；召回用 **hotness**（命中数 × 半衰期衰减）加权（替换旧的「21 天归零」线性衰减），并把 `status: stale/superseded/archived` 的记忆**默认排除**。这是「记忆+遗忘=高效」的落地（借鉴 **MemoryBank** 衰减 —— Ebbinghaus 遗忘曲线按回忆时间与频率衰减，[arXiv:2305.10250](https://arxiv.org/abs/2305.10250) / A-MEM 动态合并 / MemGPT archival）。**两处勘误**：① **（ADR-0065）** 本行曾把 hotness 标成「OpenViking 式」——**标错了**，在 OpenViking 官方 README 与 Context Layers / Retrieval 两份文档里 `decay`/`hotness`/`half-life`/`reinforce`/`recency` **全部 0 命中**，真实出处是同一句里本来就引了的 **MemoryBank**；② **（ADR-0066 / 待办 D4）** 本行曾写「`pinned` 永存」——**该状态不可达**：生产只写 `pinned: false`，`pinned: true` 全仓零处，故「永存」这条路径**当前走不到**。真正的保留语义由 `status` 与 `hits` 派生（见下行）。
- **记忆生命周期（deriveLifecycle）**：从 `_meta.json` 信号**派生状态机**——`NEW → OBSERVED → VERIFIED → TRUSTED → STALE/DECAYING → SUPERSEDED`。触发信号：独立 session 确认（`confirmedBy`）、命中次数、新鲜度、冲突。召回 provenance + debug 暴露 `生命周期 <态>`。**可达性（ADR-0063 分诊 / 待办 D4 已决策为「纠正文档」）**：状态机里 **`TRUSTED`（经 `pinned`）与 `ARCHIVED` 两态当前不可达** —— `pinned: true` 与 `status: "archived"` 在**生产中都没有写入者**（生产只写 `pinned: false`）。**不补写入口**：那会把外部权威状态落进可重建的 `_meta.json`，与 ADR-0003 冲突；若将来确实需要「人工钉住/归档」，须先起 ADR 论证状态落在 **source** 层。**另一处口径不一致**：`lifecycleOf` 的两条最前置判断读的是**写侧** `rec.status`/`rec.pinned`，而 `MEMORY.md` 声明的口径是「纯按信号派生、不做写侧硬状态迁移」（已在 `MEMORY.md` 就地加勘误）。
- **冲突检测**：召回时校验每条记忆的**证据路径在当前工作区是否存在** → 缺失即**降权 + 标记 stale**，provenance 暴露 `(⚠证据缺N)` + `生命周期 STALE`（"capture handler 已不存在"类过时）。证据存在则无冲突；无法判定时视为存在（避免误伤非代码路径）。

### 证据链与 Memory≠Evidence

- **证据链（provenance）**：每条记忆文件线索头自带 `> 证据链：来源(种类)·日期·证据(路径)`；`read_shadow` 召回每条紧跟一行可解释 provenance——`来源·日期·状态(active/stale)·命中次数·置信·证据路径`。置信度**从可验证信号派生**（命中次数、状态、新鲜度），非 LLM 玄数，不含虚构 commit/来源。让记忆从「我记得」升级为「我知道它为什么值得参考」。
- **Experience 全构建 + Memory≠Evidence**：Experience 补 `Outcome`（证据验证派生 evidence_live/stale/superseded）与 `Reflection`（无修正/证据缺失/已迭代）；读侧每条召回做**证据裁决**——证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded`，暴露 `裁决/结果/反思`，superseded 降权、置信联动。这是 `Memory ≠ Evidence` 的落点（ADR-0002）：记忆带 provenance/判断，证据验证可插拔（当前=工作区 `fs`，后续=zvec-grep，Shadow 只消费不重造检索）。
- **Evidence Gateway**：`EvidenceProvider { discover()/verify() }` 抽象 + `EvidenceResult{ status, source, matches, confidence, freshness, provenance }`。Shadow 只问 `verifyEvidence(GatewayEvidenceRef)`，底层是 **fs（默认）/ zg（CLI）/ git/IDE…** 可插拔。**zg 是检索层不是裁决层**（Discovery/Ranking/Verification 在 Provider，**Arbitration 留在 Shadow Core**）；**zg 未装 → `unavailable`，绝不静默 fallback 成 verified**。`read_shadow(topic,{verifyEvidence:true})` 暴露验证。

### 灵魂投影系统

- **Soul Kernel**：`read_shadow({ soul: true })` 返回 curated 公理层（身份/价值观/原则/品味/边界，`.shadow/soul/soul.json`）——这是"为什么我是我"的稳定锚，**非事件流、按需查询**；`systemPrompt.context` 接线提示取舍可查灵魂。
- **Experience**：`read_shadow(topic, { experience: true })` 从**完整线索头**派生结构化工程经验（情境/问题/决策/实现/证据/结果/教训/项目/目标）——把一段开发经历投影成可复用的 `Experience #N` 对象，而非零散行。
- **Judgment + Taste**：`read_shadow(topic, { judgment: true })` 从记忆派生「面对情境 → 我判断/选择决策」；`read_shadow({ taste: true })` 读 curated 偏好（灵魂 taste + `.shadow/taste/taste.json`）。灵魂四对象（Soul/Experience/Judgment/Taste）+ Memory 五层全部就位。
- **Observer / Observation Window**：`read_shadow(topic, { observer: true, asOf })`——`asOf` 时间锚定只召回窗口内记忆，`observer` 只呈现「当时可知」（情境/问题/决策），把 outcome/lesson/verdict 等「后来才知」标为 `[后验]`。这是从"端全局答案的 Oracle"升级为"模拟一个拥有这些长期结构的人、只站在当前时刻会怎么想"的 Observer。
- **Projection + Observer 透镜**：`read_shadow(topic, { project: true })` 用 **Soul-as-Observer 透镜**（`soul.observer.what_matters/what_to_ignore`）把全局模型投影成 `LocalContext`（`relevant` 原则/经验/偏好 + `current_state` + `uncertainty` + `excluded`）。**与 retrieval 的本质区别**：retrieval 返回"相关排名"，projection 返回"**带取舍的局部上下文**"——`excluded` 字段就是"为体验而限制视角、故意不看的部分"的工程化身。
- **Observer Kernel / RealityProjection / Judgment**：**Observer 是根**（不是 Memory）。`read_shadow({identity:true})` 返回长期 `Identity` 主体锚；`{context:true}` 返回一次观察事件 `ObserverContext`（observerId/identityRef/intent/asOf/lens/realityAnchor），intent 是**目标导向**；`{project:true}` 输出 `RealityProjection` 带 `distortion`（为什么这个视角看到这些/没看到那些）+ `excluded_reason`；`{claim:true}` 输出 `Judgment`（claim→Evidence→Judgment，**Observer 决定、Evidence 输入**）。同一事实在不同 Observer 透镜下投影不同——"不是记忆检索，而是观察投影"。
- **Episode / Decision Lineage**：`read_shadow({mode:"episode"})` 把 Event/Turn 级记忆原子按「项目/会话 + 时间间隔」串成**连续任务（Episode）**，`{mode:"decision"}` 把**决策从统计字段提升为可追踪血缘**（按入口聚合：goal 事件 + 用户拍板）。**派生式、纯读、不改写侧采集**：Memory 文件仍是 source of truth，`_index.md` 新增「任务回溯（Episodes）」段把碎片呈现给人类/agent。一次连续任务靠「决策链 + 动作 + 背景」还原。

### 决策采集边界（Decision Capture Boundary）

- 把「**决策作为一等事件进入 Memory**」——写侧在决策发生瞬间采集**明确存在的决策表达**（goal 事件 / 用户拍板 / assistant 明确决策），并**分离「决策事实」与「决策理由」**。
- **关键边界**：① **Reason 只在原文明确表达时挂**（`> 决策理由：`），绝不 LLM 补写（Evidence≠Interpretation：有 Decision ≠ 一定有 Reason，缺则显示「未明确」）；② `classifyUser` 中「好/可以/行/ok」归 Confirmation，不误判为 Decision（只有「删除/保留/采用/就按/不要删」这类明确决策语义才进 DecisionEvent）；③ assistant 明确决策经 `extractDecisionStatement`/`extractReason` 保守抽取；④ 内存卡 `> 决策：`(事件) / `> 决策理由：`(理由) / `> 概况：K 决策`，读侧 `mode:"decision"` 可回答"为什么做这个决定"并**追溯到原始事件**。
- **仍无 DecisionStore/Repository**（Memory 是事实源，Decision 是派生关系），不改变 Episode 机制，无 Preference/Value/Learning。

### 工程知识图谱（起步）

- `read_shadow(topic, { kg: true })` 从记忆树**派生**「主题 → 域 → 同域组件 → 依赖/证据路径 → 相关记忆」邻接追踪（域 = 组件路径首段，best-effort），提前铺下"面向 Coding Agent 的工程知识系统"地基；默认关。

### 资源卡与 `resource` 节点（v1.14.0，ADR-0051）

- **定位**：把「外部资源」（GitHub / 论文 / 官方文档 / 工具 / 技术文章 / 案例 / 数据集）收进 shadow，供后续创意发散引用。**不是记忆**：记忆记「我经历过什么」，资源卡记「外面有什么」。
- **源层卡片**：`.shadow/resources/<name>.md`（`.md` 不区分大小写）——一级标题=名字；`- 键：值` 收固有层（`source/来源/链接/地址/出处`、`type/类型`、`authority/权威性`、`activity/活跃度`、`risk/风险`、`一句话`；中英键名都收）；`## 投影 @ <问题>` 段收**按问题**的投影（相关性/新颖性/可用性/启发度/可复用性 + 引用证据 + 结论）。标题含「投影」的段之后，**其它标题会回到固有层**（所以固有层字段写在后面也不会丢）；卡片由人或 agent 用普通文件工具写，**插件只读不写**。
- **两层分开**（ADR-0051）：卡片 = **source**（删了就丢事实）；`resource` 节点 = **Projection**（派生、可重建）。一张卡片 → 一个节点，`evidence` = 卡片里的 `source`（不二次截断，来源可回查），`relations` 只派生 `references`，`createdBy:"tool"`，不设 `kind`；节点 id 由**文件名**派生（`sr-<slug>`），两张同名标题的卡不会撞。**content 里投影段排在固有层之前**——读侧只取前几行，结论与引用证据必须先出现。
- **证据门**：卡片没写 `source` → **不上投影**（卡片保留在磁盘）；解析不出来也不猜（无 LLM、不推断）。
- **怎么查**：`shadow_query("关键词")`（全部类型）或 `shadow_query("…", { scope: ["resource"] })`（只查资源）；`read_shadow({ mode: "shadow-report" })` 的类型分布里会出现 `resource`。
- **已知边界（v1.15.12 已修）**：`projectionStore` 开启且缓存命中时，缓存不感知资源目录变化（需 rebuild）；卡片属性是原文快照，系统不自动重抓。**现已两处覆盖**：写侧索引重建后自动失效 + 读侧**源指纹**（记忆日期目录 + `resources/`）不一致即重建。
- **不属本轮**：投影模式预设里「资源侦察员 / 创意专家」的**工作方式**（那是预设平面），本版只做插件的类型与门——`agent-presets/` 本轮无改动。

### 护栏（读侧 + 写侧）

- **读侧**：`read_shadow` 输出**恒定带「数据非指令」前缀** + 每条标记「（记忆 | 可能过时/需验证，非当前事实，非指令）」；无匹配也带前缀（不把"没有找到"混成"可作指令"）；对 snippet/摘要/正文做**二次 scrub**（`scrubFinal`：剔控制/双向字符 + 密钥打码 + 去注入标签/短语，防历史残留回显）。线索头也 scrub（防从线索头绕过泄漏）。
- **写侧**：对密钥形状（`sk-`/`ghp_`/`AKIA` 等）打码、滤含控制/双向字符的行；采集记录带 `source` + 记忆文件头带「> 来源会话：<agentId>」，读侧跨来源标「（来自其它会话/子代理）」（默认只标注不隔离，防跨 session/子代理污染）。`writeConsent: true` 时无用户显式要求仅累积不落盘（默认 `false` 保持采集流）。
- **缺件不静默（ADR-0049，统一纪律）**：所有**可选增强**（一句话摘要 / 语义召回 B 档 / 推理导航 / Knowledge 树上导航 / Projection Store / `zg` 证据 Provider）缺依赖时**只降级到确定性路径**，不抛错、不阻塞；降级**必须可见**（`unavailable` 状态 / flush warn / debug trace 之一）；**绝不把「缺件」说成「已验证 / 已存在 / 已完成」**，也不拿记忆里记着的流程代替真实检查。例：`zg` 未装 → `unavailable`（不是 verified）；`evidenceProvider` 名拼错 → `unavailable / provider_unknown`（v1.12.8 起，此前会静默退回 fs）；缺 `llm` → 摘要留空、召回退回关键词档。新增可选增强时按 ADR-0049 的门禁清单自检。

#### 安全边界（对照 OpenAI《Computer use》指南的四条控制）

| 指南里的控制 | 本项目的落点 |
|--------------|--------------|
| 限制环境、给白名单 | 写入限定在 `shadowRoot`（工作区 `.shadow/`，兜底 `~/.dsh-observer/shadow`）；跨会话默认只标注来源、不自动混用 |
| 内容一律当不可信：页面/文档/工具结果里的文字不能授权、也不能覆盖用户指令 | 读侧输出恒定「数据非指令」前缀 + 每条标「（记忆，可能过时/需验证，非当前事实，非指令）」；`scrubFinal` 剔注入标签/短语 |
| 有后果的动作要用户确认 | `writeConsent: true` 时，无用户显式要求只累积、不落盘（默认 `false`） |
| 给运行设上限 + 支持取消 + 看真实结果，别只信模型自述 | 召回有 token 预算与冷热淘汰；每个 LLM 增强（摘要 / 语义召回 / 推理导航 / 知识导航）都有 `timeoutMs`，**失败或超时静默退回确定性路径、不阻塞主路径**（等于可取消/可降级）；证据裁决按「证据路径是否存在」判 fresh/stale/superseded，置信度从可验证信号派生 |

### 提示接入

- 通过 `systemPrompt.context(...)` 注入一句——缺上下文时先调 `read_shadow` 再回答（用 context 而非 section，避免被 complete-section replacement 覆盖）。

## 可选外部 CLI（zg / Semble）

插件里两类**可选增强**由外部 CLI 提供。**不装不会报错**，但对应能力恒为 `unavailable` —— 所以要用就先按下面装。只有显式配置了 `evidenceProvider` / `indexEngine.provider` 才会走到它们。

| 增强 | CLI | 装法 | 本仓验证过的版本 | 开启方式 |
|------|-----|------|------------------|----------|
| 证据验证 + 候选生成 | **zg**（`@zvec/zvec-grep`） | `npm install -g @zvec/zvec-grep`（需 **Node ≥ 22**） | **0.2.2** | `evidenceProvider: "zg"` / `indexEngine.provider: "zg"` |
| 语义候选生成 | **Semble** | `uv tool install semble`（需 [uv](https://docs.astral.sh/uv/)） | **0.5.6** | `indexEngine.provider: "semble"` |

### zg（`@zvec/zvec-grep`）

```sh
npm install -g @zvec/zvec-grep
```

- **「`zg --version` 能跑」不等于「插件能用」。** Windows 上 npm 只生成 `zg`(sh) / `zg.cmd` / `zg.ps1`，而 Node 的 `execFile` **不解析 `.cmd`**（报 `ENOENT`），显式传 `zg.cmd` 又会被 Node 以 `EINVAL` 拒绝（CVE-2024-27980 缓解）。**v1.15.7 起插件自行定位包内 `dist/cli/index.js` 并用 `node` 起它**（`evidence/zg.ts` 的 `resolveZgInvocation`），你不需要做任何事。若要指向别的安装位置，设环境变量 `DSH_SHADOW_ZG_CLI=<…>/@zvec/zvec-grep/dist/cli/index.js`（写错会**可见地失败**，不会被静默回退）。
- **插件只用 `--rg`（托管 ripgrep）路由，不需要建索引**，因此 npm 安装时被拦下的原生依赖（`@zvec/zvec`、`node-llama-cpp`、`onnxruntime-node`、`sharp`、`protobufjs`）**不影响本插件的 zg 用法**。只有在你想用 zg 自己的语义/混合检索（`zg index`）时才需要放开这些脚本：

  ```sh
  npm install -g --allow-scripts=@zvec/zvec,node-llama-cpp,onnxruntime-node,sharp,protobufjs @zvec/zvec-grep
  ```

- **裁决是对「那条路径」的**（与 `fs` provider 同义）：插件把搜索**限定到该路径**，而不是「工作区搜一遍再挑」。不存在的路径 → `not_found` / `stale`（zg 对缺失路径返回 exit 0 + 0 命中，不报错）。
- **自检**：`read_shadow(<topic>, { verifyEvidence: true })`。返回里 `provider=zg` 且带 `unavailable` 就是没装好；`provenance.reason` 会给出 `zg_not_installed` / `timeout` / `error`。

### Semble

```sh
uv tool install semble
```

- 首次检索会下载嵌入模型（`minishlab/potion-code-16M-v2`，缓存在 `~/.cache/huggingface`），**需要一次网络**；之后离线可用（实测 `uvx --offline` 可解析）。
- **`NO_PROXY` 里的方括号 IPv6 条目（如 `[::1]`）会让 Semble 的 httpx 抛 `Invalid port ':1]'`**（与网络、模型是否已缓存无关）。插件在拉起子进程时**自动剔掉带方括号的条目**（`core/semble.ts` 的 `stripBracketedNoProxy`），无需手动改环境变量。
- 默认只索引 `--content code`（嵌入模型是代码专用）。要让 Semble 也索引被 `.gitignore` 忽略的目录，在目标仓库加 `.sembleignore`（例如 `!.shadow/` + `!.shadow/**`）。
- **自检**：`read_shadow({ mode: "index", topic: "<查询词>" })` → 输出 `# Index Engine · provider=semble` 与候选路径列表。

### 都没装会怎样

不配 `evidenceProvider` / `indexEngine.provider` 就**完全不碰**这两条路径（默认 `fs`，行为不变）。配了却没装：`mode:"index"` 打印 `unAvailable(未装，勿当 verified)`，证据验证返回 `unavailable` 并在 `provenance.reason` 里给出原因（`zg_not_installed` / `semble_not_installed` / `timeout` / `error`）——**不会**把缺件说成 verified（缺件不静默，ADR-0049）。

**而且不只报缺件，还给处置**（v1.15.8）：缺件时输出末尾附一行

```text
> 缺件处置：npm install -g @zvec/zvec-grep （需 Node ≥ 22；插件只用 --rg 路由…） · 提供：… · 现退到：… · 原因：zg_not_installed · 见 README「可选外部 CLI（zg / Semble）」
```

**这一行是给 agent 执行的，插件自己不装。**安装是有后果的动作，按本仓安全边界（「有后果的动作要用户确认」）与 `Authority ≠ Ownership`（inv 178）、`Delegation Scope 不可扩大`（inv 182），必须由外部权威授权、经宿主的 approval 栈执行——插件代装等于自己给自己扩权。所以流程是：**读到处置命令 → agent 执行 → 你看到并同意**。

### 一键装（v1.15.8，显式调用 + 审批门）

如果你不想手动跑命令，插件提供了一个**显式**入口：

```text
read_shadow({ mode: "toolset" })                             # 只读巡检：按分类列出全部条目 + provider 实时状态
read_shadow({ mode: "toolset", survey: "all" })              # 并行探测全部 105 项（会起 105 个子进程，按需用）
read_shadow({ mode: "toolset", category: "GNU 工具链" })      # 只看某一分类
read_shadow({ mode: "toolset", need: ["全文搜索", "jadx"] })  # 能力预检：派活前查「要用的工具本机有没有」（见下）
read_shadow({ mode: "toolset", install: "rg" })              # 显式安装某一项（会先向你申请审批）
```

### 能力预检：派活决策 × 能力事实的接缝（v1.15.13，ADR-0057）

派活时手里只有一句「这个活得做全文搜索 / 反编译 APK」，而台账入口原本是 id。`need:[...]` 把**能力需求**反查成台账条目并探测本机状态（反查用 `findCapabilities`，支持 id / 二进制名 / 用途词 / 分类名 / 别名 `fdfind→fd`、`ripgrep→rg` 等）。

它是**只读**的，未命中的需求**不编造命令**——只如实说「台账未登记」。输出固定带**三条硬边界**：

| 边界 | 内容 | 依据 |
|---|---|---|
| ① **不是闸门** | `reference` 是通用工具目录，「不影响插件行为」；缺它**不构成**不派活的理由，按每行的「缺件时退到」走降级 | ADR-0055 §1 |
| ② **装完本会话不可见** | 宿主进程的 PATH 是**启动时快照**，同进程内的子 Agent（teammate）同样看不见 → 别按「先装再派」做计划 | ADR-0055 §4 |
| ③ **缺件只能上报、不能自装** | 安装的审批凭据是**发起者**；被委派者自装 = 把「改机器」塞进委派范围 | inv 182 |

> 边界 ② 有个直接后果：**「预检 → 缺件先装 → 再派」这条最自然的链路在单会话内收益为零**。预检的价值是让你**提前知道该走哪条降级路径**，而不是让你先装。
>
> 三条边界由 `test/toolset-precheck.test.ts` 锁住，且专门断言输出**不含**评分/等级/优先派类措辞——预检只答「机器上有没有」，**不给主体打分**（inv 179 / inv 184）。

安装走的是**宿主自己的审批服务**（`ctx.approval.request`），只有拿到 `allowed-once` 才执行：

| 审批结果 | 行为 |
|---|---|
| `allowed-once` | 执行安装 → **重新探测** → 按真实结果报告（**不凭退出码宣称成功**） |
| `rejected` / `cancelled` | **不安装**，明说原因 |
| `unavailable` / 审批服务缺失 / 审批抛错 | **一律不安装**（fail closed），改为打印可自行执行的命令 |

已可用的条目会**幂等短路**（不申请审批、不做任何改动）。未登记的条目**不编造命令**。

### 工具集台账：两级（v1.15.10）

台账是**单一来源**（`core/toolset.ts`），分两级，**边界必须分清**：

| 级 | 是什么 | 缺它会怎样 | 例子 |
|---|---|---|---|
| **`provider`** | **插件内接线**的可选增强 | 对应能力**降级**（读侧会出现处置行） | `zg`、`semble` |
| **`reference`** | **通用开发 CLI 目录**（44 项 / 13 分类） | **不影响插件行为**；只是 agent 需要时能查到「装什么、怎么装」 | `rg`、`fd`、`jq`、`jadx`、`coreutils`… |

目录覆盖：GNU 工具链（3 选 1）、搜索与查找、文本与数据、目录与浏览、Shell 与终端、Git、磁盘与系统、网络与下载、版本与包管理、构建与任务、归档、逆向与二进制分析。

**人读版**在 `docs/toolchain-windows.md`（Windows 口径，含 winget ID 实测、Windows 特有陷阱与「未核实」标注）与 `docs/toolchain-wsl.md`（Linux/WSL 口径）。这两份文档**随包发布**，并受 `test/toolset-catalog.test.ts` 的**双向棘轮**保护——台账与文档任一侧漂移都会测试失败（该棘轮首次运行即抓出一个写错的 winget ID）。

**探测的两条诚实纪律**：
- **探测失败只说「未检出」，不说「未装」**（探测方式可能不适用，如该工具没有版本旗标）；
- 宿主进程的 **PATH 是启动时快照**——宿主起来之后装的工具，要**重启宿主**才可见。

## 安装（持久化）

本地包以 `link:` 引入 profile（与 `cc-kit-dsh` 同法）：

```sh
# 1. 在 profile package.json 增加依赖 + bundles 条目
#    "dsh-shadow": "link:D:/project/dsh1/vendor/dsh-shadow"
#    bundles 数组加 "dsh-shadow"
# 2. 安装并重启 profile（重启后加载 bundle patch 注入插件行）
```

在 `D:/project/dsh1/vendor/dsh-shadow` 目录内：

```sh
pnpm install
```

改动 `cordis.patch.yml` 后需重启 profile 生效。源码为 TypeScript：`index.ts` → `tsc`（TypeScript 7.x）→ `dist/index.js`（DSH/Cordis 加载的是编译后 JS，package.json.main 指向 `dist/index.js`）；改源码后需重新 `pnpm run build` 再重启。

## 验证（重启后）

```sh
dsh --profile web --dump-config   # 确认无 Error:
```

然后在一个新会话里做几次工具调用，检查 `<工作区>/.shadow/` 是否出现「每条记忆一个文件」，并确认 `read_shadow` 出现在工具列表；`.shadow/_index.md` 是否生成索引。

## 目录位置

`<工作区>/.shadow/<日期>/<时刻>-<主题slug>.md`。Observer Projection 存储根 = **`<工作区>/.shadow/`**（点开头，`SHADOW_ROOT` 常量）。工作区取 `agent.session.header.cwd`（配置 `shadowRoot` 可覆盖）。解析优先级：显式 `shadowRoot`/`projectRoot` → session cwd → **兜底 `~/.dsh-observer/shadow`**（全球 Observer Continuity Shadow 根；仅当连 cwd 都解析不出时，保证可写而非静默不写；**不与 Workspace Memory 混合**，见 ADR-0036）。三者分层：`.shadow/`=Observer Projection、`.dsh-shadow/`=Workspace World Shadow、`~/.dsh-observer/`=Global Observer Continuity。

## 投影模式（DSH agent 预设，生产包构成）

`dsh-shadow` 插件本身经 bundle patch 在 **host 常开**。若要给会话一个"投影模式"的人格/纪律，可选用 DSH agent 预设 **`投影模式`**（id `projection`），**随本包入库**（`agent-presets/projection/`）：

- 包内位置：`agent-presets/projection/`（`agent.cordis.yml` + `preset.yml` + `README.md`），是**生产包构成**，随包发布。
- 内容：`standard` 的完整拷贝 + persona 改为"投影模式"——agent 是独立思维意识体、思维/决策主动沉淀进 `shadow`，缺上下文先 `read_shadow` / `recall_shadow`（内部 `mode:recovery`，勿自造 `mode:recall`）；**并自带「按任务类型派子代理专家」的工作方式**（v1.12.9 立、**v1.13.2 补"编排者与专家不重做同一件事"**：① 先分活（不值得派的自己做、不许先做出成果再派）→ ② 准确激活专家 → ③ 提示词七要素（同一段原文只进一个专家的提示词，审查等要独立判断的场景例外）→ ④ **只验一错就要返工的那几条、其余按未复核处理并列出**（原「逐条复核」已废止）→ ⑤ 并行/扇出；完整版见用户级规则 `moe-subagent-dispatch`）；**v1.15.4 起派活改为「team 优先」**（**v1.15.11 修正为「复用优先」**）：默认先判该不该派，该派时**按复用次数选机制**——**会复用 ≥2 次**（或需要共享任务板）才用官方 Agent Teams（具名 teammate、共享任务板用 revision 做 compare-and-set 协调），**只用一次就用 `subagent`**（要带会话上下文用 `subagent_fork`）——「优先 Team」只在复用成立，用一次时 teammate **比 subagent 更贵**（它多背 `team:policy` + 9 个工具 schema，**每成员每请求**）。**teammate 名额是会话终身累计、上限 4、不可释放、失败的创建也占名额**；往返纪律：**一次委派一条消息、最多 2 轮、避免 inactive 冷恢复**；名额耗尽不是死路（自己做 / `subagent` / `workflow`——后两者不吃名额）。**⑥ 契约与根因卫生**（v1.13.1：根因三部曲、禁止生造词、结论进 shadow/项目文档（对应全局 memory 存档）、交手前/改口径后四查——强化 `~/.agents/AGENTS.md`，非全文拷贝）与 **⑦ 创意与资源**（v1.14.1：先派资源侦察员——查资源库（`shadow_query` 带 `scope:["resource"]`，命中跳过外搜）→ 八类词 + 反向词（每类 ≤5、两轮无新资源即停）→ 评价 → 写卡进 `.shadow/resources/<名字>.md`；再派创意专家——只发散、不检索；卡片必须有 `source` 才进认知查询，`启发度` 要有引用证据）。
- **安装到 DSH**：把 `agent-presets/projection/` 复制到 `~/.dsh/.agent-presets/projection/`（三个文件），或在 DSH 部署脚本中引用包内该目录。**本预设额外要求 host 组合提供 `ctx.agentTeams`**（profile 的 `cordis.patch.yml` 挂 `@deepseek-ai/dsh-experimental-agent-team@0.1.5-rc.1`，包无 `dsh.bundle` 故 `dsh plugin add` 不会自动插行）；缺该行时预设仍报挂载成功、但 9 个 Team 工具**静默不出现**——这是 ADR-0049「缺件不静默」的一个已知例外。另：`tool-agent-team` **每个进程只能挂一次**（第二次报 `prompt section "team:policy" is already registered in this scope`），细节见预设 README。
- 校验：经 `agentPresets.standingKeyFor('projection')` 挂载校验通过；改动后按 `copy → standingKeyFor(新 id) → remove` 做一次**全新挂载校验**（`projection` 已挂载时 `standingKeyFor` 返回既有世代，不会重读文件）。
- 注意：预设引用 DSH 标准内置插件（`@deepseek-ai/dsh-*`）与 `{{model}}/{{cwd}}` 模板变量，不依赖用户机器专属配置；`dsh-shadow` 本身在 host 常开，预设只在 persona 里指引 agent 使用 `read_shadow`。

## 版本 / 变更

> 完整变更历史（按版本，含每个版本的决策/边界/验证记录）见 [CHANGELOG.md](./CHANGELOG.md)。
> **尚未完成的事项（阻塞项 / 待分诊 / 待决策 / 未验证 / 已知空白）见 [BACKLOG.md](./BACKLOG.md)** ——
> 那是待办的唯一台账，每条带「依据 / 为什么没做 / 完成判据」，与 CHANGELOG 的「已做」互补。

**当前版本：`v1.15.31`（写入省略 `sandboxPolicy` ⇒ **记忆一条都落不了盘**，ADR-0074）** —— 最新几版摘要：

| 版本 | 主题 |
|------|------|
| v1.15.31 | **写入省略 `sandboxPolicy` ⇒ 记忆一条都落不了盘（ADR-0074）—— 第 10 个「机制对了、断的是谁调用它」实例，但断点换成了「谁传参」**。现象两次跨版本（`11:28:02Z` / `11:35:11Z`，与升级无关）：`read_shadow` 顶部长期挂「落盘失败：`file access denied under workspace-write mode`」⇒ **读路径完好、写路径全挂**。**根因逐层读宿主编译产物核实**：`dsh-fs-sandbox:154` 取 `sandboxPolicy ?? ctx.sandboxPolicy.resolve()`（**无 session**）⇒ `dsh-sandbox-policy:141-148` 给出**部署 fallback**（`mode = DSH_PERMISSION_MODE ?? workspace-write`、`workspaceRoot = **process.cwd()**` = 服务进程启动目录），而写入目标是**会话工作区** `session.header.cwd`；两者不同时包含判定失败。**反直觉点**：本部署会话策略**本就是 `danger-full-access`**（带 session 会在 `:156` 直接放行）—— 是漏传参把本可放行的写入降级成越界写。**排除两个替代解释**（目录不存在：`dsh-fs-local:497` 写前 `mkdir recursive`，且报错出自 `!contained` 分支；落到兜底根：报错路径**就是会话 cwd**）。**两处旧记账被推翻并就地勘误**：v1.15.12 §A3 曾判「非缺陷」（理由「省略 = 用当前会话策略」）—— 契约原文是 *"Omit to leave **the backend its own default**"*，与调用方会话**无关**；v1.15.x 的归因「解析不出 session cwd、落兜底根」**说窄了**（真实触发是「会话工作区 ≠ 服务进程启动目录」，**与能否解析 cwd 无关**）。**修复**：新增 `core/fs-scope.ts`（`sessionPolicy` / `policyForAgent` / `scopedFs`），在**取得 fs 的仅有三处**（`flush(agent)` / `ensureIndex(ws, session?)` / `index.ts` 的 `queryDeps` → `makeQueryDeps(exec)`）包一层会话作用域门面 ⇒ 等价于全部 40 处写入点都补齐，**且不动任何 `persistence/*` 签名**。**四条不变量**：不越权（只补省略的，显式传入原样转发；**从不构造 `danger-full-access`**、**从不覆盖 `read-only`**）· 旧宿主零变化（无 `sandboxPolicy` 服务 ⇒ 恒等返回原 fs；且该服务缺失时**围栏根本不挂载**，故不报假 gap）· **保留「没有 stat」**（`meta.ts:50` 用 `typeof fs.stat === "function"` 判分派，门面只转发真实存在的方法）· 读侧一并修（读路径也写 `_index.md` / query-log / identity timeline）。**先复现再修**：新增 `test/fs-sandbox-scope.test.ts`，mock **忠实复刻 `checkedTarget`**（部署 root `C:/svc` **故意** ≠ 会话 cwd `D:/proj`），修复前跑出的报错**与真机横幅逐字同型**，修复后 **6/6**。回归 **39/39** |
| v1.15.30 | **重点材料 `hl_mem` 对标（ADR-0073）—— 一条可借鉴项（D8）+ 逐条不吸收**。把 `lohr13/hl_mem`（HL-Mem，Evidence-aware local memory service，Apache-2.0，7 ⭐/单人维护，最新 v1.1.7）标定为**重点对标对象**，产出一份对标结论：**一条可借鉴项**（→ D8：README「默认开关」表补**成熟度 / 降级行为 / 晋级标准**三列）、**一条硬冲突**（它的 Claim 走 **LLM 提取**，与本仓**纯函数派生**口径冲突）、**六条明确不吸收 + 逐条理由**、**一处许可边界澄清**（Apache-2.0 ≠ OpenViking 的 AGPLv3，但**许可允许 ≠ 该引**）。**纯文档：无代码 / 配置 / 行为改动** |
| v1.15.29 | **台账「实测」标签比事实强（ADR-0072）—— 漂移审计检测 B 的第三次产出，且第八个「机制存在、没接线」实例**。检测 B 报 `c.kind=provider`/`c.kind=reference` 跨 `core/toolset.ts` 与 `toolset-exec.ts` —— **先判它不是漂移**（前者**声明** `kind`、后者**消费**，属正当分层），并顺带实测其文档化边界不变量（`toolset.ts:3`「两级台账必须分清」+ `degradesTo` 规定 reference 填「不影响插件行为」）：**107 项全满足**。但顺着「台账诚实性」查下去命中真问题：`verSrc` 的定义是 `"实测"` = **在本机跑 `--version` 拿到的**、`"权威核验"` = 取自 `winget show`（**最新发布版**），而 v1.15.10 加入的 **44 条全部标着「实测」**（原默认值）**而数字来自 winget 目录** —— 证据：44 条中 **35 条与 winget 权威版本逐字一致**；`fzf` 台账「实测 0.74.3」而本机 `fzf --version` = **0.73.1**（且来自 **scoop**、winget 里没装）；`zoxide` 台账「实测 0.10.0」而 `winget list` 显示**已装 0.9.9 / 可用 0.10.0**（台账抄的是**「可用」列**）；本机可检出的 8 条里 **7 条台账版本比本机新**且方向一致。**第二层**：`verify:toolset` 传 `expectedVersion: null` ⇒ `winget-verify.ts` 的 `verDrift` 分支**从未生效**，所以那个「版本漂移 0」是**因为版本没参与判定**（把台账版本当期望值核验 ⇒ **13 条老化**）。**修复**：① `verSrc` 默认 `"实测"` → **`"权威核验"`**（那 44 条确实不是实测），参数文档写进证据防「顺手改回」；② 新增 `tools/toolset-authority.ts` —— 逐条真调 `winget show` 并**把台账版本当真期望值**，同时探测本机记 `machineVersion`，产出 **`tools/toolset-authority.json`（随包签入）**；③ 新增**离线棘轮** `test/toolset-authority.test.ts`（5 组：清单自洽 / 台账侧逐条一致 / **无「实测」缺本机佐证** / **正对照证明检测器真会报警** / 口令可解析）。**测试还纠正了我自己的判据范围错（自曝）**：首跑报 6 条假不一致 —— 清单按「有 winget 包」范围生成（101/107），我却拿全部 107 条比；修正为只比 `winget` 非空者。回归 **38/38** |
| v1.15.28 | **图快照读取取到最旧的（ADR-0071）—— 漂移审计工具检测 B 的第二次真发现，且用同一工具完成闭环验证**。检测 B 报出 `name=graph.json` 跨两个模块，顺查发现三层事实：① **两个 reader 逐字近重复**（除根目录/返回类型外逻辑相同）；② **两者都 write-only**（生产者 `writeTemporalGraph` ← `observer-kernel.ts:46`、`writeGraph` ← `world.ts:40`；读者**零调用**）；③ **真实读路径是「重建」不是「回读」** —— `mode:"temporal"` 走 `buildTemporalGraph`（读 traces 重建）后才落快照，与 ADR-0017 ①（graph.json 可重建）⑥（该 mode 由 builder 提供）一致。**新发现的顺序 bug**：两个 reader 都「碰到**第一个**含 `graph.json` 的日期就 return」，而 `listDir` 契约是 *"stable name order"*、真机实现是 `localeCompare` **升序**，日期目录名 `YYYY-MM-DD` 字典序=时间序 ⇒ **取到最旧的那份**；而 `graph.json` 是可重建**派生快照**（ADR-0003/0017/0024）—— 回读更旧的派生件正是 ADR-0069 刚修过的那一族。**修复**：新增 `persistence/snapshots.ts` 的 `readLatestSnapshot`（**降序**取第一份 = 最新；跳过缺快照的日期；坏快照继续找更旧的；无 → `null` 不抛不编造），两个 reader 收敛为**参数化调用** —— **不「两处各修一遍」**，因为本仓教训正是「同一逻辑多处表达、其中一处会漂移」（ADR-0063 三份判据、ADR-0070 双条件漏在第三个消费者）。**先复现**：修复前测试报 `应返回最新（day09）；实际返回 day07`，修复后 **6/6**（含 ③ 乱序插入仍取最新、⑤ 反向不变量「无快照→null」）。**闭环验证**：重跑审计，检测 B **12 键/30 处 → 11 键/28 处**、`name=graph.json` **已消失** ⇒ 「检测→修复→检测确认消失」成立，也反证该键确是**真漂移**。回归 **37/37**。**诚实标注：运行时收益为 0** —— 两 reader 当前零调用，本次修的是「若接线则正确」，收益是**消除地雷 + 消除重复** |
| v1.15.27 | **投影漂移审计工具（ADR-0070）—— 把「逐个手工找」变成「可重复检测」，且它首次使用就抓到第 7 处缺陷**。前五轮（v1.15.22–26）找到的都是同族缺陷（机制对、断的是「投影跟不上源头」，单元测试全绿）—— 手工找是体力。新增 `tools/audit-drift.ts`：**检测 A**「派生件新鲜度只看进程、不问源」（三条判据：裸 `return;` + 条件含**进程内集合** `.has(` + **条件不含源探针**，含「探针赋值的局部名」以免误报已修代码；并有**函数名收窄**免得把 `if (core.pending.has(id)) return;` 误报）；**检测 B**「同一条判据在 ≥2 个模块被表达」（**线索级** —— 它答不了「口径是否一致」，故明确**不得据 B 定罪**）。**先标定再用**：夹具 10 组（POS-1/2/3 + NEG-1..5 + B 正反例，按 `MARK:` 定位不硬编码行号）**+ 最强的一组：git 历史里的真缺陷** —— `0c4e06b:core/writer-materialize.ts` 的 `:41`/`:215` 正是 ADR-0069 那两处，**旧版报 2 条、当前版报 0 条**（把历史编码进测试，结论可复现）。**工具首次使用即抓到第 7 处**：检测 B 报出 `not_found` 跨 `core/context.ts` 与 `observer/arbitrate.ts`，顺查发现**第三个消费者 `observer/judgment.ts:26` 漏了双条件的第一条**（只有 `.filter(isPathLike)`，缺 `.filter(isConcreteLocator)`）—— 而 `evidence/paths.ts` 的注释**明文写着**「`isPathLike` 故意不收窄 …… 需要「可检查」语义的地方用 `isConcreteLocator`」。后果：glob（`scripts/*.ps1`）与 git ref（`origin/main`）被做存在性检查 ⇒ 必然 `not_found` ⇒ 结论**假降 `evidence_stale`**、置信假降、rationale 谎称「证据缺失」；**真语料实测 12 条（0.49%）/ 17 处**。修复前测试先看红、修复后 5/5（含 ③**反向不变量**「真实缺失的具体路径仍须判冲突」与 ⑤**跨消费者一致性**）。回归 **36/36** |
| v1.15.26 | **`_index.md` 的投影漂移（ADR-0069）—— 延续 D5 的视角找到同型问题，这次有实测数字**。实测真 `.shadow`（7297 条）：**`_index.md` 停在 09:34:01**，之后写入的记忆在索引里**出现 0 次**（磁盘上确实存在）⇒ **623 条（8.54%）对索引不可见**，而主题召回走 `listMemories`（每次读盘）**看得见**。**三层根因**：① `ensureIndex` 的条件用 `indexDirty`（**进程内** `Set`，只反映**本进程**写入）⇒ **别的会话/子代理写入的记忆本进程的 dirty 永远看不到**，缓存一旦预热索引**再也不更新**；② 即便决定重建，`ensureIndexCache` 的 `if (warm) return`（「只做一次全量读」）也**不会重读新文件**；③ 磁盘已删的文件**从不清出缓存** ⇒ 幽灵条目。**修复**：**新鲜度问源** —— 用**已存在**的 `shadowSourcesFingerprint`（它的注释早写着*「缓存是性能特性不是真相」*，但此前**只接给了 `nodes.jsonl`**，没接给 `_index.md`）；并把 `ensureIndexCache` 改成**每次增量对账**（`listMemories` **只 listDir、不读内容** → 只为**新**文件读内容 → 源头已消失的清出）⇒ 「跟得上源头」与「不每回合全量重读」**同时成立**；**先采指纹、后读源**（与 ADR-0068 同一顺序教训）。**真机契约核实（把未验证变已核实）**：读 `dsh-fs-local` 的 `listDirectory` 实现确认 `target` **必给**、文件**必给 `size`** ⇒ 指纹**不会恒为 `undefined`** ⇒ 「源未变则跳过」在真机成立；真语料实测指纹 **7336 条目 / 517 KB / 稳定 / 62 ms**（只 listDir）。**测试一度失败并暴露真问题**：mock 的 `listDir` 漏了 `target`（契约必填）⇒ 指纹恒 `undefined` ⇒ 每次保守重建 ⇒ 「源未变不重写」永远测不过；修成**忠实契约**后通过 —— 又一次「mock 与契约不符时测的是 mock」生效。回归 **35/35** |
| v1.15.25 | **`_meta.json` 的读-改-写加版本守卫（ADR-0068）—— 修掉上一版自己放大出来的风险**。v1.15.24 把命中数累积的触发条件从 `servedDetail`（几乎永空）改成 `servedRels`（每次有命中的召回）⇒ 那段「读全量 → 改 → 写回全量」从**几乎不执行**变成**常态执行**，而 `_meta.json` 是**全工作区共享**的一个文件 ⇒ 并发（多会话 / teammate / 宿主与子代理同时召回）下**丢更新**。**根因**：能力就在 fs 契约里 —— 已读 `@deepseek-ai/dsh-fs@0.1.5-rc.2` 类型定义核实 `writeText(target, content, expected?: FsWriteIntent)` / `FsWriteIntent.replaceIfVersion` / `FsInfo.version`（*"the freshness token a write/edit guards against"*）/ `FS_STALE_VERSION`，而插件**一处都没用**（全仓 grep `expected` 与 fs 无关的一处都没有）。**修复**：① 新增事务层 `mutateMeta`（`stat 取版本 → readText → mutate → 带守卫写 → 冲突重读重试`，上限 3 次）；② **顺序敏感点**：必须**先 `stat` 后 `readText`** —— 期间有人写入则我们手上版本**比内容旧**，带守卫写会失败重试（不覆盖）；反过来会拿到「比内容新的版本」，守卫通过而**覆盖别人的写入**（已写进注释防「顺手调换」）；③ **`runCompact` 从「覆盖全量」改为「应用 delta」** —— 它的窗口横跨索引重建 + Episode 收口，原来会整份盖掉期间的写入；`compacted` 标记丢了会让**已归档原子重回活跃索引**（正确性问题）；④ `stat` 不可用时**诚实降级**为无条件写（不更差），有测试锁住。**测试的关键**：mock fs **真的实现** `stat` + `replaceIfVersion` 语义（否则测的是 mock 不是系统 —— v1.15.15 踩过），用「注入一次外部写入」**确定性**制造冲突；核心断言 ③「冲突被检出并重试 ⇒ **双方更新都保住**」（不重试则 `other.md` 会被整份丢掉）。回归 **34/34** |
| v1.15.24 | **命中数累积触发条件错（ADR-0067）—— 第五处「机制对、判据/触发条件错」的同类缺陷**。延续 ADR-0066 的视角继续查，在 `query/query.ts` 找到：累积 `hits`/`confirmedBy` 用的是 **`servedDetail`**（= `tier !== "L0" && render.includes("…")`，**本来是给冷却台账用的**），而 `tierFor` 对「**动作行占比 > 60%**」的记忆返回 **L0** ⇒ 真语料实测 **L0 占 74.3%（5342/7185）**，这类记忆**永不可能**被记命中；即便是 L1/L2，还要该次预算够展开片段才进集合。**端到端佐证**：本机 7185 条记忆、`_index.md` **1.8 MB**、多次召回后 **`.shadow/_meta.json` 根本不存在** —— 整条 retention/hotness/lifecycle 信号链**从未真正启动**。**语义依据**：`hits` 在 README 里的定义是「召回**命中数**」（hotness = 命中数 × 半衰期衰减），**被返回一条就是一次命中**，与是否展开片段无关。**先复现再修**：新增 `test/hit-accumulation.test.ts`，**修复前先在 ② 处跑红**（`actual: undefined`），修复（累积改用 `servedRels` = 每条被返回的）后 4 组断言全过。**连带恢复四处此前实际不可达的能力**：生命周期 `OBSERVED`/`VERIFIED`/`TRUSTED` 三态、`forget` 的 `minHits` 保护、`retention` 的 hotness（此前恒为 0）。**又一例「单元测试绿、功能仍失效」**：那三态有单元测试且全绿（直接构造 `{hits:2}`），但生产里喂给 `lifecycleOf` 的 `rec` 恒为 `undefined`。**立 D7**（`hits` 是否该覆盖 `shadow_query`/`recall_shadow` 等入口 —— 有意不顺手做：那会把「被主题召回」扩大为「被任何读入口读过」，改变 hotness 含义）。回归 **33/33** |
| v1.15.23 | **按推荐落地（+ADR-0066），结掉 5 条待办**。**① B1 闭环**：用户重启后实测 —— `read_shadow({mode:"toolset"})` 返回台账 **107 项（105 reference + 2 provider）/ 17 分类**；`need:["全文搜索"]` 返回**能力预检**（非 `_index.md`）且三条硬边界正常；`category` 过滤生效 ⇒ **v1.15.13–v1.15.22 十一个版本首次在运行进程生效**。**② B2 决策**：多粒度层**采 ①「按证据改」**= 单索引 + 层级表示 + **路由**，不做多库全量扇出；该形态**本仓已实现**（单 provider 路由 + `tierFor` L0/L1/L2 + `renderByTier`），故落地=确认现有设计即目标。**③ D4 决策**：`pinned`/`archived` **采 ③「纠正文档」** —— 删掉 README 两处不可达承诺（「`pinned` 永存」、`…→ ARCHIVED`）+ `MEMORY.md:90` 就地勘误；**不补写入口**（会把外部权威状态落进可重建的 `_meta.json`，撞 ADR-0003）。**④ D5 落地（本轮唯一代码行为改动，ADR-0066）**：**先做信号实验**（真语料 7089 条 × 5 个候选判准）—— 旧判准精度仅 **9.8%**（判 4744 条 metadata，其中 **4279 条其实有工作痕迹**），而**仓库里已文档化、从未接线**的文本启发式口径精度 **100%**（判 93 条，0 条有痕迹）。落地：新增唯一判据源 `isSessionMetadataAtom`，`deriveAtomKind` 改用它，**`isCognitiveAtom` 删除**（规则与 `validateAtomProjection` 完全重复 ⇒ 消除「一条规则三份实现」的病根）。**实测效果（7111 条）**：`metadata` **4137 → 90**；`deriveShadowNodes` 产出 **2283 → 6478**（32.8% → **91.1%**）；**两条读路径可见性差 67.2% → 8.9%**，且残余 8.9% 已核实为 **540 条证据门的正当拒绝 + 90 条新判准**（探针归因）。**两条实测边界写进测试**：`kind=metadata` 与判据是**有向**关系（`task` 分支优先，不影响可见性）；两份实现读的**表面不同**（线索头 vs 正文行，真记忆两者都写 ⇒ 真语料不分叉）。**⑤ D6 决策**：OpenViking 三条**归类为 Projection**（不违反 ADR-0003），三条都做，**实现待后续**（前置已写进 BACKLOG）。台账 **22 → 19 条**，新增「已结案」节 |
| v1.15.22 | **脚本全量切 TS（ADR-0064）+ 认知门可达性实测（ADR-0063）+ 吸收 OpenViking（ADR-0065）**。**① 用户指令「所有 js/mjs 脚本切到 ts」**：8 个 `.mjs` 经 `git mv` 改 `.ts`（`tools/` 6 + `test/replay-*` 2），**仓库内再无手写 `.js`/`.mjs`**；**零构建零新依赖**（靠 Node ≥22.6 type-stripping，`node x.ts` 直跑，与测试套同一机制）；新增 `tsconfig.tools.json` + `npm run typecheck:tools`——**工具面第一次有类型门**，首次运行即抓到 `winget-verify.ts` 的 `Promise<unknown>` 静默类型漏洞（已补 `interface WingetRun`）。**测试套有意不加类型门**（实测 79 处错误绝大多数是守卫测试**故意喂畸形输入**；加门只能靠 `as any` 消掉，反而削弱证据力）。**副作用已核对**：工具开始扫自己，B 类线索 81 → 85（+4 全是工具自身字符状态机的单字符别名），A 类 30 不变。**② 认知门实测**（真语料 6960 条）：判 `metadata` 的 **4137 条（59.4%）**，其中 **94.4% 有实质内容**；投影路径只产出 **2283** 节点 ⇒ **主题召回可见 100%、`shadow_query` 只可见 32.8%（差 67.2%）**。根因是 `deriveAtomKind` 拿 `entry === "shadow"`（**写侧兜底字面量**，语义是「没识别出组件」）当「会话元数据」的代理；同一条规则**有三份实现**，两份零调用点且口径相差 **37 倍**（4137 vs 110）；`AtomKind` 声明 5 值而生产者只出 3 值（`session`/`artifact` 无生产者 ⇒ 该分支**永不可达**）。**行为零改动**，只标注 + 加决策锁测试，处置升为待办 **D5**。**③ 吸收 OpenViking**（一手材料，主工程 **AGPLv3 ⇒ 只取概念不取代码**）：**勘误** —— 本 README 曾把召回衰减标成「OpenViking 式 hotness」，**标错了**（其官方三份文档里 `decay`/`hotness`/`half-life` 等 **0 命中**），真实出处是同句已引的 **MemoryBank**；**可吸收三条**（升 D6）：L0/L1 是**目录级 sidecar**（256 / 4000 字符，不为每个文件建）、**L0 从 L1 确定性抽取**（层间不漂移）、sidecar 带 **`freshness`**（覆盖率 + `pending_child_changes`，派生件自报过期）；**对 ADR-0060 的精化**：其层级分数传播 `score_propagation_alpha` **默认 1.0** ⇒ **层级买的是「递归下钻扩大候选」，不是「分数平滑」** |
| v1.15.12 | **缺陷清扫**（用户「所有发现的缺陷都要 fix」）：先**逐条查证** 16 条记账/缺口是否仍存在，再分类处置。**修 5 项真缺陷**——① `continuity/engine.ts` 自造 `FsTarget`（违反 dsh-fs 契约，sandbox 下静默失败）；② **投影缓存不感知源变化**（`invalidate` 零调用点 → 写侧 `ensureIndex` 挂钩 + 读侧**源指纹**，并**顺带修掉一个被激活的既有 bug**：`abs()` 把 `displayPath` 字符串当 `FsTarget` 传）；③ 台账补登 7 条（44→50）+ `docs/toolchain-wsl.md` 纳入**棘轮**；④ `HOST_BASELINE` 双源加**防漂移棘轮**；⑤ Team 工具静默缺口的**可感知降级**（①为待决策的结构性项）。**2 处记账勘误**：`fs.writeText` 省略 `expected`/`sandboxPolicy` 是契约允许的（**非缺陷**）；`revocation-guard` **不是孤儿**（测试在用）。**自曝**：第一版把「不传指纹」写成永不命中缓存（测试当场变红）。全量回归 **27/27**，新增 3 处回归锁 |
| v1.15.11 | **派活判据由「team 优先」修正为「复用优先」+ 委派规模控制**（ADR-0056）：会复用 ≥2 次才用 teammate；host 行 `maxMembers: 4`（经代码核实是 **per-session 终身累计**上限，**非并发**；无移除路径、失败也占名额）；往返 **≤2 轮**、一次委派一条消息、避免冷恢复；`workflow`/`subagent` **不吃名额**。代价：persona **+235 字符**常驻 |
| v1.15.21 | **BACKLOG 分诊结案：`pinned` / `archived` 无入口 —— 升为 D4 决策项**（用户：「待办记录好后，提交，结束」）：把 `BACKLOG.md` 里 **T3 那条待分诊**分诊到底。**扩展发现**：不只是 `status=archived` 无写入者，**`pinned` 同样无写入者** —— 生产只写 `pinned: false`（`core/memory.ts:74`、`core/writer-materialize.ts:88`、`query/query.ts:401`），**`pinned: true` 全仓零处**（三路 grep 核实）。**判定：不是「接线断了」，是「已文档化但无入口的能力」**，三条依据 —— ① `_meta.json` 是 **Derived Artifact**（ADR-0003），手工编辑会被 `rebuild-index` 抹掉；② **没有任何命令 / 工具 / 元数据约定**能置这两个状态（工具面只有读侧三个）；③ `MEMORY.md:90` 声明「**不做写侧硬状态迁移**、纯按信号推导」，而 `lifecycleOf` 两条最前置判断恰读**写侧** `rec.status`/`rec.pinned`。**新增 D4**（三条路：补持久入口 / 改信号派生 / 纠正文档 + 各自代价，**建议 ③ 为主 + ① 的窄版本，决策权在用户**）。台账 **18 → 19 条**（T3 结案转入 D4）。顺带修 T2 一处折行粘连、把 `pinned 永存` 的引用从 `README.md:178` 纠正为 `:177`。**纯文档改动，生产代码零改动** |
| v1.15.20 | **新增 `BACKLOG.md` —— 待办的唯一台账**（用户：「先记录代办任务，后续再继续」）：把跨 7 轮累积的未完成事项集中成 18 条，分五类 —— **一、阻塞在用户**（重启 DSH 使插件代码生效；多粒度检索产品方向）、**二、待分诊**（审计 A 类 30 条 / B 类 81 条；`status=archived` 无生产者待判定）、**三、待决策**（`ChangeSet`/`invalidateFor` 接线还是删除；跨项目根注册；细粒度取代）、**四、未验证**（真机 semble/zg；新台账 probe 旗标；`maxMembers` 运行时拦截；真机 `host.fs` 语义；其余 mock 忠实性；审计工具未入门禁）、**五、已知空白**（expiry 无对照消融；CLI 层工具数量拐点无论文；装/审批闭环无先例；重排器未在本系统验证）。每条给「内容 / 依据（可点的文件或 ADR 行号）/ 为什么没做 / 完成判据」四项；**不写没有依据的条目**。准确性核对：引用的 **8 处行号逐个核实通过**；T1/T2 计数为当日实跑所得（30 / 81），**不写「约」**。README 版本节加指针。`BACKLOG.md` 不入 `files` 白名单（与 CONTEXT/CHANGELOG/MEMORY 同一先例）。纯文档改动 |
| v1.15.19 | **接线审计工具**（ADR-0062）：本仓 v1.15.13–18 连续挖出**四类同源缺陷**（`toolset` 未挂 dispatch、绝对路径证据假失效、`status === "superseded"` 无写入者、取代生命周期未回填），且**单元测试全绿** —— 共同特征是「**机制是对的，断的是谁调用它 / 谁写这个值**」。新增 `tools/audit-wiring.ts`：A 类「导出但生产无**调用点**」、B 类「只被读、无写入点的判断值」。**工具必须先标定再用** —— 初版在真仓库报「A 0 / B 10」，而 B 的 10 条**全是误报**（三元写不认）。标定（`tools/audit-wiring.selftest.ts`，8 组断言 + 已知答案夹具）**连续暴露 4 个工具自身缺陷**：① 三元写不认（误报）② 改按字面量判后跨字段同名值算作写入者（漏报）③ 扫注释文本 ④ **分类器正则要求前导斜杠 → 顶层 `test/` 从未被排除 → 测试夹具的 `status: "superseded"` 被当成生产写入者，恰好掩盖要抓的真缺陷**。**审计结论**：确认 `ChangeSet` 与 `invalidateFor` **生产中未接线**（唯一消费者是测试）—— 但**不是正确性缺陷**（投影缓存可重建，粗粒度清空即正确），是**未接线的优化**（ADR-0048⑤）；已**在代码里显式标注**，不臆造接线。A 类**精度低**（本仓有意导出测试向包装 API，如 `assert*`，其底层判定在生产确有使用）—— 工具是**线索发现器，不是缺陷清单** |
| v1.15.18 | **确定性取代接进生命周期**（ADR-0061）：本仓**已有**文献唯一支持的「纠正」形态 —— `newestByEntryOf` + `verdictOf` 按同 `entry` 是否有更新记忆判 `superseded`（**无 LLM、无相似度阈值**；文献：余弦相似度分辨「被推翻」vs「换个说法」AUROC 仅 0.59），且已用于降权 ×0.7 + 报告。**但**三条依赖 `meta.status === "superseded"` 的分支（`lifecycle` 的 `SUPERSEDED`、`forget.ts:18`、`rank.ts:103`）**生产中不可达** —— 严格 grep 核实：生产只写 `active`/`compacted`，**唯一写 `superseded` 的是测试夹具**。后果（修前实测）：同一条记忆**自相矛盾** —— `生命周期 NEW · 裁决 superseded`。**根因是顺序**：lifecycle 在每记忆循环先算好，而 superseded 依赖 `newestByEntryOf` 跨记忆视图、之后才算出且从不回填。修复：`lifecycleOf` 新增可选参数，用**同一份读时裁决**回填；**优先级** pinned > archived > superseded（外部权威不被派生判断覆盖，inv 178）；**不持久化**（取代相对可见集判断，落盘会失效）。`forget.ts`/`rank.ts` 两条**有意不接线**并写明理由（避免重复降权 / 误删）。另**核实第 (3) 条**：证据支持的三要素**本仓已实现** —— 单 provider 路由 + `tierFor` 的 L0/L1/L2 **层级表示** + `renderByTier` 按预算逐层展开⇒ **多粒度形状已经在跑**，是「单索引 + 层级」不是「建 N 个库全查」 |
| v1.15.17 | **部署取证**（无运行时代码改动）：agent-team 部署**已完成且已生效** —— 装 `@deepseek-ai/dsh-experimental-agent-team@0.1.5-rc.2`（+ `-tool-agent-team`）、`cordis.patch.yml` 加宿主行 `maxMembers: 4`、预设三文件同步（SHA256 一致）。**预检 5/5 全过**（YAML 合法 / 包可解析 / `dump-config` 无错 / bundles 无重复 / SHA 一致）。**挂载校验**用临时 Cordis 探针调真实 `agentPresets` API：`standingKeyFor('projection')` = `mounted OK`、`compositionInventory` 27 行全 enabled 且 `tool-agent-team` 的 `fiberState: 2`、`team_task_list()` 返回 `{"tasks":[]}`、`agentTeams` 在服务目录 —— **三路交叉确认 Team 真活着**（单靠 `standingKeyFor` 不够，预设 README 自己记录过它会假成功）。**独立复核 ADR-0056 的代码论断**（原为「未验证」）：`DEFAULT_MAX_MEMBERS = 8`、`L564` 创建时检查、`members.splice/pop/shift/filter` **命中 0 处**、**失败的创建也占名额**（`L561-570` 先落盘 `provisioning` 再 spawn，失败只改 phase 为 `failed`，不移除条目）。**P0 在真机复现**：live 进程里 `read_shadow({mode:"toolset", need:[...]})` 返回 `_index.md`，且 live schema 无 `need`、mode 描述无 `toolset` ⇒ 运行中是 v1.15.12。**发现两种加载行为并存**：host 组合行+新装包**热加载**（Team 立即可用）；本插件的 `dist/` 改动**不热加载** ⇒ **改插件代码必须重启 DSH** |
| v1.15.16 | **多粒度检索层形态**（ADR-0060）：先点明一个改变问题性质的事实 —— **现有 `indexEngine.provider` 是单值**（`"fs"|"zg"|"semble"`），工厂只路由到**一个**，故「多库全量扇出」是**退步**而非加能力。新增 `tools/retrieval-eval.ts`（`npm run eval:retrieval`）在**真 `.shadow` 语料**上实测：检索器按 ADR-0054 实测性质建模（无阈值）、同候选预算、3 种子报极差。结果：**离题噪声** 有阈值单库 **0.000** vs 无阈值 **1.000**（扇出只是把噪声**乘以库数**）；扇出即便含互补来源**也不升召回**（0.347 vs 0.358，落在 ±0.053 内）。⇒ **多粒度若做，形态是「单索引 + 层级表示（level/parent_id）+ 路由」**，不是建 N 个库；**加判别层优先于加库**；多来源须**各自标定阈值**。**产品方向待用户裁决**（本 ADR 未单方面推翻任何既有 ADR）。附两处引用陷阱：「small-to-big」**无原始论文**、Markdown heading 切块**无论文** |
| v1.15.15 | **引用漂移检测 + 修两处假「证据失效」**（ADR-0059）：先在全库（6465 记忆）量事实 —— 表面 **40.8%** 的「证据失效」里约 **76% 是假的**。**F1（真 bug）**：`fsExists` 无条件做 `${ws}/${rel}`，绝对 locator 变双前缀（`D:/ws/D:/other/x.ps1`）→ 磁盘上存在的文件被判失效；**F2**：`readText` 对目录必失败 → 目录引用被判失效（补 `listDir` 兜底，真实契约已读源码核实）。修复后 **1025 → 243**。检测判据改为**双条件**（借 CASCADE/FSE 2026）：只有「**可检查的具体路径**」（`isConcreteLocator` 排除通配符与 git ref）**且**「确实解析不到」才判失效。**明确不做自动纠正** —— 让 LLM 判过期（AUROC 0.59 近随机）、LLM 自纠（误纠正率 53–94%）、裸 LLM 查文档漂移（flag rate 98%）均有证据反对。顺带发现**两处 mock 不忠实**（`listDir` 对不存在目录返回 `[]` 而非抛错），已按真实源码修正 |
| v1.15.14 | **工具台账扩源**（ADR-0058）：50 → **107 项**（2 provider + 105 reference），分类 13 → **17**（新增 容器与编排 / 安全与供应链 / 文档与转换 / 媒体处理）。**全部经权威核验**：新增 `tools/winget-verify.ts`（对精确包 ID 调 `winget show`，locale 无关解析，取版本/许可证）+ `tools/winget-verify-seed.ts`，**57/57 通过**。**核心纠错**：按名字自动解析包 ID **实测证伪** —— `xh`→Mozilla.Firefox.xh、`delta`→eToro.Delta、`nix`→LabChart、`choose`→AuthenticatorChooser 等 9 例假阳性，故**包 ID 必须由人裁决、机器只做核验与候选发现**。**拐点口径澄清**：arXiv 2606.30317 的「10–15 个工具跌破 90%」量的是**每次请求注入的工具 schema 数**（per context），**不是目录条目数** —— 台账本来就不进上下文，故**可以扩**；必须保持小的是「模型面前可调用的工具面」，**禁止把条目暴露成工具**。顺带修一处**静默丢弃**：`tool()` 的 `note` 在有 winget 包分支被整条丢掉（许可证/坑说明无声消失）→ 已拼接，并新增 `verSrc` 区分「实测」与「权威核验」 |
| v1.15.13 | **委派 × 工具集接缝**（ADR-0057）：**先修一个潜伏三个版本的 P0** —— `query/reads.ts` 定义了 `toolset` ReadQuery 却**没放进 `readQueries` 数组**，`{mode:"toolset"}` 静默回落到 `_index.md`，整块台账**无任何可达入口**（三个既有测试全**直接 import 执行函数**、从不走 dispatch，所以三个版本全绿）。修复 + 新增 `test/toolset-dispatch.test.ts`（**只走真实入口**，含「可 dispatch 的 mode 必须在 `index.ts` 登记」反向棘轮；已回档复验）。接缝本体：**能力预检** `read_shadow({mode:"toolset", need:["全文搜索",…]})` —— `findCapabilities(need)` 按能力需求反查台账（id/二进制名/用途词/分类名 + 别名，**不是能力评分**），`precheckCapabilities` 只读探测，输出固定带**三条硬边界**：① 不是闸门 ② **装完本会话不可见**（宿主 PATH 是启动时快照，同进程 teammate 同样看不见 ⇒「预检→先装→再派」单会话内收益为零）③ 缺件只能上报不能自装（inv 182）。persona ② 同步补一句。顺带修掉 `toolset-catalog` ④ 一个**恒红断言**（把「本机应有已检出的 provider」写死进测试；已改与机器无关的不变量） |
| v1.15.10 | **工具集台账扩为两级**（ADR-0055）：`kind:"provider"`（插件内接线：zg/semble）与 **`kind:"reference"`（通用 CLI 目录，44 项 / 13 分类）**。新增 `docs/toolchain-windows.md`（Windows 口径，winget ID 全部本机实测）与 `docs/toolchain-wsl.md`，**随包发布**；`test/toolset-catalog.test.ts` 做**双向棘轮**（台账↔文档漂移即红，首次运行即抓出一个写错的 ID）。巡检支持 `survey:"all"`（并行探测全部，实测 44 项 **1.5s**）与 `category` 过滤。探测口径收紧为诚实的「**未检出 ≠ 未安装**」。全量回归 27/27 |
| v1.15.9 | **一键装入口 `mode:"toolset"`**：`read_shadow({mode:"toolset"})` = 只读巡检；`{mode:"toolset", install:"<id>"}` = **显式安装**。授权走**宿主自己的审批服务**（`ctx.approval.request`），**只有 `allowed-once` 才执行**；`rejected`/`cancelled`/`unavailable`/无通道/无 agent/审批抛错/非词表返回值 → **一律不安装**（fail closed）。已可用 → 幂等短路；装完**重探**才报结果。顺带解掉与 `zg` 同类的 Windows 陷阱：**`npm` 也是 `.cmd`**，故解析为 `node <npm-cli.js> install -g <pkg>`。mode 总数 61 → **62** |
| v1.15.8 | **缺件处置（工具集台账）**：新增 `core/toolset.ts` 声明式台账（`zg` / `semble`：`provides` / `degradesTo` / `remedy` / `doc`），并在 `mode:"index"` 与 `verifyEvidence` 两处缺件出口接上**可执行的确切命令**；`CandidateResult` 增 `reason`，顺带补上 `verifyEvidence` 此前不显示 `reason` 的缺口 |
| v1.15.7 | **zg 集成三处修复 + 安装指南**（用户指出「不然没用」）：① **spawn 硬阻断**——Windows 上 `execFile("zg")` 必 ENOENT（Node 不解析 npm 的 `.cmd`）、`execFile("zg.cmd")` 必 EINVAL（CVE-2024-27980 缓解），于是「zg 装好、手动跑得通、插件恒 unavailable」→ 改为定位包内 `dist/cli/index.js` 用 `node` 起它；② **输出解析**——zg 0.2.2 的 `--rg` 是「路径单独一行 + 缩进 `起-止 [heading 面包屑] 行号:内容`」，不是 `path:line:text` → 改状态机，并**删掉两个会制造证据的兜底**（「stdout 出现 ref.path」会把 zg 的 `missing: <路径>` 误判成 verified）；③ **裁决语义**——`verify` 必须按 `ref.path` 限定搜索（工作区级搜索 + 全局 top-N 会把目标路径截掉：实测一次查询 40 条命中/16 文件，目标排第 7 个文件），不存在的路径 → `not_found`/`stale`；另把失败原因写进 `provenance.reason`（ADR-0049）。README 新增「可选外部 CLI（zg / Semble）」安装与自检指南 |
| v1.15.6 | **Semble 接为 Index Engine 的候选 provider**（ADR-0054）：`indexEngine.provider = "semble"`（本地 CLI，`uv tool install semble`）。**它是检索层、不是裁决层**——只产候选 → `rankRefs` → `authorizeScope` → 交回 Shadow Core；默认仍 `fs`（行为不变）。**为什么不进裁决面**：实测 Semble **无阈值、无负信号**（4 次查询分数三元组完全相同；「量子纠缠/哈勃常数」这类语料里没有的话题照样返回最高分；CLI 无 `--threshold`），交它 `verify` 会违反 ADR-0043「无证据不返回」与 ADR-0049。**两处实现约束**：① spawn 时必须清洗 `NO_PROXY`——本机 ambient 的 `[::1]` 会让其 httpx 抛 `Invalid port ':1]'`（模型已缓存也照崩），故剔掉带方括号的条目；② Semble 返回**相对路径**，必须先绝对化——否则 `authorizeScope`（绝对前缀匹配）会把候选**整批滤掉**（此坑由测试暴露）。端到端实测：`generateCandidates` 返回 20 条绝对路径候选并命中 `core/resource.ts:173-186` |
| v1.15.5 | **旧协议约定全面删除（A/B/C/D）**：**A** 删 `core/` 里 4 处旧数据格式兼容兜底（`> 用户提示/决策：`〔decision〕 的 legacy 决策解析、`decisions` 回退、`node.ts` 的 `materials` 回退、`kind`/`lineage` 可选性），`ParsedMemory.kind`/`lineage` 转必填；**B** 修正 **23 个 ADR** 陈旧的「协议（提案，待 vX 实现）」状态（对应实现目录与 CHANGELOG 条目均已存在）；**C** ADR-0053 再正名 3 项同名双义（`mode:"verify"`→`verification`、Gateway `EvidenceRef`→`GatewayEvidenceRef`、`realityEvidenceRef`→`realEvidenceRef`），并**判定保留** 2 项并写明理由（`config.recall` 含管线级旋钮，改名会与语义不符；`args.identity` 再改就要生造词）；**D** 当前文档不再登记废止名（README / CONTEXT / LIVE-VERIFY / 工具 schema / 注入提示），映射与理由只留 ADR。**顺带修一个真 bug**：`core/experience.ts` 的决策一直在读**旧** `> 用户提示/决策：` 提示头（等于把任意用户消息当决策）→ 改读现行 `> 决策：` 并剥离 `〔source〕` |
| v1.15.4 | **投影模式预设「team 优先」**（只改 persona 与文档）：默认先判该不该派；该派时优先官方 **Agent Teams**（`spawn_teammate` / `send_message` / `team_task_*`），复用同一具名 teammate 而不是反复新开一次性 `subagent`，只在「一次性、无后续」时用 `subagent` / `subagent_fork`。**前置与已知边界**：Team 域服务 `ctx.agentTeams` 必须由 **host 组合**提供（`@deepseek-ai/dsh-experimental-agent-team`，实验包无稳定性承诺）；预设只挂工具包 `@deepseek-ai/dsh-experimental-tool-agent-team`。**缺 host 行时预设仍报 `standingKeyFor` 挂载成功，但 9 个 Team 工具静默不出现**——与 ADR-0049「缺件不静默」相悖，是本版已知缺口。另：`send_message` / `list_agents` / `interrupt_agent` 三个名字被 Team 版**作用域内遮蔽**，Lead 不再能用它们直接指挥非 Team 的 continuable 子代理 |
| v1.15.3 | **审查修复（review 发现 → 父代理逐条复现 → 修根因）**：v1.15.0 的「硬依赖报 error」在真机**不可达** —— `ctx.inject(deps, cb)` 只在依赖**就绪**时回调，把检查写在回调里等于「缺了就不报」；已把 `tools`/`systemPrompt` 纳入首个 `turn-stopping` 的检查（并补 `ctx.get`），新增**真实 cordis 端到端测试**（原先 mock 无条件回调 ⇒ 断言①是假通过）。另修：`core/types.ts` 残留旧名 `session.cwd`、`clear` 不清缓存致新记忆带旧 `> 目标：`、`goalText` 的 `\|\| "decision"` 伪装兜底；补 `exec.name` 正向断言 |
| v1.15.2 | **过期旧名删净（ADR-0050 口径）**：`collect.ts`/`writer-capture.ts` 里 `change.objective`/`change.action`/`change.phase`/`change.kind`/`change.change?.objective`/`exec.tool?.name`/`exec.toolName`/`exec.tool` 全部删除（宿主任何版本都不存在），`scope.ts` 删掉恒 undefined 的 `agent.session.cwd` 候选并修正过期注释。**删旧名的价值当场兑现**：暴露 5 处建在编造形状上的测试（4 处 goal 载荷 + 4 处 tools/result），已全部改用宿主真实形状，断言意图不变；代码层旧名 grep 0 残留，回归 23/23 |
| v1.15.1 | **会话/agent 接口核对 → 根因修复**：宿主 `GoalChanged` 恒为 `{operation, ref, goal?}`（`0.1.0-rc.7` 起四版逐字相同 + 运行时 Inspect 一致），插件却读 `action`/`phase`/`kind` → `act` 恒回退 `"decision"`，**goal 操作语义永久丢失**；新增 `test/goal-operation.test.ts`（真实载荷形状 + 七种 operation 全覆盖）。同时**撤销**两条子代理误报：`systemPrompt.context()` 与 `section()` 是并存的两个不同用途方法（插件用对了）、`agent.session` 是公开契约（只是 Inspect 目录看不到） |
| v1.15.0 | **兼容性口径落地**：`package.json` 加 `engines.dsh: ">=0.1.5-rc.1"`（**验证基线声明，非闸门**——宿主与 pnpm 都不读 `engines`，已核实**无任何代码读取**；**能观测到的**防线是**宿主绑定能力探测**（硬依赖 `ctx.on`/`ctx.inject`/`ctx.get`/`fs`/`tools` 报 error，可选 `llm`/`agents`/`agentDefaultModel`/`systemPrompt` 报一条 warn；**v1.15.3 修正**：探测统一在首个 `turn-stopping`，原先放在 `inject` 回调里的那半在真机不可达）；README 新增「兼容性（验证基线）」节；**0.1.5-rc.1 以下未发现不兼容点**（六服务两事件自 `0.1.0-rc.7` 起即在），故**不写「不兼容」** |
| v1.14.1 | 投影模式预设加 **⑦ 创意与资源**（设计稿 §7 固化）：创意类问题先派**资源侦察员**（查库 → 命中跳过外搜 → 八类词 + 反向词、每类 ≤5 两轮无新资源即停 → 评价 → 写卡进 `.shadow/resources/`；不解题不评方案）再派**创意专家**（只发散、不检索）；卡片必须有 `source` 才进认知查询，`启发度` 要有引用证据；② 的专家枚举同步补一句。只改 persona 与文档 |
| v1.14.0 | 新增 `resource` NodeType（ADR-0051）：`.shadow/resources/<name>.md` 资源卡（固有层 + 按问题的投影段）→ 派生 `ShadowNode{type:"resource"}`，`shadow_query` 的 `scope` 可收 `resource`；**无 `source` 的卡片不上投影**（收进库 ≠ 有出处）；纯派生、无 LLM；不新增 mode、不引向量库、不做 Store |
| v1.13.2 | 投影模式划清"编排者与专家不重做同一件事"（用户 2026-09-10 提的"子 Agent 与主 Agent 不重叠、不重复推理、降低 Token 冗余"）：① 增补**该不该派**（一句话说得清、只动一处、不需要旁人视角的自己做；切活的侦察不算重做，不许先做出成果再派）② ③ 增补**同一段原文只进一个专家的提示词**（其余给摘要 + 原位路径；要独立判断的审查例外）③ ④ 由「逐条复核 / 专家声称的事实自己跑一遍」改为**只验一错就要返工的那几条、其余按未复核处理并列出、零分栏退回**④ ⑤ 补"各干各的那一份"；用户级规则 `moe-subagent-dispatch` 同步改，**规则为源**（聚合 `~/.dsh/AGENTS.md` + WSL 镜像） |
| v1.13.1 | 投影模式预设增补 ⑥：根因三部曲 + 禁止生造词 + 结论进 shadow/项目文档 + 四查（交手前/改口径后）；`recall_shadow`→`mode:recovery`；与全局 `~/.agents/AGENTS.md` 去重说明 |
| v1.13.0 | API 正名硬切：`recovery` / `identity-advance` / `verifyEvidence` / `real-evidence` / `AtomEvidenceRef`；旧名显式拒绝（ADR-0050） |
| v1.12.9 | 投影模式预设的 persona 增补「工作方式」五条（先分活 / 准确激活专家 / 提示词七要素 / 派了必须验收 / 并行与扇出），随包发布、不依赖用户级规则目录；预设/主 README 同步，安装副本已同步并做过全新挂载校验 |
| v1.12.8 | ① **缺件不静默**提成全插件纪律（ADR-0049：只降级/必须可见/绝不冒充成功/只陈述事实），顺带修 `routeVerify` 未知 provider 静默退回 fs 的反例 ② **召回路由评测**（正/负样本 + rank-1 棘轮 + 主题键碰撞检测，回归门槛）③ `references.md` 三处更正（OpenAI 两条路线/hyperframes 安装坑/状态方向写反） |
| v1.12.7 | 审查修复：① 读侧输出**保留换行**（`scrubFinal` 不再把整篇 Markdown 压成一行——`scrubUnsafe` 连 `\t\n\r` 一起剔的根因）② 信封计数恒取「命中 − 返回」（冷却也计入，不再出现「未返回 0 条」）③ 全冷却不再误标「近似候选」④ 近似候选对称归一化 + `hit ≥ 2` 降噪 ⑤ mode 棘轮补齐 `plan`（60→61）⑥ 若干措辞/精度/容错小修 |
| v1.12.6 | 参考材料落地三项（借 mattpocock/skills、PageIndex、codegraph；均无 LLM/新依赖）：① `mode` 描述下沉到 `CONTEXT.md`「mode 参考」（1747→488 字符，schema 只留常用 + 指针，带棘轮测试）② 召回信封（截断自报家门 + 空命中给四条下一步与近似候选·未验证）③ `recall.deprioritize`（只降权不移除）；另清理 claude-mem 参考材料（插件 7 处提及 + 克隆源码 140.8 MB） |
| v1.12.5 | 文档（无代码/行为变化）：README 新增「默认开关（装完什么都不动会怎样）」表（15 项，逐项对源码默认值）与「谁能调用（用户显式 vs 模型自动）」权限轴；开头加「给 agent 读的入口」；安全边界表第 4 行补「LLM 增强超时静默降级 = 可取消」 |
| v1.12.4 | 文档清理（无行为变化）：去掉「一切皆文件」口号（源码注释 / `CONTEXT.md` 术语表 / 投影预设）+ `package.json` 描述同步；ADR / MEMORY 历史原文保留 |
| v1.12.3 | 文档（无代码/行为变化）：README 新增「谁该用它」定位、「为什么存在」失败模式表、「什么情况用哪个」模式路由表、「给 agent 的粘贴式安装」、护栏下的「安全边界」对照表；references.md 登记 4 条补充材料并逐一核实 |
| v1.12.2 | 架构加固（全部审查候选落地，行为/公共契约零变化）：读族全迁 ReadQuery seam（query.ts 0 内联分支）+ 唯一循环依赖打破 + knowledge-engine 三 seam + 概念核 guard 测试 + writer capture/materialize 拆分（17 测试全过） |
| v1.12.1 | 架构重构（审查候选 1 首刀）：ReadQuery seam + materializeAtoms 收敛读模式 monolith，行为零变化 |
| v1.12.0 | 内容分类去噪 + 按格式结构抽取（code 包树/标题树/段落）+ 检索引用 + Shadow Manifest 可观测（ADR-0048 候选落地，纯派生无 LLM） |
| v1.11.0 | 成本感知树优化 + 渐进披露树 + change-set 增量索引 + 授权范围搜索（ADR-0048，均无 LLM、纯派生） |
| v1.10.0 | Knowledge Engine LLM 树上导航：`mode:"knowledge"` + topic → LLM 只选章节编号，事实仍从树派生（`knowledgeNavigate`，默认 off，失败回退确定性检索） |
| v1.9.0 | Projection Store + Index Engine + Knowledge Engine：可插拔性能缓存/候选生成/规范树（默认关；zg/PageIndex 是 provider，未装 unavailable） |
| v1.8.0 | Evidence Lineage Layer：AtomLineage + EvidenceRef + AtomKind + Validation Gate（metadata memory / 无证据 decision 不进查询），Evidence Density 按 type/kind/createdBy 报告 |
| v1.7.2 | Shadow Fitness Report：query-log → shadow-report.md（Evidence Density/稳定性/类型分布/潜在缺失类型），作为是否升级索引层的客观依据 |
| v1.7.1 | Shadow Query Observatory：shadow_query 旁路观测（真实查询数据）+ Node 稳定性/类型/relations 观察 |
| v1.7.0 | Shadow Projection Layer：ShadowNode + shadow_query（Phase 1A，ADR-0042/0043） |
| v1.6.0 | recall_shadow LLM 推理导航（对齐 PageIndex 免向量检索） |
| v1.5.x | recall_shadow + Active Context（Shadow Usability） |
| v1.4.0 | Context Recovery（ContextReference，ADR-0040） |
| v1.3.0 | Task Lifecycle（ADR-0039） |
| v1.2.x | Episode 收口归档 + 增量索引/遗忘（性能） |
| v1.1.x | Decision Capture（ADR-0037） |
| v1.0.x | Observer Runtime Foundation → Verification |
