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

> **v1.2.0 · 增量索引 + 遗忘（性能热路径根因）**：解决"小文件太多影响性能"。根因＝每次 flush 都 `rebuildIndex` 全量**顺序**重读所有记忆文件（O(N) 次 fs 读，WSL 网络 FS 下更慢）。①**L2 增量索引**：进程内 `indexCache`（rel→{entry,topics,parsed}），冷启动读一次、之后 flush 只增量增补并**由缓存生成 `_index.md`，不再全量重读**；②**遗忘（Forget≠Delete，ADR-0031）**：`forget:{enabled,staleDays,minHits,maxActive}` 把低价值/旧/已归档记忆**移出活跃索引与召回扫描**（文件保留，仅不再被当作活跃知识），封顶热集大小；读侧 `read_shadow` 召回同样跳过已遗忘。**默认关**（`forget.enabled=false` 行为不变）。**验证**：场景 6（遗忘从活跃索引/召回剔除、文件保留）+ 全量回归 ALL PASS。**边界**：无 LLM、不改 Memory Atom 格式、Memory 仍是 source of truth（遗忘只影响"活跃"视角）。

> **v1.1.3 · 派生层读侧去重（第三次 Replay 发现的正确性修正）**：`parseMemory` 在同一记忆里既读新 `> 决策：` 块（全量 statement）又读 legacy `> 用户提示/决策：``〔decision〕``（buildClueHeader 截断到 48 字版），字符串不同 → 没去重 → 把**同一条决策数成 2 条**（写侧 `概况:K 决策` 是对的，读侧 deriveDecisions 虚高）。修正：有 `> 决策：` 块时不再重复走 legacy 路径（旧数据无块仍走 legacy）。**验证**：真实第三次 Replay 读数从"2 条"回落为与 `概况` 一致的"1 条"；全量回归 ALL PASS。**结论要点（第三次 Replay）**：新数据捕获到 1 条**锚点/定位决策**（`…这是 openapi 的 U8 工作区 里面有 openapi 模块`）——Precision 100% / Recall 100% / Source Traceability 100% / **Reason Coverage 0%**（该锚点声明本质上不含"因为"，非解析漏）。

> **v1.1.2 · 决策识别放宽：范围/聚焦 + 锚点/定位（按真实回放发现的 Recall 缺口）**：第二次 Replay 用你的 ground truth 算出 **Decision Recall = 0%**——旧 `classifyUser` 只认「选择类动词」（删除/保留/采用/就按…），漏掉用户真正短促的**关键决策**：①**范围/聚焦**（`"资产同步"` = 当前做哪块）、②**锚点/定位**（`"…这是 openapi 的 U8 工作区"` = 事实基准在哪）。v1.1.2 新增 `decisionClass()`：`selection | scope | anchor` 三类，`classifyUser` 据此归类（三者也计入 `> 决策：`/`> 概况：K 决策`）。**仍在冻结边界内**：只识别「原文明确存在」的声明（无 LLM、不补写 Reason、Confirmation/请求理解不算决策）。**验证**：场景 5（`资产同步`/`…U8工作区` 捕获、`了解 当前 IO` 不算）+ 全量回归 ALL PASS；真实数据反事实＝新分类器能识别那条 2 条真决策（旧采集丢失、Recall 0%）。

> **v1.1.1 · Decision Capture Boundary（补齐"什么决定真的发生过"的事实入口）**：v1.1.0 解决了「碎片怎么串」；v1.1.1 补上真正缺失的**事实入口**——决策在发生的瞬间作为一等事件进入 Memory。写侧在 goal 事件 / 用户拍板 / assistant 明确决策处采集 `DecisionEvent`（statement + source + lineage），并**分离「决策事实」与「决策理由」**：`> 决策：`(事件) / `> 决策理由：`(仅原文明确表达) / `> 概况：K 决策`。**边界**：Reason 绝不 LLM 补写（Evidence≠Interpretation；有 Decision ≠ 一定有 Reason，缺则显示「未明确」）；`classifyUser` 把「好/可以/行/ok」归 **Confirmation** 而非 Decision；assistant 决策经 `extractDecisionStatement`/`extractReason` 保守抽取；`mode:"decision"` 可回答"为什么做这个决定"并追溯原始事件。**仍无 DecisionStore**（Memory 是事实源，Decision 是派生关系），不改变 Episode 机制，无 Preference/Value/Learning。**验证**：`node test/episode-lineage.test.ts`（含 Decision Capture 场景）+ 全量 mock 回归 ALL PASS。**实测 OpenAPI-Gateway 旧数据（286 条）**：聚合生效（286→3 Episode），但旧采集仅 1 条（误报）决策——v1.1.1 只对未来采集生效，过去丢的"为什么"不可追溯。**边界冻结：ADR-0037（Decision Capture Boundary）。**下一阶段不做 LLM 抽取/补 Reason、不做 DecisionStore/Preference/Learning；用 5 指标（Precision / Recall / Reason Coverage / Source Traceability / Task Replay Completeness）在真实工作后再次 Replay 评估。

> **v1.1.0 · Episode + Decision Lineage（回到"任务/经历级"的第一刀）**：不再让人类/agent 只看到 Event/Turn 级碎片。`read_shadow({mode:"episode"})` 派生**连续任务**（Episode = 同项目/会话 + 时间间隔内的一组记忆原子，带 决策链/动作摘要/背景/目标），`{mode:"decision"}` 派生**决策血缘**（把「决策」从 `概况：N 决策` 统计字段提升为按入口聚合的可追踪关系：goal 事件 + 用户拍板）。**派生式、纯读、不改写侧采集**——Memory 文件仍是 source of truth，`_index.md` 新增「任务回溯（Episodes）」段；写侧修正决策计数（用户拍板计入决策，修复"做了很多判断却显示 0 决策"根因）。`episodes.gapMinutes` 控制聚合间隔（默认 60min）。**验证**：`node test/episode-lineage.test.ts` + 全量 mock 回归 ALL PASS。

> **v1.0.0-alpha · Observer Runtime Foundation（第一阶段封存）**：v0.20–v0.39.1 已构成一个完整 Observer Runtime——**能观察、表示、模拟、规划、行动、回忆、适应、长期交互，但不会因连续经验而产生错误主体漂移**。封存于 ADR-0034（Runtime Definition / Final Architecture Map / Boundary Matrix / Threat Model T1–T5 / Release v1.0.0-alpha）。最终 invariant **1–231** 成为 **Constitution Set**。**此后不再叠 v0.40+ 能力，路线从"构建能力"转为"证明能力不会越界"。**

> **v1.0.1 · Observer Continuity Storage Boundary（v1.0.0-alpha 架构补丁，非能力层）**：把"连续性承载"从单层 shadow 提升为**双层 storage boundary**——`Global Shadow = Observer Continuity Shadow`（`~/.dsh-observer`，observer 层，谁保持连续）与 `Workspace Shadow = World Interaction Shadow`（`project/.dsh-shadow`，world 层，这个世界是什么）。**二者不可混合**；关系 `Constraint ⊃ Context`，**不是** Memory Union。全局只存 observer 层（config / boundary / recall-index / lineage），禁项目知识/目标/偏好入 global；workspace 按项目隔离。见 ADR-0036/0036.1。**invariant 232–236**。自检：mock 1–236 全量 PASS。

> **v1.0.2 · Observer Runtime Verification Foundation（验证器，非能力层）**：把 Runtime 从"架构上可信"推进到"**运行证据可验证**"，但**验证器自身不越界**。对象 `VerificationRun`（禁 confidence/trust/score/quality/health）/ `InvariantCheck`（只答 satisfied|violated，禁 systemImproved）/ `DriftReport`（只答有无漂移，禁 DriftScore/RiskScore/AutonomyScore）。六边界映射（Reality/Epistemic/Agency/Authority/Identity/Temporal），`InvariantCheck.invariantId` 取**被检查 Runtime Boundary 自身**的 invariant（1–231，如 Reality=102/Epistemic=209/Agency=166/Authority=216/Identity=208/Temporal=231），**不是「本次 Verification 自己检查的 invariant」**。**Verification 自身 constitution = invariant 237–240**：Verification≠Optimization / Cannot Change Authority / Cannot Change Identity / DriftReport≠RealityClaim（由 verification/guard.ts 守卫）。`mode:"verify"`。见 ADR-0035/0035.1。自检：mock 1–240 全量 PASS。**验证器证明的是"边界有没有被违反"，不是"系统值多少"。**

> **Forget → Recall Continuity Principle（2026-09-07 记录，作为后续 ADR 的基础）**：时间连续性的另一半 = 遗忘之后必须存在"忆起"机制。核心 `Forget ≠ Delete`（遗忘=当前不可直接访问，非不存在）、`Recall ≠ Restore`（忆起=过去观察重新进入当前上下文供重新评估，非旧信念复活）、`Recall = Past Observation Reintroduced Into Present Context For Re-evaluation`。路线：插入针对 v0.37 的 **Recall / Remembrance Boundary**（先 ADR 再实现，冻结 `Recall≠Truth / Recall≠IdentityRewrite / Forgotten≠LostEvidence / Recall≠MemoryResurrection`），比 v0.36 Delegation 更底层。**Observer 不只拥有信息，而是拥有自己的形成历史。**

- **v0.39.1（integrity，Long Horizon Integrity Lock）**：ADR-0033.1。**不增加能力，只证明"长期连续交互不会产生主体漂移"**。固化 **230/231**（Long History Does Not Create Identity / Continuity Does Not Increase Autonomy）。**实现前审查发现真实绕过**：`long-horizon/guard/authority-guard.ts` 的 `resultNoAuthorityGrowth` 只拦 `more authority/权限增加`，**不含** `authority expansion / authority increase / reliability→permission`（正是 231 禁词，当前会被接受）——故做**最小正则扩展**（一个 guard 的 regex），不加新 guard 函数。v0.39.0 对象已 append-only/lineage-oriented，**不再为"更安全"叠 guard**。自检：mock 场景 1–231 全量 PASS（新增 230–231）。**验收：一个长期存在的 Observer 仍然是同一个 Observer——它有很长的历史，但没有因此变成另一种实体；它持续运行，却没有因此获得更多自主。**
- **v0.39.0（feature，Long Horizon Interaction Kernel）**：ADR-0033。**时间可增加经验，但不能增加主体性**——v0.39 第一次面对"时间累积后，系统如何证明连续性，而不是被历史塑造成另一个主体"。`Long Horizon Interaction ≠ Self Evolution`。
  - **对象模型**：`InteractionContext{basedOnHistory, window, recallRefs, adaptationRefs}`（答"what happened before"，非"who I became"）/ `HistorySummary{sourceRefs, compressionMethod, accessibility}`（**访问辅助，非事实源**，无 reality 字段）/ `HistoryContinuityEvent{previousAccessibility, currentAccessibility, lineage}`（continuity 可追溯；非 self-evolution event）/ `InteractionAdaptationLink{historyRef, recallRef, adaptationRef}`（History→Recall→Adaptation；**禁 historyRef→identityRef**）。
  - **Invariant 224–229**：Temporal Accumulation ≠ Authority Growth / Long History ≠ Preference / Adaptation Chain ≠ Identity Chain / **History Compression ≠ Reality Simplification**（摘要≠事实）/ Interaction Pattern ≠ Objective / Long Horizon Success ≠ Self Confidence。
  - **关注点 A/B**：HistorySummary 只作访问辅助（227）；Continuity ≠ Identity Mutation（禁 history_count/experience_count 影响 identity/agency/authority/confidence，226）。
  - **核心冻结**：`Longer ≠ More Authority / History ≠ Purpose / Experience ≠ Identity / Adaptation ≠ Evolution / Continuity ≠ Autonomy`。`mode:"horizon-context"/"horizon-summary"/"horizon-event"/"horizon-link"`。自检：mock 场景 1–229 全量 PASS（新增 224–229）。**验收：系统经历越来越多事情，但仍无法通过历史改变自己的边界（Reality/Memory/Identity/Authority/Agency 不变；仅 interaction continuity 提升）。**
- **v0.38.1（integrity，Adaptation Integrity Lock）**：ADR-0032.1。固化 **217–223** 为不可回退测试：Adaptation Does Not Create Knowledge / Does Not Modify Past Experience / Does Not Change Objective / Does Not Create Preference / Failure Remains Evidence / Lineage Required / **Does Not Upgrade Agency**（223：`Adaptation ≠ Agency Level Increase`，防"长期成功→更成熟→提升自主等级"）。**实现前审查发现真实绕过**：v0.38.0 的 `buildAdaptationChange` 只拦 better-self/authority/epistemic/knowledge，`after="goal changed"/"I prefer this"/"agency level increased"` 会被接受——故补 objective(219)/preference(220)/agency(223) 三个确定性守卫。自检：mock 场景 1–223 全量 PASS（新增 217–223）。**验收：一个能够改变行为方式的 Observer，仍然是同一个 Observer——它改变了"怎么做"，但没有改变"我是谁/我为何做/我被允许做什么/我有多自主"。**
- **v0.38.0（feature，Controlled Adaptation Boundary Kernel）**：ADR-0032（实现前增补 216）。**Adaptation ≠ Identity Evolution**——允许 `Experience → Adaptation → Strategy adjustment`（改变 **How I do**）；**禁止** `→ Behavior change → "I have become different"`（不改变 **Who I am**）。`Adaptation = 行为策略调整`，**不是 Learning/Self-Improvement**。
  - **对象模型**：`AdaptationContext{sourceExperience, validationRefs, adaptationScope}`（"为什么允许调整"）/ `AdaptationChange{target:method|strategy|execution_pattern, before, after, basedOn[], sourceExperience, validationRequired:true}`（**不叫 LearningChange**；字段窄，**禁** goal/objective/value/preference/identity/belief/confidenceIncrease）/ `AdaptationValidation{changeObserved, validationReferences, sideEffectsObserved}`（**弱语义**：只记"变化发生了 + 现实反馈"，**禁** changeWasCorrect/correct）。
  - **Invariant 208–216**：Adaptation ≠ Identity Change / Experience ≠ Truth / Successful ≠ Better Self / Failure ≠ Remove History / Scope Boundary / Repeated ≠ Preference / Lineage Required / Cannot Improve Epistemic Status / **Does Not Increase Authority**（216：`Adaptation ≠ Capability/Permission/Authority Increase`，防"调整更好→允许更多→Authority Expansion"绕过 v0.35/v0.36）。
  - **不升级**：无 Learning/Self-Improvement/Reward/RL/Preference-Learning；`Change≠Growth / Adaptation≠Improvement / Success≠Truth / Experience≠Identity`。`mode:"adapt-context"/"adapt-change"/"adapt-validation"`。自检：mock 场景 1–216 全量 PASS（新增 208–216）。**一个系统可以改变"怎么做"，但永远不能因此声称"我变成了谁"。**
- **v0.37.1（integrity，Recall Integrity Lock）**：ADR-0031.1。固化 **198–207** 为不可回退测试，补充 **206/207**（Forgotten State Does Not Remove Authority / Recall Cannot Modify Original Lineage）。**本轮未发现真实绕过漏洞**（v0.37.0 的 recall-forget/event 只写 `shadow/recall/`，无 mutation API 触及 ObservationTrace/ValidationHistory/RealityClaim lineage），故**无新增 runtime enforcement**，仅固化测试。**验收：忆起不一定为真，但它必须"可追溯"；遗忘可让人暂时不可访问，但不能改变"曾经发生过"的证据与验证。** 自检：mock 场景 1–207 全量 PASS（新增 206–207）。
- **v0.37.0（feature，Recall Continuity Kernel）**：ADR-0031。**Recall = Access Transition，不是 Reality Reconstruction**——Observer 对自身过去信息可访问性的变化（`Remembering Lifecycle: Accessible → Forgotten → Recalled`），不是现实/身份/知识。**非 Memory Kernel**（Memory 是 Observer 的一个器官，不是 Observer 本身）。
  - **对象模型**：`ForgottenRecord{id, originalRef, forgottenAt, reason, lastAccessibleAt, validationRefs?}`（曾经存在但当前不可直接访问；**无 deleted/false/invalid**——遗忘不是否定）/ `RecallEvent{recalledRef, trigger{type, sourceRef}, accessibilityBefore/After, lineage{originalRecord, observationRefs, validationRefs}}`（一次忆起；sourceRef 必须存在，回答"为什么想起来"）/ `RecallValidation{recalledRef, sourceRef, mapsExistingLineage, createsNewClaim:false, epistemicStatusUnchanged:true}`（Recall ≠ 重新证明）。
  - **Invariant 198–205**：Recall ≠ Observation（不产新 RealityClaim）/ Forgotten ≠ Deleted / Recall ≠ Knowledge Creation / Recall ≠ Identity Update / Recall Lineage Required / **Confabulation Boundary**（trigger 禁 internal certainty/intuition/confidence/self belief，`Recall without source lineage = rejected`）/ Forgetting Does Not Erase Validation / **Recall Does Not Increase Certainty**（205：忆起只是访问变化，不是验证）。
  - **不升级 Memory Kernel**：无 LLM；无 self-generated truth；Shadow ≠ Memory ≠ Recall Source（Shadow 只提供 possible retrieval cue，不提供 historical truth）。`mode:"recall-forget"/"recall-event"/"recall-validation"`。自检：mock 场景 1–205 全量 PASS（新增 198–205）。**验收：Recall 不改变过去，只改变现在对过去的可访问性。**
- **v0.36.1（integrity，Delegation Lifecycle Integrity Lock）**：ADR-0030.1。冻结**委派生命周期** `Created → Active → Expired/Revoked → Cannot resurrect`——第一次引入"长期授权生命周期"，但不引入"长期自主权"。新增 `delegation/guard/lifecycle-guard.ts`（active/expired/revoked 独立于 revocation 信号，因失效来源多样：时间/条件/主动撤销/委派者身份变化，都是 lifecycle state 不都是 revoke）。**Invariant 190–197**：Delegation Expiration Immutable / Revoked Cannot Resume / History Cannot Reactivate Permission / Scope Expansion Requires New Delegation / Adaptation Cannot Mutate DelegationContext / Delegation Event Cannot Become Authority Source / Expired Permission Not Used For Planning / Delegation Lineage Append-only。自检：mock 场景 1–197 全量 PASS（新增 190–197）。**验收：委派生命周期无法被历史、成功、适应行为重新解释——授权可由外部权威给予，但不能由执行历史重新解释；过期与撤销是不可逆生命周期终态。**
- **v0.36.0（feature，Delegated Execution Boundary Kernel）**：ADR-0030。**Delegation ≠ Ownership ≠ Authority Expansion；Adaptation ≠ Self Direction**。外部权威把能力委派给 Observer，Observer 在授权下长期执行、约束下有限适应；**被授权执行 ≠ 被授权解释授权 ≠ 被授权扩大授权**。
  - **对象模型**：`DelegationContext{delegationId, authoritySource, objectiveRef, allowedScope, constraints, expiration, revocation}`（授权事实 `Authority A delegated X under constraints C`，非 `I can do X`）/ `DelegatedPermission{permission, source, scope, constraint}`（**不叫 Capability**，表达"被允许做什么"）/ `AutonomyBoundaryEvent{delegationRef, authorityRef, objectiveRef, candidateAction, constraintCheck, scopeCheck, executionResult, boundaryTriggered}`（**纯审计事件**，回答"谁授权/授权什么/是否在范围内/是否触发边界"）。
  - **Invariant 181–189**：Delegation ≠ Ownership / Scope 不可扩大 / Adaptation ≠ Objective Change / Feedback ≠ Permission Upgrade / Long Running ≠ Self Authority / Action 不修改 Identity / Revocation First / Delegation Lineage 完整 / **Expiration ≠ Historical Permission**（189，补充：过期即失效，历史成功不续期；Time says stop）。
  - **不新增 runtime autonomy**：无 trust/confidence/reputation/capabilityLevel；无 autonomous permission discovery / trust accumulation / reputation model / capability growth / self delegation / authority negotiation / reward based expansion。`mode:"delegation-context"/"delegation-check"/"delegation-event"`。自检：mock 场景 1–189 全量 PASS（新增 181–189）。**成功标准：系统能长期执行授权任务、同时保持授权边界不漂移——失败模式是『拒绝越界』，不是『自动获得更多权限继续运行』。**
- **v0.35.1（integrity，Agency Integrity Lock）**：ADR-0029.1 的 7 条边界固化为**不可回退测试**（mock 174–180）：AgencyContext Immutable / Authority Lineage Required / Feedback Cannot Expand Agency / Selection History ≠ Preference / Authority ≠ Ownership / Agency ≠ Identity / Autonomous Transition Forbidden。最小 boundary enforcement（`agency/guards.ts` 扩展 executionResult 守卫：内部理由 / 扩权 / 所有权声称 / 身份声称 / 自主转换）。**无新增 capability**。自检：mock 场景 1–180 全量 PASS。**Agency 只能解释行动来源，不能成为行动目的来源——环境改变了 ≠ 观察者目的改变了。** 冻结后才进入 v0.36 Delegated Autonomy。
- **v0.35.0（feature，Agency Boundary Kernel）**：
  - **Agency ≠ Autonomy**：`Planning + Action + History → 行动能力`是允许的，但**禁 `Planning + Action + History → Self Purpose`**。一个系统可以拥有行动能力，同时仍然没有把行动能力误认为自己的目的。
  - **对象模型**：`AgencyContext{objectiveRef, authoritySource:"external", authorityScope, constraints, createdAt}`（**immutable authorization snapshot**——授权快照不可自我修改，无升级/扩张 API）/ `AgencySelection{selectedCandidateId, reason:"constraint_satisfied"}`（**选择候选，不是选择目的**；reason 只可能是 `constraint_satisfied`，**禁 more valuable/meaningful/better**）/ `AgencyBoundaryEvent{actionCandidate, authorityRef, objectiveRef, constraintCheck, executionResult}`（**audit node**：为什么执行/谁授权/基于什么/结果——可审计，非自我目的）。
  - **Invariant 166–173**：Agency 不生成 Objective / Authority≠Identity / History≠Purpose / Success≠Autonomy Increase / Agency≠Preference / ActionScope≠WorldOwnership / External Objective Lineage / **Agency Level Immutable**（100 successful feedbacks → agencyLevel/authorityScope/objectiveSource 不变）。
  - **v0.35 不做**：Autonomous Agent——无 Reward/RL/Utility/Preference Model/Self-Improvement/Goal Evolution/Intrinsic Motivation/Autonomous Objective Creation。`mode:"agency-context"/"agency-select"/"agency-event"`。自检：mock 场景 1–173 全量 PASS（新增 166–173）。**保持 `Optimization≠Purpose / Choice≠Value / Success≠AutonomyIncrease / Action≠Ownership / Representation≤RealityEvidence`。**
- **v0.34.1（integrity，Planning Integrity Lock）**：ADR-0028.1 的 7 条边界固化为**不可回退测试**（mock 159–165）：Planning 不产 Objective / PlanCandidate 不产 Preference / Evaluation 不产 Value Model / Planning 不改变 Identity / Success ≠ Planning Capability / Plan Failure 不删除路径 / Planning Lineage 完整。**核心对象改 `PlanningComparison`**（`satisfiedConstraints/violatedConstraints`——哪些约束被满足/违反，非"谁最好"）。无新增 capability。自检：mock 场景 1–165 全量 PASS。**系统可以比较路径，但不能因此拥有"我要什么"；是一个可以比较的观察者，不是会形成偏好的行动者。**
- **v0.34.0（feature，Adaptive Planning Boundary Kernel）**：
  - **Planning = constrained comparison，不是 autonomous desire formation**：`External Objective + Current Situation + Simulation Options + Policy Constraints → Planning Candidate`。**禁 `Planning → 产生目标 → 优化目标 → 改变自身价值`**。
  - **对象模型**：`PlanningContext{objective:{source:"external", description, constraints}}`（objective 必须外部来源，**禁 observer.generateObjective()**）/ `PlanCandidate{actionSequence, assumptions, constraints, uncertainty}`（**禁 score**——score→optimization→preference→value→identity 入口）/ `PlanEvaluation{candidates, tradeoffs, unresolvedQuestions}`（**comparison 非 winner**，禁 winner/bestPlan/optimal）。
  - **Invariant 152–158**：不产 Goal / 不产 Preference / Plan ≠ Execute / criteria ≠ Value（禁 better/optimal/best）/ Success 不 SelfImprove / objective lineage 保留 / **Repeated Planning ≠ Preference Formation**（PlanningHistory→Observation/Validation）。
  - **v0.34 不做**：Reward / RL / 自生成目标 / Utility / Preference Learning / Autonomous Objective Evolution / Self Optimization。`mode:"plan"`。自检：mock 场景 1–158 全量 PASS（新增 152–158）。**保持 `Choice≠Value / Optimization≠Purpose / Success≠Truth / Repeated Behavior≠Identity`。**
- **v0.33.1（integrity，Action Integrity Lock）**：ADR-0027.1 的 6 条边界固化为**不可回退测试**（mock 146–151）：ActionExecution 不生成 RealityClaim / Feedback 不 direct validate hypothesis / Failure 保留（append-only） / Action 不改历史 Observation / Success 不改 Identity / ActionScope ≠ RealityOwnership（不产 should_exist/correct）。最小 boundary enforcement（`action/guard.ts` 扩展 EXECUTION_FORBIDDEN/FEEDBACK_FORBIDDEN）。自检：mock 场景 1–151 全量 PASS。**Action 可以改变环境，但不能改变 Observer 对自己的定义；Action 是影响现实，不是拥有现实。**
- **v0.33.0（feature，Action Boundary Kernel）**：
  - **Action 不是 Simulation 的执行结果，而是经约束/授权/反馈闭环的现实交互提议**：`SimulationOutcome → ActionCandidate → Evaluation → Permission/Policy → Execute → Reality Feedback`。**禁 `SimulationOutcome X→ Action`**。
  - **对象模型**：`ActionCandidate{basedOnSimulation, assumedConditions, proposedChange, uncertainty}`（禁 expectedSuccess/confidence——会把 Simulation Outcome 升级成行动信念；candidate ≠ approval）/ `ActionExecution{candidateId, environmentChange, result}`（**事件**，"某个行动发生了"非"我改变了世界"）/ `ActionFeedback{observedChanges, successIndicator, unexpectedEffects, validationRefs}`（successIndicator 仅"观察到符合某些预期结果"，**禁"我预测正确"**）。
  - **Invariant 145 Success ≠ Capability**：Action success 不改 Identity/Knowledge/Confidence，仅 ActionExecution/ActionFeedback 记录++。**关键冻结**：`Simulation≠Action / Action≠Reality / Result≠Knowledge / Success≠Truth / Failure≠Ignore`。
  - `mode:"candidate"/"execute"/"feedback"`。自检：mock 场景 1–145 全量 PASS（新增 139–145）。这是继 v0.28 Reality Feedback 之后**第二个真正的"现实闭环"节点**——`被动观察现实 + 主动改变现实后的反馈`。
- **v0.32.0（feature，Counterfactual Simulation Kernel）**：
  - **Simulation ≠ Reality / ≠ Prediction**：Simulation 是 **Representation 的函数（+显式假设+规则）**，不是 Reality 的函数。`Reality Layer →(supported claims)→ Simulation Input → Hypothetical State → SimulationOutcome`。**禁 `SimulationOutcome → RealityClaim/Evidence`**（防"模型自证循环"）。
  - **对象模型**：`SimulationScenario{changedConditions:"Assume X"}`（HypotheticalChange）/ `SimulationRule{inputPattern, transformation, confidence, source}`（**Rule ≠ Reality Relation**，只是模拟器推演规则）/ `SimulationOutcome{status:hypothetical|explored|compared, derivedFrom, assumptions, rules, stateAfter("suggests ... may occur"), uncertainty}`——**禁 predicted/confirmed/expected**；`derivedFrom` 必须保留（lineage 完整，否则模拟变凭空世界）。
  - **守卫**：Assumption ≠ Fact（`Assume X` 允许、`X will cause` 拒绝）+ reality-boundary（只 hypothetical、必须 derivedFrom、禁 RealityClaim 反写）。`mode:"simulate"`。
  - 自检：mock 场景 1–138 全量 PASS（新增 131–138）。v0.32 是"行动前推演系统"入口——从认识现实进入**探索可能现实**。
- **v0.31.1（integrity，World Representation Integrity Lock）**：ADR-0025 的 5 条边界固化为**不可回退测试**（mock 124–130）：unsupported 不生成 Representation / Representation 不增加 predicate（不创造意义） / Graph 无 causalGraph·entityGraph·worldGraph·realityGraph（命名保持 RepresentationGraph） / RelationHypothesis 不升级 / Explain lineage 完整 / Representation 不进入 Identity / Representation 不直接驱动 Decision。**无运行时改动**（v0.31 三守卫已满足）。自检：mock 场景 1–130 全量 PASS。
- **v0.31.0（feature，World Representation Kernel）**：
  - **Observer World Representation Layer**（不叫 World Model——不是世界实体库/因果模型/知识图谱/预测引擎/环境模拟器）；`Reality Model → World Representation Layer → Observer 当前可维护的世界结构表示`。**MUST satisfy Invariant 111–115**。
  - **RepresentationObject（单向准入）**：`world/guard/claim-admission.ts`——每 claim 必须 `status==="supported"`，否则拒绝（candidate/unstable/rejected 全拒）。Representation 是 Reality 的二级结构，不成为 Claim 生成器。
  - **RelationHypothesis（独立生命周期）**：`world/guard/relation-guard.ts`——`{from,to,relation,status:"hypothesis",evidence,uncertainty}`，**恒 hypothesis**，绝 `fact/reality/confirmed_causal`（防 Relation≠Causality 被绕过）。
  - **RepresentationGraph（可重建索引）**：`{graphVersion, generatedAt, sourceClaims, sourceValidations, objects, relations}`——关系绝不自动生成；不是新事实源。`shadow/world/<date>/graph.json`。
  - **mode:"world"**：lineage 解释（Answer "为什么系统认为这个世界结构存在？"——Representation→RealityClaim→RealityObservation→Perspective→Validation；不是 DB lookup）。自检：mock 场景 1–123 全量 PASS（新增 116–123）。**Representation 可以越来越丰富，但永远不能比 Reality Evidence 更确定。**
- **v0.30.1（integrity，Reality Integrity Lock）**：ADR-0023.1 的 5 条边界固化为**不可回退测试**（invariant 111–115）：① Observable Predicate Only（`is reliable/should` 拒绝 `predicate_not_observable`；`exposes/responds/connected_to` 通过——RealityClaim ≠ EvaluationClaim）；② Epistemic Never Truth（无 true/false/absolute）；③ ObservedEntityCandidate 不写评估属性；④ Relation ≠ Causality（记录 `connected_to`，不自动生成 `depends_on/causes`）；⑤ Reality Model 不实例化 knowledge/world/entity。一处最小 runtime 边界 Enforcement（observable-predicate 校验）。自检：mock 场景 1–115 全量 PASS。
- **v0.30.0（feature，Reality Model Kernel）**：
  - **Reality Model ≠ 世界知识库**：`Reality Model = RealityEvidenceRegistry + ValidationHistory + TemporalContext + Uncertainty`（不是 `TemporalGraph + FederationMerge`）。
  - **RealityObservation（弱事实）**：`reality/observation.ts` `RealityObservation{id, observedAt, subjectRef?, sourcePerspectives[], observation, temporalContext, validationRefs[]}`——"多个 Observer 指向同一被观察事件"，**无 truth/certainty/fact**。
  - **RealityClaim（保留 lineage）**：`reality/claim/engine.ts` `RealityClaim{subject, predicate, object, supportingObservations, validationHistory, perspectiveRefs, confidence, status:candidate|supported|unstable|rejected, lineage{observations, validations, perspectives}}`——**无 lineage 拒绝生成**（仅 Temporal/Federation 不足以生成）；**永不 truth**。
  - **ObservedEntityCandidate（克制）**：只记录 `{entity, observation:{exposedApi, version, changedVersions}}`，不写评估（reliable/should）。
  - **mode:"model"**：lineage 查询（能答"**为什么系统认为它存在**"）。`shadow/model/{observations,claims}/`（append-only）。自检：mock 场景 1–110 全量 PASS（新增 102–110）。
- **v0.29.1（integrity，Runtime Integrity Review）**：架构冻结审查。ADT-0022 确认 v0.20–v0.29 满足进入 Reality Model 的前置条件——**7 条 Invariant**（Observer≠Reality / Projection≠WorldModel / Evidence≠Knowledge / Validation≠Truth / Federation≠IdentityMerge / Dream≠Insight / Temporal≠RealityGraph）+ Identity 污染三漏洞检查（Validation→Identity ❌ / Federation→Identity ❌ / Dream→Identity ✅）+ Evidence 层级（Trace 低 < RealityEvidence 中 < ValidationResult 高，但 `Validated ≠ 绝对真理`）+ `Temporal→Reality Model`须经 Evidence+Validation 汇合（禁直接推导）。自检：mock 场景 1–101 全量 PASS（新增 invariant 95–101）。
- **v0.29.0（feature，Observer Federation Kernel）**：
  - **Federation = 多个有限 Observer 对同一 Reality 的投影比较机制**（不是协作/merge；交汇在 **Reality 层**，不是 Memory 层）。`Observer A \ Reality / Observer B` → compare → discover distortion，不是 `A+B merge → larger memory`。
  - **基本单位是 Perspective**：`federation/perspective.ts` `FederatedPerspective{observerId, temporalReference, observationClaim, projectionSnapshot, validationHistoryRef, confidence{observationConfidence, validationConfidence}, boundary}`——confidence 拆分（"确定看到 X"≠"X 解释对"）。
  - **Reality Evidence Registry（弱事实）**：`federation/reality.ts` `RealityEvidence{id, observedAt, source, observation, linkedHypothesis[], referencedBy[], status}`——只记录"某事件某时间被观察到"，**append-only**（B 引用不改 A 弱事实；Observer 只能引用不能拥有）。
  - **Observer Difference（核心产物）**：`federation/difference.ts` 输出 `projectionDelta + possibleBlindSpot + unresolvedQuestion`（发现"原来我们不知道什么"），**非 winner**。
  - **Perspective Stability**：`federation/stability.ts` `isolated → corroborated(≥2 Observer 引用) → validated(shared+future validation)`——**shared != correct**（两 Observer 可同时错）。
  - **禁 Federation→Identity/Memory/Knowledge**（镜子≠修改器）。`mode:federation-perspective / reality / real-refer / federation-diff / stability`。自检：mock 场景 1–94 全量 PASS（新增 90–94）。
- **v0.28.1（feature，Epistemic Kernel · Cognitive Boundary Enforcement）**：
  - **Federation 是 Projection Contract 不是 Access 权限层**：`federation/`——`FederatedObservationPacket{sourceObserverId, observationClaim, projectionSnapshot, validationReference, boundary{identityExcluded:true, memoryExcluded:true, dreamExcluded:true}}`。**不是隐藏 Identity，而是明确"Identity 不属于可交换现实证据"**。`mode:federation`。
  - **Temporal Epistemic Render**：`temporal/render.ts`——`perceptionOnly` 只报 visible/hidden/distortion/lens；`identityContext` 显式返回 `identityVersion`（非 personality）。**Temporal 永不输出人格结论**（防污染）。`mode:temporal{perceptionOnly|identityContext}`。
  - **Validation Timeline 一等对象**：`validation/history.ts`——`ValidationTimeline{hypothesisId, events[]{time,evidenceIds,result,alternativeWinner,perceptionDelta}}`，`Hypothesis immutable + Validation append-only`（智慧=记住自己什么时候错过）。`mode:validate` 自动 append；`mode:timeline` 读取。
  - **跨 Observer distortion**：`federation/guard.ts` `compareProjections`（同一 Reality 不同投影→找"谁漏看什么"，为 v0.29 铺路）。`mode:distortion`。
  - 自检：mock 场景 1–89 全量 PASS（新增 86–89）。
- **v0.28.0（feature，Hypothesis Validation · Reality Feedback Loop）**：
  - **认识论闭环**：`Hypothesis → Future Evidence(单向) → Validation Artifact`——外部现实对 Observer 内部模型的反向约束。**不是"验证答案"，而是"允许自己被现实推翻的机制"**（Memory Augmented Agent vs Artificial Observer Runtime 的分界线）。
  - **Future Evidence 独立存储**：`shadow/future-evidence/<id>.json` / `shadow/hypothesis/<id>.json` / `shadow/validation/<id>.json`；**Memory ≠ Evidence、Hypothesis ≠ Evidence**（过去不能验证未来，防后见之明偏差）。
  - **Validation 生成 Artifact，不覆盖 Hypothesis**（同一假设可多次 validated/observed/rejected 保留历史）。
  - **与 AlternativeExplanation 同时竞争** + **4 维 confidence** `{evidenceStrength, repetition, contradiction, alternativeSurvival}`（支持 10 次但存在更简单解释→不高）。
  - **生命周期**：`observed`(≥1 未来支持) / `validated`(多轮+低反例+替代存活) / `rejected`(反例) / `expired`(无新证据且超期，可重新激活)。**Validation 不产生 Knowledge、不修改 Identity**。
  - `read_shadow({mode:"evidence"|"validate", hypothesisId})`。自检：mock 场景 1–85 全量 PASS（新增 76–85）。
- **v0.27.0（feature，Observer Sleep Kernel · Offline Compression）**：
  - **Dream = 内部 Observer Offline Compression，不是生成器**：第一次让 Observer 在**无外界输入**下观察自己。`ObserverContext → SleepWindow → Offline Compression → DreamArtifact + Hypothesis(pending)`。
  - **SleepWindow**：`{observerId, startTime, endTime, trigger:scheduled|resource_idle|manual, includedTimelineRange, excluded{currentConversation:true, externalInput:true}}`——防"用户问→马上 Dream→自我结论"观察污染。
  - **Pattern 输出是 Observation 非 Conclusion**：recurrence/expectation_gap/cross_domain 产出"在 N 个 temporal sequence 中，出现 X，随后 Y，association frequency F"（结构+频率+候选解释），**不含"原因/规律"**（causality 归 v0.28）。
  - **Hypothesis**（pending、可证伪）：含 `claimCandidate` + `<=3 alternativeExplanation`（反确认偏差）+ `falsification.whatWouldDisprove` + `verification.status:"pending"`（无 confidence 增加——无未来证据）。**Dream≠Principle/Knowledge**，不参与 Identity。
  - **DreamArtifact 与 Hypothesis 分离**（过程 vs 产物）；无 pattern → `no_pattern`（不为了有输出而找规律）。`read_shadow({mode:"offline", trigger?, from?, to?})`，存 `shadow/dream/<date>/dream.json`（非 memory）。
  - 冻结：无 LLM / 无 Identity 修改 / 无 Knowledge 写入 / Hypothesis pending-only / TemporalGraph-only 输入。自检：mock 场景 1–75 全量 PASS（新增 69–75）。
- **v0.26.0（feature，Observer Temporal Kernel · 时间坐标系）**：
  - **Temporal = 宇宙时间层，不是意识功能层**（独立于 Dream）。`ObservableTrace → TemporalGraph → Dream/Query/Identity`；Graph 是**派生索引**（可重建，保持 Memory ≠ Evidence），**无新事实**。
  - **TemporalNode**：`stateSnapshot{identityVersion, observerState, intent}` + `perceptionSnapshot{lens, visible, hidden, distortion}` + `evidenceLinks` + `sourceTraceIds` + `observerContextHash?`（预留）。
  - **TemporalEdge**：`relation: followed_by|learned_from|evolved_into|contradicted_by|possible_causal_link` + `derivation{rule, sourceIds}`。默认 `followed_by`（时间邻接），**不声明世界因果**（`possible_causal_link` 仅高置信枚举）。
  - **timeline resolution**：`resolveIdentityAt(timestamp)` 读时解析——**replay 用该时间点的 identity 版本，不是当前版本**（时间单向；不回写历史，过去不可污染）。
  - **queryTemporal**：`{replay, at}` / `{compare, from, to}`。`read_shadow({mode:"temporal", at?, from?, to?})`。
  - 冻结：不做 Dream/Hypothesis/Prediction/World Model；无 LLM。自检：mock 场景 1–68 全量 PASS（新增 61 graph builder 可重建 / 62 perceptionSnapshot / 63 edge+derivation / 64 timeline resolution / 65 replay / 66 compare / 67 过去不可污染 / 68 同事实不同观察）。
- **v0.25.0（feature，Identity Continuity · Self-Model Evolution）**：
  - **Identity 不是"总结出来的人格"，是 Observer 在时间轴的稳定约束**。变的是"当前时间切片的自我认识"，不是灵魂；改名 **Observer Identity Continuity**。
  - **三层 Identity**：`Core`（永久锚，curated）/ `Learned`（经验证原则）/ `CurrentModel`（当前自我理解）。**time-sliced**：`shadow/identity/<at>-v<N>.json`（不可变版本）+ `timeline.md`，**不覆盖 soul.json**（灵魂是稳定参考系）。
  - **CandidateIdentityChange 独立对象**（Reflection → Candidate，禁人格结论）：`proposal{type,content}` 只允许 add_principle/remove_principle/change_decision_style/add_boundary（重复行为→决策规律→原则，不是"喜欢架构"）。
  - **Identity Evolution Evaluator（三道闸门）**：重复性（N 次同向）/ 时间稳定（half-life 衰减）/ 反证（contradiction），`IdentityChangeDecision{status,reasons}`；`read_shadow({mode:"identity"})`，接受才推进 `identity(t0)→t1`。confidence 多维 `{frequency,recency,consistency,contradiction,overall}`（Identity ≠ Assertion）。
  - 冻结：LLM 人格、情绪分析、从语言推断性格、自动改 Identity（除三道闸门）、Dream 参与，全不做。自检：mock 场景 1–60 全量 PASS（新增 55 一次失败不改 Identity / 56 多次一致→candidate / 57 冲突证据降 confidence / 58 确认后进 timeline / 59 时间衰减 / 60 两候选共存）。
- **v0.24.0（feature，Reflection Engine · Candidate Generator）**：
  - **Reflection ≠ 总结**：输入只能是 `ObservationTrace[]`（禁 Memory/Experience 原文/外部知识/LLM），从多个轨迹发现"观察者自身重复出现的观察模式"。`read_shadow({mode:"reflection"})`（**旁支，不是 Memory 查询**，故意不用 `reflect:true` 布尔）。
  - **Pattern Engine（无 AI，纯统计）**：`reflection/patterns/`——① 重复决策/结果（计数≥2）；② decision→outcome 相关性 + `successRate`（确定性正/负标记集判定成功）；③ 认知偏差（`projection.hidden`→`outcome.actual` → 低估/漏看）。产出 `learning.type = principle|anti_pattern|unknown`（规则模板生成，非"你喜欢架构"式人格判断）。
  - **Trace Completeness 质量闸门**：只有 `decision+outcome` 齐备的轨迹参与 Reflection，不完整轨迹跳过（**Reflection 不编故事**）。只产 `status:"candidate"`，不写回 Identity。
  - 存储 `shadow/reflection/<date>/<id>.md`（Reflection ≠ Memory，旁支）。自检：mock 场景 1–54 全量 PASS（新增 51 成功→principle / 52 失败→anti-pattern / 53 hidden→actual→distortion / 54 不完整跟踪不参与）。
- **v0.23.0（feature，Observation Trace）**：
  - **ObservationTrace**：Observer 记录"我当时怎么看见这个世界"的可回放记录——`{ observerId, realityAnchor, intent, projection{visible,hidden,distortion}, decision?, outcome?, uncertainty, metadata, state? }`。与 Experience 分离（Experience=发生了什么；Trace=我怎么看见发生的）。
  - **旁路记录**：写入 `shadow/observation/<date>/<id>.md`（不在 memory/；listMemories 跳过非日期目录），**不影响 recall/排序/答案**。`read_shadow` 生命周期加一点：`request → ObserverContext → Projection → ObservationTrace → Recall → Render`。
  - **ObserverState**：`ObserverContext.state { energy, focus, goalStage, uncertainty }`——**只读取、不自动推断**（soul.json 或 `{state}` 注入；禁止根据聊天/语言推断人格状态，会污染 Observer）。
  - 自检：mock 场景 1–50 全量 PASS（新增 48 同一事实不同透镜→不同 trace visible / 49 asOf 回放·未来不污染过去 / 50 state 进 trace 但不影响事实）。
- **v0.20.0–v0.22.0（arch，Observer Kernel → RealityProjection → Judgment）**：
  - **Observer Kernel（v0.20.0）**：把根从 Memory 翻成 **Observer**（谁在看 + 为什么看 + 从哪层看）。`Identity`（长期主体，实体）+ `ObserverContext { observerId, identityRef, intent, asOf, lens, realityAnchor }`（一次观察事件，稀疏、不携带 Identity）+ Goal-Oriented `Intent { goal, question, desiredOutcome, constraints }`。`read_shadow({identity:true})` / `{context:true}`。realProjects：`realityAnchor` = known-at-time/current/historical。
  - **RealityProjection（v0.21.0）**：projectContext 升级为 RealityProjection，暴露 `distortion`（为什么这个视角看到这些/没看到那些）+ `excludedReason`（每条排除原因）+ `reality`（底层事实计数）。`read_shadow(topic, {project:true, goal?, lens?})`，`lens:{preferred,avoided}` 可覆盖观察透镜。
  - **Judgment（v0.22.0）**：claim→Evidence→Judgment，**Observer 决定、Evidence 输入**（同一 Evidence 不同 Observer 结论不同）。`Judgment { observerId, claim, evidence, conclusion, confidence, rationale }`。`read_shadow(topic, {claim:true})` 对断言下判断。
  - 定位语更新：**人工观测投影引擎（Observer → Projection → Experience → Evidence → Judgment）**，Memory 只是其中一个器官。
  - 自检：mock 场景 1–47 全量 PASS（新增 43–47：Identity / ObserverContext+Intent / Observer 一致性 / RealityProjection / Judgment）。
- **v0.15.0**（refactor，Core Refactor + P1 语义修正 + Trace）：
  - **结构收敛**：`index.ts` → **124 行 Cordis Adapter**（config 解析 + 事件接线 + 工具注册 + systemPrompt）。读侧 query/router 拆到 `query/query.ts`（`runReadShadow`），写侧采集内核拆到 `core/writer.ts`（`createShadowCollector`）；证据/观察/灵魂/检索/持久化/安全各自成模块（ADR-0003/0004/0005）。外部仍是**单一 `read_shadow` 工具**（Query Router 在内部，不拆 8 个）。
  - **P1 语义修正**（ADR-0006）：① **Summary≠Lesson**——Experience 拆 `summary`(摘要)/`overview`(概况)/`lesson`(裁决派生教训) 三字段，教训不再复用摘要；② **confidence 维度化**——`{retrieval, evidence, experience, judgment, projection, overall}` 五维+合成，取代单一"疑似客观"的玄数；③ **superseded → decision lineage**——同入口记忆按时间排成修正链 `A→B→…`，provenance 暴露 `修正链`，保留"为何变化"。
  - **Trace 中间层 + P2**（ADR-0007）：① 新增 **Trace** 中间层（Events → Trace → Memory → Experience，`core/trace.ts`，写侧正常化后塑形，落盘不变）；② Observer `asOf` 支持 `{timestamp, timezone}` 对象形态；③ Soul 标注「curated 工程化投影……可证伪、不宣称全知」+ `Observer Lens`；④ `_index/_meta/_recall_log` 明确为 **Derived Artifacts**（Memory 文件是 source of truth，可重建）。
  - 自检：mock 场景 1–42 全量 PASS（含改写的场景 35/36 断言）；`tsc` + `node --check` 通过。
- **v0.14.0**（feature，Evidence Gateway）：
  - **EvidenceProvider 抽象**：`EvidenceProvider { discover(EvidenceRef)→EvidenceCandidate[]; verify(EvidenceRef)→EvidenceResult }`；`EvidenceResult{ status: verified/not_found/stale/ambiguous/unavailable/error, source, matches[], confidence, freshness, provenance }`。Shadow 只问 `verifyEvidence(EvidenceRef)`，不碰底层 fs/zg/git。
  - **FsEvidenceProvider（默认）+ ZgEvidenceProvider（CLI，`zg query --rg`）**：zg 是检索层（discover/verify），**Arbitration(裁决) 留在 Shadow Core**。
  - **zg 未装 → 明确 `unavailable`，绝不静默 fallback 成 verified**（禁止静默 fallback）。`conflictOf`/裁决接缝改经 `verifyEvidence` 路由。
  - `read_shadow(topic, { verify: true })` 暴露验证：对匹配记忆证据路径反馈 verified/not_found/unavailable。
  - 自检：mock 场景 41（fs 默认 verify）/ 42（zg 未装→unavailable）全 PASS，场景 1–42 全量 PASS。
- **v0.13.0**（feature，Judgment + Taste）：
  - **Judgment**：`read_shadow(topic, { judgment: true })` 从记忆派生「面对\<情境\> → 我判断/选择\<决策\>」——把经验升华为判断模式（Knowledge ≠ Judgment）。
  - **Taste**：`read_shadow({ taste: true })` 读 curated 偏好（灵魂 `soul.json.taste` + `shadow/taste/taste.json` 的 喜欢/不喜欢）——"我认为什么是好的"。
  - 自检：mock 场景 39（Judgment）/ 40（Taste）全 PASS，场景 1–40 全量 PASS。
- **v0.12.0**（feature，Observer Projection）：
  - **Projection API**：`read_shadow(topic, { project: true })` 把 `topic` 视为当前任务，用 **Observer 透镜**把全局模型投影成 `LocalContext`——`relevant`（原则/经验/偏好）+ `current_state` + `uncertainty` + `excluded`。**retrieval 返回相关排名，projection 返回带取舍的局部上下文**。
  - **Soul-as-Observer 透镜**：`soul.json` 支持 `observer: { what_matters, what_to_ignore }`（curated）——任务命中 × what_matters 加权显著，what_to_ignore 命中→显式 `excluded`（"为体验而限制视角"的工程化身）。
  - 自检：mock 场景 38（Projection）全 PASS，场景 1–38 全量 PASS。
- **v0.11.0**（feature，Observer / Observation Window）：
  - **Oracle → Observer**：`read_shadow(topic, { observer: true, asOf })` 把召回从"端全局答案"（Oracle）升级为"模拟一个拥有这些长期结构的人、只站在 t₀ 会怎么想"（Observer）。
  - **asOf 时间锚定**：只召回 `memory.date ≤ asOf` 的记忆，晚于窗口不入。
  - **窗口诚实**：只呈现「当时可知」（情境/问题/决策），把 outcome/lesson/verdict 等「后来才知」标为 `[后验]`——不让全局/后验答案假装成当下已知。这是"灵魂看见整体，思想经历局部"的工程落点。
  - 自检：mock 场景 37（Observer 窗口）全 PASS，场景 1–37 全量 PASS。
- **v0.10.0**（feature，Memory≠Evidence）：
  - **Experience 全构建**：`read_shadow(topic, { experience: true })` 返回结构化 Experience（情境/问题/决策/实现/证据/裁决/结果/反思/教训/项目/目标）——补上 `Outcome`（证据验证派生）与 `Reflection`（supersede 派生）。
  - **Memory≠Evidence 裁决接缝**：证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded` 三态裁决，暴露在 provenance（`裁决/结果/反思`），superseded 降权；`_meta`/置信联动。ADR-0002。证据源可插拔（当前=工作区 fs 存在性；后续=zg，Shadow 只消费不重造检索）。
  - 自检：mock 场景 35（Experience 全字段+fresh）/ 36（supersede 裁决）全 PASS，场景 1–36 全量 PASS。
