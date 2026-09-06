# MEMORY.md — dsh-shadow 复盘：究竟懂了什么 / 边界（供下次记忆）

> 这是把 dsh-shadow 做完后**反推出来的关键理解与边界**，写给未来的自己/另一个 agent。
> 术语表见 `CONTEXT.md`，架构取舍见 `adr/`。本文记"为什么这么想"与"别踩的坑"。

## 一、究竟懂了什么才把任务做出来

1. **先定哲学，再定结构。** 这不是"记动作的日志"，而是「思维/上下文/灵魂的投影」，且「一切皆文件」——所以**每条记忆 = 一个文件**，而不是日志里的一行。这个判断直接决定文件树结构，而不是先写代码再起名。
   **核心目的（用户 2026-09-05 强调）**：dsh-shadow 是要**为每个已完成的任务记录「完整线索链」**——它**靠什么背景/材料**、**用户交互中提醒的注意事项/决策**，才得以完成。「完整线索」是最重要的产出（为什么、靠什么、怎么完成的），而不是零散事件。
2. **五类信号、五档可靠度。** DSH 里"发生了什么"是事件：
   - `fs/observed`（真实改/读的组件）→ **入口点**，客观锚（"用户在哪干活"）。
   - `goal/changed`（goal 变更）→ **决策/意向**。
   - `tools/result`（工具调用）→ **动作背景**。
   - `session/event`（会话消息流）→ **交互 + 思维落点**。
   - `agent/turn-stopping`（回合收口）→ **落盘时机**。
   可靠度从高到低排序，就把"哪部分能做实、哪部分尽力而为"定了。
3. **DSH 里"长期在"的是 host bundle，不是动态插件。** 会活过一个重启、跨会话的东西是 **profile 插件**（`dsh.bundle.patch` 注入宿主 composition 行）。会话内的 `cordis_define/cordis_run` 动态插件**重启即丢**。所以 dsh-shadow 走 profile bundle 插件。
4. **提示词注入用 `systemPrompt.context()`，别用 `section()`。** DSH 的 complete-section replacement 会覆盖掉普通 section；context 走独立的"当前运行时上下文"路径，不被覆盖（dsh-wechat 踩过的坑，直接避开）。
5. **`fs.writeText` 会建父目录**（实践中验证过），所以能放心写 `shadow/<date>/...` 嵌套结构。
6. **许多确切形状查不到，就用"守卫式最优解 + 重启后看运行时诊断再精修"。** DSH 打包源码是 minified 的，`session/event` 消息载荷没法干净查到——先按常见形状守卫式写，重启后抓一个真实载荷再校字段。

## 二、边界（能做什么 / 不能做什么）

**能**
- 采集：动作(`fs/observed`+`tools/result`) + 决策(`goal/changed`) + 尽力而为的交互/思维(`session/event`)。
- 一记忆一文件：`shadow/<日期>/<时刻>-<入口slug>.md`。
- `shadow/_index.md`：说明文档 + 今日摘要 + 近期记忆 + 主题索引 + 意识轨迹。
- `read_shadow`：无参读索引；带 `topic` 穿透到记忆文件。
- 按工作区隔离（`agent.session.header.cwd`，可 `shadowRoot` 覆盖）。

**能（增强：一句话总结）**
- 每一回合落盘后用 `llm.stream` 生成一两句中文摘要，回填记忆文件头（`> 摘要：…`），让纯聊天/无工具回合也沉淀成可读记忆。
- 实现要点：
  - **detach 后台任务**：`flush` 先落正文 + 重建索引，再 `void patchSummary(...)` 去生成/回填摘要，绝不 `await` 在回合收口（`agent/turn-stopping`）里——否则每次回合收口都会被一次模型调用阻塞。
  - **降级策略**：`llm` 服务缺失、路由缺失、`finish` 为 error/aborted、超时（默认 8s）都返回 `""`，回填阶段只在摘要可用时改写文件；正文已在第一步写入，失败不影响。
  - **消息可手构**：deepseek adapter 只读 `message.role`/`message.content`（`assertTextOnly`/`flattenText`），`id`/`source` 不在 serialize 校验路径里，所以手构 `{ id, role:'user', content:[{type:'text',text}] , source:{kind:'plugin',plugin:'dsh-shadow'}}` 即可，无需引 `createUserMessage`。
  - **路由**：默认 `agentDefaultModel.currentSelection()`；`rawConfig.summary = { enabled, provider, model, maxTokens, timeoutMs }` 可覆盖，`enabled:false` 关闭。
  - **AbortController + setTimeout**：host 侧用 Node 原生计时器 + AbortController 做超时取消（动态 cordis 不可用全局计时器，但本包是 host bundle 插件，Node 全局可用）。

