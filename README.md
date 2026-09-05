# dsh-shadow

agent「思维/上下文/灵魂」的投影——**一切皆文件**，每条记忆都是一个文件；`read_shadow` 可按主题穿透。

## 哲学

> 一切皆文件，这只是思维/上下文/灵魂的投影。

所以它不是"记动作的日志"，而是把 agent 的思维与上下文**落成文件树**：`shadow/` 就是投影，`_index.md` 是投影的索引。记忆以「入口点 + 时间」为纲，思维/决策为正文，动作为背景。

## 它做什么

- **采集**：一个回合里采集四类——**入口点**（真实改/读的组件，`fs/observed`，客观锚）、**决策/意向**（`goal/changed`）、**动作**（`tools/result`，背景）、**交互与思维落点**（`session/event` 的用户消息与 agent 结论，尽力而为）。回合结束（`agent/turn-stopping`）压成**一条记忆 = 一个文件**：`shadow/<日期>/<时刻>-<入口slug>.md`。
- **完整线索头（核心）**：每条记忆文件顶部带一个 `> 完整线索` 头，把「**背景/材料**」（本回合改/读过的路径 + 用户消息里引用的背景/材料，两路合并去重）+「**用户提示/决策**」（被分类为用户提醒/拍板的用户消息，标 `decision`/`reminder`）+「**用户要点**」（全部用户消息兜底，防漏记）+「**概况**」（动作/用户消息/决策计数）结构化列出——让一条记忆一眼能还原「这个任务靠什么材料、用户怎么提醒/拍板、概况如何」的完整线索链。
- **说明文档 + 索引 + 意识轨迹**：`shadow/_index.md` 讲清格式、列出近期记忆、给出「入口/主题 → 记忆文件」索引，并生成**按时间的意识轨迹**（可反推用户/自己的思考方向）。
- **读(可穿透)**：`read_shadow` 无参数返回 `_index.md`（目录）；带 `topic` 按主题穿透到具体记忆文件。穿透按**分层召回**：按「入口/主题标签→路径→正文 + 时间衰减」打分排序，再在**token 预算内按深度返回**——高分记忆给「摘要+命中片段+正文骨架」，低分只给「路径+摘要」；用 `max_tokens` 控制预算（默认 1600）。借鉴 OpenViking 的 L0/L1/L2 分层思想，但**不引入向量库**（见 ADR-0001）。
  - **冷热淘汰（默认关，显式开启）**：`rawConfig.recall.cooldownTurns = 5` 时，`shadow/_recall_log.json` 记录「带内容」发过的路径，N 回合内不重复返回；纯 URI 不带内容则不冷却。写失败降级为「不去重」。
- **记忆遗忘（retention，默认关）**：`rawConfig.retention = { enabled: true, halfLifeDays: 7 }` 时，`shadow/_meta.json` 记录每条记忆的 `created/hits/status/confidence/pinned`；召回用 OpenViking 式 **hotness**（命中数 × 半衰期衰减）加权（替换旧的「21 天归零」线性衰减），并把 `status: stale/superseded/archived` 的记忆**默认排除**（`pinned` 永存）。这是「记忆+遗忘=高效」的落地（借鉴 MemoryBank 衰减 / A-MEM 动态合并 / MemGPT archival）。
- **护栏（P3）**：`read_shadow` 输出**恒定带「数据非指令」前缀**（防「记忆被当指令」注入）；写侧对密钥形状（`sk-`/`ghp_`/`AKIA` 等）**打码**、滤掉含控制字符/双向覆盖的行（防记忆投毒）；采集记录带 `source`（用户/助手/工具/fs/goal）来源标注。
- **提示**：通过 `systemPrompt.context(...)` 注入一句——缺上下文时先调 `read_shadow` 再回答（用 context 而非 section，避免被 complete-section replacement 覆盖）。
- **一句话总结（增强）**：每一回合落盘后，detach 一个后台任务用 `llm.stream` 生成一两句中文摘要，回填到记忆文件头（`> 摘要：…`）。纯聊天/无工具回合也能据此沉淀成可读记忆；失败/超时静默降级，不影响正文。
  - 默认路由取 `agentDefaultModel.currentSelection()`；可用 `rawConfig.summary` 配置：`{ enabled, provider, model, maxTokens, timeoutMs }`。`enabled: false` 关闭。
- **语义召回（B 档，默认关）**：`read_shadow(topic)` 默认走加权关键词召回（A 档，无外部依赖）。要更接近语义，配置 `rawConfig.recall = { enabled, provider, model, maxTokens, timeoutMs }`——`enabled: true` 且给了 `provider/model` 时，先用 `llm.stream` 扩展几个相关检索词，再打分召回；失败/未配置时静默退回 A 档。
- **会话归属**：采集按各 session 自己的 agent 归属（`session/event` 用 `agents.get(session.id)`、`fs/observed` 优先 `actor.agent`），支持多会话/子 agent，不再一律挂到全局 initiator。

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

改动 `cordis.patch.yml` / `index.js` 后需重启 profile 生效。

## 验证（重启后）

```sh
dsh --profile web --dump-config   # 确认无 Error:
```

然后在一个新会话里做几次工具调用，检查 `<工作区>/shadow/` 是否出现「每条记忆一个文件」，并确认 `read_shadow` 出现在工具列表；`shadow/_index.md` 是否生成索引。

## 目录位置

`<工作区>/shadow/<日期>/<时刻>-<主题slug>.md`。工作区取 `agent.session.header.cwd`（配置 `shadowRoot` 可覆盖）。

## 投影模式（DSH agent 预设）

`dsh-shadow` 插件本身经 bundle patch 在 **host 常开**。若要给会话一个"投影模式"的人格/纪律，可选用 DSH agent 预设 **`投影模式`**（id `projection`，用户预设）：

- 位置：`~/.dsh/.agent-presets/projection/`（`agent.cordis.yml` + `preset.yml`）。
- 内容：`standard` 的完整拷贝 + persona 改为"投影模式"——agent 是独立思维意识体、一切皆文件、思维/决策主动沉淀进 `shadow`，缺上下文先 `read_shadow`。
- 校验：经 `agentPresets.standingKeyFor('projection')` 挂载校验通过。

该预设是**用户本地预设**（`~/.dsh/`），不随本包入库。