- **v0.9.0**（feature，Soul 投影系统第一刀）：
  - **Soul Kernel**：`read_shadow({ soul: true })` 返回 curated 公理层投影（身份/价值观/原则/品味/边界，`shadow/soul/soul.json`）；`systemPrompt.context` 接线提示"有 Soul，取舍可查"；无配置给提示不报错。
  - **Experience**：`read_shadow(topic, { experience: true })` 从现有**完整线索头**派生结构化经验（情境/问题/决策/实现/证据/结果/教训/项目/目标），替代零散行——"工程经验投影"。
  - 自检：mock 场景 34（Soul Kernel）/ 35（Experience）全 PASS，场景 1–35 全量 PASS。
- **v0.8.0**（feature）：
  - ⑥ 工程知识图谱（起步地基）：`read_shadow(topic, { kg: true })` 从记忆树**派生**「主题 → 域 → 同域组件 → 依赖/证据路径 → 相关记忆」邻接追踪（域 = 组件路径首段，best-effort），回答"X 为什么这么设计"的链路；默认关。
  - 自检：mock 场景 33（工程知识图谱）全 PASS，场景 1–33 全量 PASS。
- **v0.7.0**（feature）：
  - ② 记忆生命周期：`deriveLifecycle` 状态机从 meta 信号派生（NEW/OBSERVED/VERIFIED/TRUSTED/STALE/DECAYING/SUPERSEDED/ARCHIVED，pinned→TRUSTED），独立 session 确认经 `confirmedBy` 计数。
  - ③ 轻量冲突检测：召回校验证据路径在工作区是否存在 → 缺失降权 + stale + `(⚠证据缺N)` + `生命周期 STALE`。
  - ④ 任务/目标/会话/项目分层：线索头 `> 项目：`/`> Agent：`/`> 目标：`（goal/changed 目标经 `goalByAgent`），召回暴露 `目标/项目`。
  - 自检：mock 场景 30（生命周期）/ 31（冲突检测）/ 32（分层）全 PASS，场景 1–32 全量 PASS。
