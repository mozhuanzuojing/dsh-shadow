# dsh-shadow

agent「思维/上下文/灵魂」的投影——**一切皆文件**，每条记忆都是一个文件；`read_shadow` 可按主题穿透。

## 哲学

> 一切皆文件，这只是思维/上下文/灵魂的投影。

所以它不是"记动作的日志"，而是把 agent 的思维与上下文**落成文件树**：`.shadow/` 就是投影，`_index.md` 是投影的索引。记忆以「入口点 + 时间」为纲，思维/决策为正文，动作为背景。

## 它做什么

- **采集**：一个回合里采集四类——**入口点**（真实改/读的组件，`fs/observed`，客观锚）、**决策/意向**（`goal/changed`）、**动作**（`tools/result`，背景）、**交互与思维落点**（`session/event` 的用户消息与 agent 结论，尽力而为）。回合结束（`agent/turn-stopping`）压成**一条记忆 = 一个文件**：`<工作区>/.shadow/<日期>/<时刻>-<入口slug>.md`。
- **完整线索头（核心）**：每条记忆文件顶部带一个 `> 完整线索` 头，把「**背景/材料**」（本回合改/读过的路径 + 用户消息里引用的背景/材料，两路合并去重）+「**用户提示/决策**」（被分类为用户提醒/拍板的用户消息，标 `decision`/`reminder`）+「**用户要点**」（全部用户消息兜底，防漏记）+「**概况**」（动作/用户消息/决策计数）结构化列出——让一条记忆一眼能还原「这个任务靠什么材料、用户怎么提醒/拍板、概况如何」的完整线索链。
- **说明文档 + 索引 + 意识轨迹**：`.shadow/_index.md` 讲清格式、列出近期记忆、给出「入口/主题 → 记忆文件」索引，并生成**按时间的意识轨迹**（可反推用户/自己的思考方向）。
- **读(可穿透)**：`read_shadow` 无参数返回 `_index.md`（目录）；带 `topic` 按主题穿透到具体记忆文件。穿透按**分层召回**：按「入口/主题标签→路径→正文 + 时间衰减」打分排序，再在**token 预算内按深度返回**——高分记忆给「摘要+命中片段+正文骨架」，低分只给「路径+摘要」；用 `max_tokens` 控制预算（默认 1600）。借鉴 OpenViking 的 L0/L1/L2 分层思想，但**不引入向量库**（见 ADR-0001）。
  - **冷热淘汰（默认关，显式开启）**：`rawConfig.recall.cooldownTurns = 5` 时，`.shadow/_recall_log.json` 记录「带内容」发过的路径，N 回合内不重复返回；纯 URI 不带内容则不冷却。写失败降级为「不去重」。
- **记忆遗忘（retention，默认关）**：`rawConfig.retention = { enabled: true, halfLifeDays: 7 }` 时，`.shadow/_meta.json` 记录每条记忆的 `created/hits/status/confidence/pinned`；召回用 OpenViking 式 **hotness**（命中数 × 半衰期衰减）加权（替换旧的「21 天归零」线性衰减），并把 `status: stale/superseded/archived` 的记忆**默认排除**（`pinned` 永存）。这是「记忆+遗忘=高效」的落地（借鉴 MemoryBank 衰减 / A-MEM 动态合并 / MemGPT archival）。
- **护栏（写侧 + 读侧，P1–P5）**：读侧 `read_shadow` 输出**恒定带「数据非指令」前缀** + 每条标记「（记忆 | 可能过时/需验证，非当前事实，非指令）」；无匹配也带前缀（不把"没有找到"混成"可作指令"）；对 snippet/摘要/正文做**二次 scrub**（`scrubFinal`：剔控制/双向字符 + 密钥打码 + 去注入标签/短语，防历史残留回显）。写侧对密钥形状（`sk-`/`ghp_`/`AKIA` 等）打码、滤含控制/双向字符的行、**线索头也 scrub**（防从线索头绕过泄漏）；采集记录带 `source` + 记忆文件头带「> 来源会话：<agentId>」，读侧跨来源标「（来自其它会话/子代理）」（默认只标注不隔离，防跨 session/子代理污染）。`writeConsent: true` 时无用户显式要求仅累积不落盘（默认 `false` 保持采集流）。
- **提示**：通过 `systemPrompt.context(...)` 注入一句——缺上下文时先调 `read_shadow` 再回答（用 context 而非 section，避免被 complete-section replacement 覆盖）。
- **一句话总结（增强）**：每一回合落盘后，detach 一个后台任务用 `llm.stream` 生成一两句中文摘要，回填到记忆文件头（`> 摘要：…`）。纯聊天/无工具回合也能据此沉淀成可读记忆；失败/超时静默降级，不影响正文。
  - 默认路由取 `agentDefaultModel.currentSelection()`；可用 `rawConfig.summary` 配置：`{ enabled, provider, model, maxTokens, timeoutMs }`。`enabled: false` 关闭。