**不能 / 边界**
- **不记录模型内部链式推理**——只记 agent **表达出来**的结论/分析，不是 COT 全程。
- **`session/event` 载荷已按类型契约核实并修正（2026-09-05）**：`SessionEvent = { type, seq, time, data }`；`user/message` → `data` 即 UserMessage（`data.content[]`），`assistant/message` → `data.message` 即 AssistantMessage（`data.message.content[]`）。`extractMessage` 只取 `type==="text"` 块，跳过 reasoning/tool-call。已用真实导出记录核对形状成立，此前"静默为空"的最大不确定点已解除。
- **`fs/observed` 曾误用 `target.path/uri`**：`FsTarget` 实际是 `{ targetKey, displayPath }`，会拿不到路径 → 入口点（客观锚）静默丢失。已改读 `target.displayPath`。
- **工作区解析盲区**：`Agent` 公开形状只保证 `id`；已用 `session/event` 的真实 `Session.header.cwd` 缓存（`cwdBySession`）兜底 `workspaceFor`，避免 flush 因取不到 cwd 而静默不写。
- **live 复验教训（2026-09-06）**：**隐式 cwd 解析在 live 会话是不可靠的**——把 `shadowRoot` 从配置里删掉后，插件在真实 DSH 会话里 `agent.session.header.cwd`/`cwdBySession` 解析不出 ws → `resolveWorkspace` 空 → `flush` 提前 return，**重启后完全不写**（写侧静默失效，和 F2 同模式的另一种表现）。**结论：要稳定写，插件依赖显式 `shadowRoot`；剥离它会断写。** 正确配置 = `shadowRoot` 指真实工作区 + `sandbox-policy.mode` 与 effective policy 一致（live 会话当时是 danger-full-access，若设 workspace-write 而 fs workspace 指别处会拦）。
- **进程级 `session/event` 监听已按 session 归属（2026-09-05 修复）**：不再一律归属 `currentInitiator`。契约确认 `Agent.id` 与 `Session.id` 同为 `SessionId`，`agents.get(session.id)` 可取到该 session 的 agent，故 `session/event` 用 `agentById(sid)?.id` 归属；`fs/observed` 无 agent 参数，用 `actor.agent?.id`（tool-execution context）优先、回退 `initiatorId()`。多 session/子 agent 不再串线。
- **索引/穿透已升级为加权召回（2026-09-05）**：`read_shadow(topic)` 不再纯子串匹配，改为「入口(6) > 主题标签(4) > 路径(3) > 正文(1) + 时间衰减」打分排序，并优先返回**摘要行 + 命中片段**（命中片段优先取非纯动作行）。B 档语义召回用 `rawConfig.recall = { enabled, provider, model, ... }` 开启，会用 `llm.stream` 扩词后打分；失败/未配置静默回退 A 档。
- **`session/event` 采集需先剔除宿主注入的系统脚手架（2026-09-05）**：用户/助手消息 content 里会夹带 `<system-reminder>…</system-reminder>`（workspace 指令 / runtime context / skill 目录 / 会话上下文）等系统提示；还可能以**无标签裸块**注入。若不先剔除，这些会被当作"用户/我"的正文记进记忆，污染记忆树（真实用户只有一句，其余 600 字预算全被系统脚手架填满）。实现要点：`extractMessage` **逐内容块**先 `stripSystemScaffold`（成对开闭标签 + 孤立残留标签），再剔「以已知系统提示完整措辞开头」的裸块，纯系统消息为空 → 跳过；识别用长且唯一的完整措辞，避免误伤正常用户文本。规则参考 claude-mem tag-stripping。
- **边界**：多 session 且同一秒 flush 且入口相同（如都 fallback 到 `shadow`）时，记忆文件名会撞（`compact()` 秒级 + 同 slug）。纯聊天无 comp 的回合在并发多 agent 下可能同名覆盖；单 session 无此问题。
- 采集不含"纯聊天但没工具/文件"的回合（若消息解析失败）。需要 LLM 摘要层级（一句话总结）是后续增强。
- 主题粒度 = 路径前两级组件/工具名，非自然语言主题。