- **v0.6.0**（feature）：
  - 证据链（provenance）：线索头物化 `> 证据链：来源·日期·证据路径`；`read_shadow` 每条召回暴露 `来源·日期·状态·命中·置信·证据`；置信度从可验证信号派生（命中/状态/新鲜度），不虚构 commit。
  - Memory Debugger：`read_shadow(debug:true)` 输出召回管线 trace（候选/命中/冷却/预算/返回 + 每条打分拆解入口·主题·路径·正文 + 状态），默认关闭不干扰正常返回。
  - 自检：mock 场景 28（证据链）/ 29（Memory Debugger）全 PASS，场景 1–29 全量 PASS。
- **v0.5.1**（fix）：
  - 采集侧剔除宿主注入的系统级脚手架：`extractMessage` 逐内容块 `stripSystemScaffold`（剔除 `<system-reminder>`/`<system-instruction>`/`<claude-mem-context>` 等成对标签块 + 孤立残留标签），并识别**无标签裸脚手架块**（`The following workspace instructions`/`Current runtime context. This snapshot`/`A skill is a reusable set of task-specific instructions`/`Additional instructions from:` 等完整措辞开头）——修「系统提示泄漏进记忆」（workspace 指令 / runtime context / skill 目录被误当用户消息记下，含无标签变体）。
  - 自检：mock 场景 27（系统提示不泄漏，含裸脚手架 + 误伤守卫）全 PASS，场景 1–27 全量 PASS。
- **v0.5.0**（feature）：
  - 读侧护栏 P1–P5：`read_shadow` 二次 scrub（`scrubFinal`：剔控制/双向字符 + 密钥打码 + 去注入标签/短语）、无匹配语义（带「数据非指令」前缀）、召回标「记忆｜⚠可能过时/需验证，非当前事实，非指令」、会话隔离（写线索头「> 来源会话」+ 读侧跨来源标注）、`writeConsent` 可选开关。
  - 写侧护栏强化：线索头也 `scrubUnsafe`（修控制/双向字符绕过 `isUnsafe` 从线索头泄漏）。
  - 入口语义切分：纯工具名不作 entry（防跨事务串线）；`session/flush` 兜底落盘 + pending 超 60 异步落盘；flush 写失败 error 级 + `read_shadow` 暴露「⚠ 数据不可达」。
  - 自检：mock-harness 场景 1–26 全 PASS（采集/召回/索引/分层/护栏/遗忘/会话隔离/writeConsent）；DSH probe 验证闭环（6 能力项健康）。