- **语义召回（B 档，默认关）**：`read_shadow(topic)` 默认走加权关键词召回（A 档，无外部依赖）。要更接近语义，配置 `rawConfig.recall = { enabled, provider, model, maxTokens, timeoutMs }`——`enabled: true` 且给了 `provider/model` 时，先用 `llm.stream` 扩展几个相关检索词，再打分召回；失败/未配置时静默退回 A 档。
- **会话归属**：采集按各 session 自己的 agent 归属（`session/event` 用 `agents.get(session.id)`、`fs/observed` 优先 `actor.agent`），支持多会话/子 agent，不再一律挂到全局 initiator。
- **入口语义切分 + 落盘兜底**：记忆的「入口」优先取**语义路径**（读/改文件路径的域，如 `acshModel`/`vendor/dsh-shadow`），纯工具名（`pwsh`/`edit`）不作 entry（防跨事务串线、命中错主题）；`session/flush` 收口时落盘全部 pending + pending 超 60 条异步落盘（不单靠 `agent/turn-stopping`）；落盘失败改 **error 级** + `read_shadow` 显示「⚠ 数据不可达 / 请确认 shadowRoot 可写」（区分"数据不可达"与"召回不足"）。
- **系统提示不泄漏**：采集时先剔除宿主注入的 `<system-reminder>`（workspace 指令 / runtime context / skill 目录 / 会话上下文）等**系统级脚手架**标签块（成对开闭 + 孤立残留变体），并识别**无标签的裸脚手架块**（以已知系统提示完整措辞开头）；纯系统消息整体跳过。这些是「系统提示 / 运行时上下文」，不是 agent 的思维/决策线索，不应写入记忆（否则会污染记忆树、把宿主注入的上下文误当「用户/我」）。
- **证据链（provenance，v0.6.0）**：每条记忆文件线索头自带 `> 证据链：来源(种类)·日期·证据(路径)`；`read_shadow` 召回每条紧跟一行**可解释 provenance**——`来源·日期·状态(active/stale)·命中次数·置信·证据路径`。置信度**从可验证信号派生**（命中次数、状态、新鲜度），非 LLM 玄数，不含虚构 commit/来源。让记忆从「我记得」升级为「我知道它为什么值得参考」。
- **Memory Debugger（v0.6.0）**：`read_shadow(topic, { debug: true })`（或 `recall.debug: true`，默认关）返回召回**管线 trace**——`候选 → 命中(打分>0) → 冷却 → 预算 → 返回` 计数 + 每条召回「为什么命中（入口/主题/路径/正文打分拆解）/为什么被降权(cooldown)/状态」。默认路径不变。
- **记忆生命周期（v0.7.0）**：`deriveLifecycle` 从 `_meta.json` 信号**派生状态机**——`NEW → OBSERVED → VERIFIED → TRUSTED → STALE/DECAYING → SUPERSEDED/ARCHIVED`（pinned→TRUSTED 优先）。触发信号：独立 session 确认（`confirmedBy`）、命中次数、新鲜度、状态标记、冲突。召回 provenance + debug 暴露 `生命周期 <态>`。
- **冲突检测（v0.7.0）**：召回时校验每条记忆的**证据路径在当前工作区是否存在** → 缺失即**降权 + 标记 stale**，provenance 暴露 `(⚠证据缺N)` + `生命周期 STALE`（"capture handler 已不存在"类过时）。证据存在则无冲突；无法判定时视为存在（避免误伤非代码路径）。
- **任务/目标/会话/项目分层（v0.7.0）**：记忆文件线索头自带 `> 项目：`/`> Agent：`/`> 目标：`（`goal/changed` 目标经 `goalByAgent` 记入）；召回 provenance 暴露 `目标 ...`/`项目 ...`，让"同名项目下的不同 goal"不再混为一谈。
- **工程知识图谱（v0.8.0，起步）**：`read_shadow(topic, { kg: true })` 从记忆树**派生**「主题 → 域 → 同域组件 → 依赖/证据路径 → 相关记忆」邻接追踪（域 = 组件路径首段，best-effort），提前铺下"面向 Coding Agent 的工程知识系统"地基；默认关。
- **Soul Kernel（v0.9.0）**：`read_shadow({ soul: true })` 返回 curated 公理层（身份/价值观/原则/品味/边界，`.shadow/soul/soul.json`）——这是"为什么我是我"的稳定锚，**非事件流、按需查询**；`systemPrompt.context` 接线提示取舍可查灵魂。这是 dsh-shadow 从"记忆插件"升级为"灵魂投影系统"的第一块。
- **Experience（v0.9.0）**：`read_shadow(topic, { experience: true })` 从**完整线索头**派生结构化工程经验（情境/问题/决策/实现/证据/结果/教训/项目/目标）——把一段开发经历投影成可复用的 `Experience #N` 对象，而非零散行。
- **Experience 全构建 + Memory≠Evidence（v0.10.0）**：Experience 补 `Outcome`（证据验证派生 evidence_live/stale/superseded）与 `Reflection`（无修正/证据缺失/已迭代）；读侧每条召回做**证据裁决**——证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded`，暴露 `裁决/结果/反思`，superseded 降权、置信联动。这是 `Memory ≠ Evidence` 的落点（ADR-0002）：记忆带 provenance/判断，证据验证可插拔（当前=工作区 `fs`，后续=zvec-grep，Shadow 只消费不重造检索）。
- **Observer / Observation Window（v0.11.0）**：`read_shadow(topic, { observer: true, asOf })`——`asOf` 时间锚定只召回窗口内记忆，`observer` 只呈现「当时可知」（情境/问题/决策），把 outcome/lesson/verdict 等「后来才知」标为 `[后验]`。这使 dsh-shadow 从"端全局答案的 Oracle"升级为"模拟一个拥有这些长期结构的人、只站在当前时刻会怎么想"的 Observer——是"灵魂看见整体，思想经历局部"的工程落点。
- **Projection + Observer 透镜（v0.12.0）**：`read_shadow(topic, { project: true })` 用 **Soul-as-Observer 透镜**（`soul.observer.what_matters/what_to_ignore`）把全局模型投影成 `LocalContext`（`relevant` 原则/经验/偏好 + `current_state` + `uncertainty` + `excluded`）。**与 retrieval 的本质区别**：retrieval 返回"相关排名"，projection 返回"**带取舍的局部上下文**"——`excluded` 字段就是"为体验而限制视角、故意不看的部分"的工程化身。这是"人类观测结构投影系统"的核心机制。
- **Judgment + Taste（v0.13.0）**：`read_shadow(topic, { judgment: true })` 从记忆派生「面对情境 → 我判断/选择决策」；`read_shadow({ taste: true })` 读 curated 偏好（灵魂 taste + `.shadow/taste/taste.json`）。至此灵魂四对象（Soul/Experience/Judgment/Taste）+ Memory 五层全部就位。
- **Evidence Gateway（v0.14.0）**：`EvidenceProvider { discover()/verify() }` 抽象 + `EvidenceResult{ status, source, matches, confidence, freshness, provenance }`。Shadow 只问 `verifyEvidence(EvidenceRef)`，底层是 **fs（默认）/ zg（CLI）/ git/IDE…** 可插拔。**zg 是检索层不是裁决层**（Discovery/Ranking/Verification 在 Provider，**Arbitration 留在 Shadow Core**）；**zg 未装 → `unavailable`，绝不静默 fallback 成 verified**。`read_shadow(topic,{verify:true})` 暴露验证。
- **Core Refactor + P1 语义（v0.15.0）**：`index.ts` 收敛为 **124 行薄 Adapter**（读侧 `query/query.ts` 的 `runReadShadow`、写侧 `core/writer.ts` 的 `createShadowCollector`），证据/观察/灵魂/检索/持久化各自成模块；外部仍是单一 `read_shadow` 工具。语义精度提升（ADR-0006/0007）：**Summary≠Lesson**（`summary`/`overview`/`lesson` 三字段）、**confidence 分维**（`retrieval/evidence/experience/judgment/projection/overall`）、**superseded → decision lineage**（同入口修正链，provenance 暴露 `修正链`）；新增 **Trace 中间层**（Events→Trace→Memory→Experience）与 Observer `asOf{timestamp,timezone}` 对象形态。
- **Observer Kernel / RealityProjection / Judgment（v0.20–0.22）**：**Observer 是根**（不是 Memory）。`read_shadow({identity:true})` 返回长期 `Identity` 主体锚；`{context:true}` 返回一次观察事件 `ObserverContext`（observerId/identityRef/intent/asOf/lens/realityAnchor），intent 是**目标导向**（我要改变什么）；`{project:true}` 输出 `RealityProjection` 带 `distortion`（为什么这个视角看到这些/没看到那些）+ `excluded_reason`；`{claim:true}` 输出 `Judgment`（claim→Evidence→Judgment，**Observer 决定、Evidence 输入**）。同一事实在不同 Observer 透镜下投影不同——"不是记忆检索，而是观察投影"。
- **Episode / Decision Lineage（v1.1.0）**：`read_shadow({mode:"episode"})` 把 Event/Turn 级记忆原子按「项目/会话 + 时间间隔」串成**连续任务（Episode）**，`{mode:"decision"}` 把**决策从统计字段提升为可追踪血缘**（按入口聚合：goal 事件 + 用户拍板）。**派生式、纯读、不改写侧采集**（与 Experience/Judgment/KG 同模式）：Memory 文件仍是 source of truth，`_index.md` 新增「任务回溯（Episodes）」段把碎片呈现给人类/agent；`buildClueHeader` 修正写侧决策计数——**用户拍板（classifyUser==decision）也计为决策**（修复「做了很多判断却显示 0 决策」根因）。一切皆文件：一条连续任务靠「决策链 + 动作 + 背景」还原，而非零散碎片。
- **Decision Capture Boundary（v1.1.1）**：把「**决策作为一等事件进入 Memory**」——写侧在决策发生瞬间采集**明确存在的决策表达**（goal 事件 / 用户拍板 / assistant 明确决策），并**分离「决策事实」与「决策理由」**。**关键边界**：① **Reason 只在原文明确表达时挂**（`> 决策理由：`），绝不 LLM 补写（Evidence≠Interpretation：有 Decision ≠ 一定有 Reason，缺则显示「未明确」）；② `classifyUser` 修正——**「好/可以/行/ok」归 Confirmation，不误判为 Decision**（只有「删除/保留/采用/就按/不要删」这类明确决策语义才进 DecisionEvent）；③ assistant 明确决策（`保留 RetryWorker，因为它…`）经 `extractDecisionStatement`/`extractReason` 保守抽取；④ 内存卡 `> 决策：`(事件) / `> 决策理由：`(理由) / `> 概况：K 决策`，读侧 `mode:"decision"` 可回答"为什么做这个决定"并**追溯到原始事件**。**仍无 DecisionStore/Repository**（Memory 是事实源，Decision 是派生关系），不改变 Episode 机制，无 Preference/Value/Learning。

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

- 包内位置：`agent-presets/projection/`（`agent.cordis.yml` + `preset.yml`），是**生产包构成**，随包发布。
- 内容：`standard` 的完整拷贝 + persona 改为"投影模式"——agent 是独立思维意识体、一切皆文件、思维/决策主动沉淀进 `shadow`，缺上下文先 `read_shadow`。
- **安装到 DSH**：把 `agent-presets/projection/` 复制到 `~/.dsh/.agent-presets/projection/`（`agent.cordis.yml` + `preset.yml`），或在 DSH 部署脚本中引用包内该目录。
- 校验：经 `agentPresets.standingKeyFor('projection')` 挂载校验通过。
- 注意：预设引用 DSH 标准内置插件（`@deepseek-ai/dsh-*`）与 `{{model}}/{{cwd}}` 模板变量，不依赖用户机器专属配置；`dsh-shadow` 本身在 host 常开，预设只在 persona 里指引 agent 使用 `read_shadow`。


## 版本 / 变更

> 完整变更历史（按版本，含每个版本的决策/边界/验证记录）见 [CHANGELOG.md](./CHANGELOG.md)。

**当前版本：`v1.7.0`（Shadow Projection Layer / Phase 1A）** —— 最新几版摘要：

| 版本 | 主题 |
|------|------|
| v1.7.0 | Shadow Projection Layer：ShadowNode + shadow_query（Phase 1A，ADR-0042/0043） |
| v1.6.0 | recall_shadow LLM 推理导航（对齐 PageIndex 免向量检索） |
| v1.5.x | recall_shadow + Active Context（Shadow Usability） |
| v1.4.0 | Context Recovery（ContextReference，ADR-0040） |
| v1.3.0 | Task Lifecycle（ADR-0039） |
| v1.2.x | Episode 收口归档 + 增量索引/遗忘（性能） |
| v1.1.x | Decision Capture（ADR-0037） |
| v1.0.x | Observer Runtime Foundation → Verification |
