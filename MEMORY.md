# MEMORY.md — dsh-shadow 复盘：究竟懂了什么 / 边界（供下次记忆）

> 这是把 dsh-shadow 做完后**反推出来的关键理解与边界**，写给未来的自己/另一个 agent。
> 术语表见 `CONTEXT.md`，架构取舍见 `adr/`。本文记"为什么这么想"与"别踩的坑"。

## 一、究竟懂了什么才把任务做出来

1. **先定哲学，再定结构。** 这不是"记动作的日志"，而是「思维/上下文/灵魂的投影」，且「一切皆文件」——所以**每条记忆 = 一个文件**，而不是日志里的一行。这个判断直接决定文件树结构，而不是先写代码再起名。
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
- **进程级 `session/event` 监听已按 session 归属（2026-09-05 修复）**：不再一律归属 `currentInitiator`。契约确认 `Agent.id` 与 `Session.id` 同为 `SessionId`，`agents.get(session.id)` 可取到该 session 的 agent，故 `session/event` 用 `agentById(sid)?.id` 归属；`fs/observed` 无 agent 参数，用 `actor.agent?.id`（tool-execution context）优先、回退 `initiatorId()`。多 session/子 agent 不再串线。
- **索引/穿透已升级为加权召回（2026-09-05）**：`read_shadow(topic)` 不再纯子串匹配，改为「入口(6) > 主题标签(4) > 路径(3) > 正文(1) + 时间衰减」打分排序，并优先返回**摘要行 + 命中片段**（命中片段优先取非纯动作行）。B 档语义召回用 `rawConfig.recall = { enabled, provider, model, ... }` 开启，会用 `llm.stream` 扩词后打分；失败/未配置静默回退 A 档。
- **边界**：多 session 且同一秒 flush 且入口相同（如都 fallback 到 `shadow`）时，记忆文件名会撞（`compact()` 秒级 + 同 slug）。纯聊天无 comp 的回合在并发多 agent 下可能同名覆盖；单 session 无此问题。
- 采集不含"纯聊天但没工具/文件"的回合（若消息解析失败）。需要 LLM 摘要层级（一句话总结）是后续增强。
- 主题粒度 = 路径前两级组件/工具名，非自然语言主题。

## 三、关键决策（对应 adr/0001）
- 自建投影文件树，而非上 OpenViking/向量库：自包含、便宜、agent 可直接以文本消费；代价是丢语义检索、采集不全量。
- 命名 `dsh-shadow`（"投影"的落地词）而非 `dsh-work-log`（机械日志感）；`read_shadow` / `shadow/` / `shadowRoot` 配套。

## 四、下次做类似"思维记忆"的事
- 先问用户"这记的是什么层"——动作，还是思维/决策/交互？这决定事件源与可靠度排序。
- 持久化载体：profile bundle 插件 > 会话动态插件 > 需重启的 preset。
- 提示词：`context()` > `section()`。
- 拦截"静默失效"：凡依赖一个未能从源码核实的字段名，都当作"待重启验证"并显式留 mark，别假装已通。