## 三、关键决策（对应 adr/0001）
- 自建投影文件树，而非上 OpenViking/向量库：自包含、便宜、agent 可直接以文本消费；代价是丢语义检索、采集不全量。
- 命名 `dsh-shadow`（"投影"的落地词）而非 `dsh-work-log`（机械日志感）；`read_shadow` / `shadow/` / `shadowRoot` 配套。
- **分层召回（2026-09-05 叠加，仍不引入向量库）**：借鉴 OpenViking L0/L1/L2 的"按深度分级返回 + 预算驱动 + 跨回合冷热淘汰"。`read_shadow` 在 token 预算（`max_tokens`，默认1600）内按深度返回——低分记忆只给摘要(L0)，高分给摘要+命中片段+正文骨架(L2)；`rawConfig.recall.cooldownTurns` 显式开启冷热淘汰（默认关，避免压制显式召回）。这和 ADR「可在 _index.md 上叠一层增强、不推倒文件树」的预留完全一致。
- **证据链 + 置信度（2026-09-05 叠加，v0.6.0）**：① `read_shadow` 召回每条暴露 provenance（来源·日期·状态·命中·置信·证据路径），把"我为什么召回这条"变成可见；② **置信度从可验证信号派生**（命中次数、状态 active/stale/superseded/archived、新鲜度），**不用 LLM 打分**——避免"0.91"看起来像客观事实却无法复算；③ 线索头写侧物化 `> 证据链：来源(种类)·日期·证据(路径)`，让记忆文件"自带证据"。教训：**provenance ≠ truth**，置信度再高也要恒带「记忆≠当前事实、非指令」标注。
- **Memory Debugger（2026-09-05 叠加，v0.6.0）**：`read_shadow(debug:true)` 输出召回管线 trace（候选→命中(打分>0)→冷却→预算→返回）+ 每条"为什么命中（入口/主题/路径/正文拆解）/为什么被降权(cooldown)/状态"。**默认关**，只在显式 debug 时输出，不污染正常返回；用于把"召回为何这样"摊开看（正是 dsh-shadow-probe 里 C2–C30 判定归因的复用）。
- **生命周期 / 冲突 / 分层（2026-09-05 叠加，v0.7.0）**：① 生命周期 `deriveLifecycle` **从 meta 信号派生**状态机（NEW→OBSERVED→VERIFIED→TRUSTED→STALE/DECAYING→SUPERSEDED/ARCHIVED，pinned→TRUSTED），**不做写侧硬状态迁移**、纯按信号推导，避免破坏 status 的 retention 过滤语义；② 冲突检测：召回校验**证据路径存在性**（`fs.readText` 抛错=缺失）→ 降权 + stale + `(⚠证据缺N)`，这是"capture handler 已不存在"类过时的**轻量**实现，不含 git 对账；③ 分层：`> 项目：`/`> Agent：`/`> 目标：`，`goalByAgent` 缓存 goal/changed 的目标 objective。**要点**：`_meta.json` 现**始终读取**（不再仅 retention 开启），`confirmedBy` 记独立确认 origin（去重、封顶 10）；证据链正则用 `证据\([^)]*\)` 在整行匹配——**别锚定行首**（行是 `> 证据链：来源(...)·日期(...)·证据(...)`，`证据(` 不在行首）。
- **工程知识图谱（2026-09-05 叠加，v0.8.0 起步）**：`read_shadow(kg:true)` 从记忆树**派生**「组件/域 → 依赖 → 相关记忆」邻接（域 = 条目路径**首段**，best-effort；这正是**轻量 / 派生式**，不建持久化图谱）。**局限**：域取 `entry.split("/")[0]`，当真实项目条目是 `src/<module>/<comp>` 时域是 `src` 而非模块名——后续若要精确的「组件→域」需更聪明的域推导（如按 `src/` 之后的模块段、或组件清单映射），别当成已解决。这是「面向 Coding Agent 的工程知识系统」的地基，不是终态。
- **Soul Kernel / Experience（2026-09-05 叠加，v0.9.0，Soul 投影第一刀）**：① Soul = **curated 公理层**（身份/价值观/原则/品味/边界，`shadow/soul/soul.json`），**非事件流、按需查询**（`read_shadow({soul:true})`），只给指针不注入大块（延续"记忆+遗忘=高效"），是"为什么我是我"的锚；② Experience = **从现有完整线索头派生**结构化对象（情境/问题/决策/实现/证据/结果/教训/项目/目标），`read_shadow(topic,{experience:true})`，**不是重写写侧**——扁平记忆行已是数据源，读侧按需结构化成对象。**教训（本刀踩的坑）**：① 解析线索头字段的正则**必须带 `/m` 多行旗标**（`^`/`$` 才按行锚定，否则全串锚定 → 抓到空）；② 搜索 `> 证据链：...证据(...)` 里的证据路径，要在**整行**匹配 `证据\([^)]*\)`，**别锚定行首**。这两条已成体系：凡是 `match(/^.../m)` 解析多行文本的地方都要 /m。
- **Memory≠Evidence 裁决接缝（2026-09-06 叠加，v0.10.0，ADR-0002）**：证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded` 三态。**为什么在召回后处理**：Supersede 需要先遍历所有记忆拿到"每入口最新时间"（`newestByEntry`），所以先读全部 text 收集 `entryList`，再对 `scored` 逐条裁决（旧记忆降权 0.7 + 标 superseded，新记忆 fresh）。**关键**：`verdictOf` 里 superseded 优先于 stale（同入口有更新记忆是"后来修正"的最强信号）；`Outcome`/`Reflection` 由裁决**派生**而非写侧采集（更快更稳；要"agent 主动记验证/反思"再加法）。**界线**：Shadow 绝不建向量/BM25（ADR-0001），证据验证可插拔（现=fs 存在性，zg 作可选证据源 `verifyEvidence` 接缝）；"无法判定视为存在"避免误伤非代码路径。
- **Observer / Observation Window（2026-09-06 叠加，v0.11.0）**：Oracle→Observer 的分水岭。**现在的 `read_shadow(topic)` 是 Oracle**（端全局答案）；`observer:true` 才是模拟人。"灵魂看见整体，思想经历局部"的工程落点 = **asOf 时间锚定**（只召回 `date ≤ asOf`）+ **窗口诚实**（只呈现「当时可知」，outcome/lesson/verdict 标 `[后验]`）。**注意**：`renderByTier` 在 observer 模式不看 tier/budget（直接窗口视图，把后验标 [后验]）；`asOf` 需要 `listMemories` 的 `mm.date`（日期目录名）。**别踩的坑**：observer 的 `当时可知` 取自 `# entry`/背景/材料/用户提示/决策，若记忆只有动作行（L0）则 `当时可知` 可能只剩 entry——这是偏 Oracle 化的边界，后续可考虑把"当时行动"也作为当时可知的一部分。
- **Projection + Observer 透镜（2026-09-06 叠加，v0.12.0）**：核心 = `Global Model ≠ Observation Window`，dsh-shadow 是"**人类观测结构投影系统**"，`project()` 是收敛点。**Observer 透镜**（soul.observer.what_matters/what_to_ignore，curated）决定显著；**Projection**（`read_shadow(topic,{project:true})`）→ `LocalContext{relevant,current_state,uncertainty,excluded}`。**与 retrieval 的本质区别：retrieval=排名，projection=带取舍的局部上下文，`excluded` 是"为体验而限制视角"的化身**。**关键提醒**：① 透镜**刻意不做成 values/personality**（那是 Persona）；② **自动推断显著/人格=研究级问题，v0.12 用 curated+启发式，不做黑箱**；③ 最小 Judgment 就在 `relevant.experiences`（情境→决策→教训）。
- **Judgment + Taste（2026-09-06 叠加，v0.13.0）**：灵魂四对象（Soul/Experience/Judgment/Taste）+ Memory 五层就位。① Judgment：`read_shadow(topic,{judgment:true})` 从含「决策」的记忆派生「面对情境→我判断/选择决策」，按情境去重取最近——**Knowledge ≠ Judgment**（回答"遇到这种情况我如何判断"）；② Taste：`read_shadow({taste:true})` 读 curated 偏好（`soul.json.taste` + `shadow/taste/taste.json`），**curated-first**，自动品味识别不可靠故 v0.13 不做采样（留后续）。**边界**：Taste 只读不采；Judgment 依赖记忆里有「决策」记录，纯动作记忆无判断可派生。
- **Evidence Gateway（2026-09-06 叠加，v0.14.0）**：`EvidenceProvider{discover()/verify()}` 抽象，Shadow 只问 `verifyEvidence(EvidenceRef)`，底层 fs/zg/git 可插拔。**关键边界**：① zg 是**检索层不是裁决层**——Discovery/Ranking/Verification 在 Provider，**Arbitration 留在 Shadow Core**（zg 找到→Candidate→Shadow 裁决→Verified/Stale/Superseded）；② **zg 未装→`unavailable`，绝不静默 fallback 成 verified**（延续禁止静默失败）；③ `conflictOf`/裁决接缝改经 `verifyEvidence` 路由（默认 fs，行为不变）。**陷阱**：① tsc 在 moduleResolution:Bundler 下不解析 Node 内建模块 → tsconfig 需 `"types":["node"]`（插件宿主侧无浏览器全局，安全）；② `import("child_process")` 用 `zg` 生查（CLI 第一版，MCP 是 transport 优化）；③ 路径验证用**严格 fs**（缺失抛错），宽松 fs(返回"")会把缺失当存在。
- **Core Refactor + P1 语义（2026-09-07 叠加，v0.15.0）**：① **结构收敛**——`index.ts` 从 1432 → **124 行薄 Adapter**；读侧 query/router 拆 `query/query.ts`（`runReadShadow`）、写侧采集内核拆 `core/writer.ts`（`createShadowCollector`），领域按 evidence/observer/soul/retrieval/persistence 分模块（ADR-0003/0004/0005），index 只 re-export core/scope。**关键约束**：外部**仍是单一 `read_shadow`**（Query Router 在内部，别拆 8 个工具炸选择空间）；`index.ts` 只保留 config 解析 + 事件 `context.on()` 接线 + 工具/提示注册 + 闭包型依赖注入（`verifyEvidence/expandTerms/getFlushWarn` 留在 Adapter，query 不直接读 context）。② **P1 语义**（ADR-0006）——**Summary≠Lesson**（Experience `summary`=摘要/`overview`=概况/`lesson`=裁决派生教训，教训不再复用摘要）；**confidence 分维**（`{retrieval,evidence,experience,judgment,projection,overall}`，取代单一玄数）；**superseded→decision lineage**（同入口记忆按时间排 `修正链 A→B→…`，保留"为何变化"，provenance 暴露 `修正链`）。③ **Trace + P2**（ADR-0007）——新增 **Trace 中间层**（Events→Trace→Memory→Experience，`core/trace.ts`，写侧 `traceOf` 正常化后塑形、**落盘不变**）；Observer `asOf` 支持 `{timestamp,timezone}` 对象形态；Soul 标注「curated 工程化投影、可证伪不宣称全知」+ `Observer Lens`；`_index/_meta/_recall_log` 明确为 **Derived Artifacts**（Memory 文件是 source of truth，可重建）。**教训**：语义修正是**有意改行为**（非结构迁移），须同步改写断言它们的 mock（场景 35 教训改派生、场景 36 新增 `修正链`、Soul/asOf 兼容），否则回归误报；`tsc` 无输出≠通过，用 `if ($LASTEXITCODE -eq 0)` 串链命令才能确定。（v0.14 后面临"是否把 Trace/P2 都做完"——已按 ADR-0003 §3 的 P1→P2 顺序落地。）

## 四、下次做类似"思维记忆"的事
- 先问用户"这记的是什么层"——动作，还是思维/决策/交互？这决定事件源与可靠度排序。
- 持久化载体：profile bundle 插件 > 会话动态插件 > 需重启的 preset。
- 提示词：`context()` > `section()`。
- 拦截"静默失效"：凡依赖一个未能从源码核实的字段名，都当作"待重启验证"并显式留 mark，别假装已通。

## 五、方向与调研习惯（用户 2026-09-05 定）
- **调研优先级**：研究这类东西时，**先查论文/学术站**（arXiv / ICSE / FSE / ASE / 软件学报等，找优秀研究），**其次才看 GitHub 上的参考源码**（如 `vendor/_src` 这批 20 个仓库）——GitHub 材料是"底料/参考"，不是第一选择。这条是对既有 research-before-action 的强化：文档出处优先认论文/文献，GitHub 佐证。
- **核心设计方向（重要）**：大模型要**像人一样思考**——**既能有记忆，也能有遗忘**。**记忆 + 遗忘本身即高效**（不必另说"保持高效"：会记 + 会忘 = 在有限上下文预算内"记得该记的、忘得掉该忘的"，这就是高效）。落地到 dsh-shadow / projection：记忆系统**不能无限累积**，要有「记」与「忘」的平衡——分层热度（L0/L1/L2）、跨回合冷热淘汰（`recall.cooldownTurns`）、token 预算（`max_tokens`）、一句话摘要压缩，都是「记与忘」的机制（即高效本身，而非额外去追求高效）。
