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

### 改代码后先过闸门：`npm run verify`

**任何改源码之后的下一步，唯一要记的命令是这一条**（v1.15.38 起，ADR-0077）：

```text
npm run verify
= npm run typecheck:tools      工具面类型门
+ npm run audit:layers         结构门（v1.15.41：文件级无环 / 纯模块白名单零副作用 / 方向禁令）
+ npm run eval:retrieval:check 评测门完整性（v1.15.42：协议自检 / 基线只含聚合面 / 同源 / 读数齐备）
+ npm run audit:ratchet        分诊棘轮（v1.15.45：线索数只能降不能升；桶消失或新桶即红）
+ npx tsc --noEmit             插件面类型门
+ npm run test:all             = npm run build && node tools/run-tests.ts
                               （43 个行为测试 + 5 个工具自检 = 48 项，串行、每文件一个子进程）
```

**它失败就不要往下走**（跑评测 / 长耗时验证 / 声称「全绿」之前必须先过它）——
否则一次编译错误会被伪装成一次评测结论。**注意它会写 `dist/`**（含 `build`）：测试 import 的是
编译产物，不构建就会测到旧 `dist`。

**为什么要有这条命令**（ADR-0077 D2）：在此之前「全绿」只能靠人**记得**逐个跑 `node test/*.test.ts`
—— 于是「便宜且确定性的完整缝合线检查」实际上**没有单一入口**。补上它的**当轮**就抓到两处**既有**失败
（一处时间炸弹测试、一处工具自检），即此前「全绿」的结论**当时是错的**。

**结构门查什么**（v1.15.41，T13 前半）：① **文件级依赖图无环**；② **纯模块白名单零副作用**
（`core/paths.ts` / `core/types.ts` / `core/util.ts` / `security/scrub.ts`，**带腐化自检**：白名单里的路径不存在**也算违规**）；
③ **方向禁令**（`core↛query`、`core↛tools`、`persistence↛query`、`query↛tools`、**任何层↛`index.ts`**、任何层↛`agent-presets`）。
**它刻意不查**：**层间环** —— 实测存在 `{core, evidence, persistence}` 层间环，成因是 **`core/` 是混合脊柱**
（`paths`/`types`/`util` 纯，`memory`/`writer-materialize`/`toolset-exec` 有副作用），**文件级并无环**；
把它写成禁令会让门**当场就红**（假闸门）。CLI 会打印这条成因与**语料口径**。单独入口：`npm run audit:layers`。

**评测门查什么**（v1.15.42，T14）：三档，**可用性不同，别看混** ——

| 档 | 命令 | 查什么 | 本部署可用性 |
|---|---|---|---|
| 确定性 | `npm run eval:retrieval:determinism` | 同一输入**两跑功能字段逐字节相同** | ✅ 恒可用 |
| 完整性 | `npm run eval:retrieval:check`（**在 `verify` 里**） | 协议自检 / 基线**只含聚合面** / 协议同源 / 门控读数齐备 | ✅ 恒可用 |
| 回归 | `npm run eval:retrieval:compare` | 与**签入基线**比，超容差即失败 | ⚠ **只在冻结语料上**；本部署的正常结论是**「不可比」**（退出码 **3**） |

**为什么回归档在本部署恒「不可比」**：本仓语料是**活的 `.shadow` 记忆**，插件每回合都在写新记忆
（实测两次调用之间 1414 → 1435 条）⇒ 基线里钉的 `dataset_sha256` 立刻过期。
**这不是缺陷，是语料性质**：哈希钉死的基线只在「语料冻结」时才有意义。
要真正启用回归门，把一份语料快照放到别处并 `SHADOW_EVAL_ROOT=<冻结工作区>` 再 `--update-baseline` / `--compare`
（**是否物化这份副本是使用者的取舍**，本仓不替你复制真实记忆）。

> 单个测试仍可直跑：`node test/<名字>.test.ts`（每个文件自己打印 `ALL PASS ✅`）。
> 两个审计工具另有单独入口：`npm run audit:wiring` / `npm run audit:drift`（**人工分诊**用，不是门禁）。

### 让它主动用起来

在 agent 预设里通过 `systemPrompt.context(...)` 注入一句——缺上下文时先调 `read_shadow` 再回答（详见「提示接入」）。

## 哲学

它不是"记动作的日志"，而是把 agent 的思维与上下文**落成文件树**：`.shadow/` 就是投影，`_index.md` 是投影的索引。记忆以「入口点 + 时间」为纲，思维/决策为正文，动作为背景。

## 它做什么

`dsh-shadow` 把 agent 的一回合压成「一条记忆 = 一个文件」，可穿透召回，并逐步升级为一套「灵魂投影系统」。核心能力按主题分组如下。

### 默认开关（装完什么都不动会怎样）

**只读工具不写工作区；会写、会烧 token 的增强默认都关。**默认开的是**四项**（采集与落盘、一句话摘要 `summary`、查询观测 `queryLog`、Episode 回溯 `episodes`）—— 其中**只有 `summary` / `queryLog` 能一行关掉**，`episodes` 目前**关不掉**（见下表注 ①），采集本身也**没有**总开关（只有语义不同的 `writeConsent`，见注 ②）。

> **关于「成熟度」列的读法（v1.15.34 / D8）**：本仓**不给自己打 `stable`/`beta`/`experimental` 等级**
> （全仓无此口径；`adr/0073:53` 亦自陈「0 个 ADR 带『重新评估条件』小节」）。若要凭空造一套等级，
> 就是**让文档比事实强** —— 正是 ADR-0072 刚修过的那种谎。
> 故该列填的是**可核实的代理信号**（三选一，均带出处）：
> **有开放未验证项**（列出 ADR/待办）· **无开放未验证项** · **边界 ADR 未接受**（已提出/暂不实现）。
> 它恰好回答了「成熟度」那一列原本要回答的问题：**哪些是「稳定但耗 token」，哪些是「接口还可能变」**。
>
> **「降级行为」列是 ADR-0049「缺件不静默」的一眼全览**。标 **⚠️静默** 的格子表示
> 「关闭或缺件后行为退到某处，但**没有任何可见信号**」—— 按 ADR-0049 它们是**候选缺陷**，
> 已单独立账（`BACKLOG.md` **T8**，共 7 条），**不在表里写一句敷衍的话盖过去**。

| 能力 | 默认 | 成熟度 | 降级行为（关闭 / 缺件时退到哪） | 晋级 / 启用标准 | 开着会怎样 · 怎么开 |
|------|------|--------|--------------------------------|------------------|----------------------|
| 采集与落盘 | **开**（无总开关） | **无开放未验证项**（ADR-0074 已于 `v1.15.40` 第 4 轮真机复核，**B3 闭环**） | 写失败 → `lastFlushError` + `console.error` → **读侧顶部横幅**（可见） | 仓库未定义 | 每回合压成一条记忆文件；`writeConsent: true` 改成「仅用户明说才落盘」（注②） |
| 一句话摘要 `summary` | **开** | 无开放未验证项 | 缺 `llm` / 缺 route / finish 出错 → `streamText` 返回 `""` → 文件里**只是没有** `> 摘要：` ⚠️**静默** | 仓库未定义 | 落盘后后台 LLM 生成一两句摘要；`summary.enabled: false` 关 |
| 查询观测 `queryLog` | **开** | 无开放未验证项 | 写失败 `catch {}` → 观测丢弃，读侧显示「尚无记录」→ 与「从没查过」不可区分 ⚠️**静默** | 仓库未定义 | 旁路写 `.shadow/query-log/<date>.jsonl`；`queryLog.enabled: false` 关 |
| Episode 回溯 `episodes` | **开**（且**关不掉**，注①） | 无开放未验证项 | derive 抛错 / 写 `_index.md` 失败 → 仅 `console.log` ⇒ 索引可**静默陈旧**；读侧 `deriveEpisodes` 无 try/catch → 直接抛 ⚠️**静默** | 仓库未定义 | `_index.md` 生成任务回溯段；聚合间隔 `gapMinutes` 默认 60 |
| 语义召回 B 档 `recall` | 关 | 无开放未验证项 | `expandTerms → []` → 只用原词跑 A 档，**输出无任何标记** ⚠️**静默** | 仓库未定义 | 开需 `recall = { enabled: true, provider, model }` |
| 冷热淘汰 `recall.cooldownTurns` | 关（0） | 无开放未验证项 | 台账**读**失败 → 静默当空台账 ⇒ **冷却静默失效** ⚠️**静默** | 仓库未定义 | 设 `cooldownTurns: 5`：N 回合内不重复返回同一段 |
| 召回 trace `recall.debug` | 关 | 无开放未验证项 | 无降级（仅不输出 diag，答案路径不变） | 仓库未定义 | 开需 `{ debug: true }` 或 `recall.debug: true` |
| 召回降权 `recall.deprioritize` | 空（不降权） | 无开放未验证项 | 无降级（空配置不降权）。注：**启用后**降权只在 debug 输出可见 | 仓库未定义 | 路径/入口含这些子串的命中打分 ×0.4（**只降权不移除**）；如 `["references-agents", "_reports"]` |
| 记忆遗忘 `retention` | 关 | 有开放未验证项（ADR-0067 / ADR-0068 真机待验） | 关闭 → 不做 hotness 加权、`registerMeta` 直接 return ⇒ `_meta.json` 不建档；差异**不可见** ⚠️**静默** | 仓库未定义 | `retention = { enabled: true, halfLifeDays: 7 }`：hotness 加权（注③：`stale` **不是**排除项，它喂生命周期标签） |
| GC / 归档 `forget` | 关 | 有开放未验证项（`minHits` 链随 ADR-0067 待真机验） | 关闭 → `isForgettable` 恒 false、`maxActive` 失效（无降级） | 仓库未定义 | `forget.enabled: true` 才把低价值记忆移出活跃召回集（文件保留，Forget≠Delete） |
| Episode 收口归档 `compact` | 关 | 有开放未验证项（ADR-0068 `runCompact` delta 真机未验） | 关闭 → 直接 return，不合并（无降级） | 仓库未定义 | `compact.enabled: true` 才合并原子文件 |
| LLM 推理导航 `llmRecall` | 关 | 无开放未验证项 | 缺 `llm`/route/解析不出编号 → `[]` → 确定性 `renderRecovery`，**无标记**；且 `label:""` 使异常**也不打日志** ⚠️**静默（最彻底）** | 仓库未定义 | 开需 `llmRecall = { enabled: true, provider, model }` |
| Projection Store `projectionStore` | 关 | 有开放未验证项（ADR-0069 真机端到端；D1 `invalidateFor` 未接线） | 读失败 / 坏行 → 全量重派生，**结果仍正确**、只是无缓存 ⚠️**静默** | **有**：`projection-store.ts:5`「Node 稳定 + query 稳定 + rebuild 成本明显」 | `projectionStore.enabled: true` |
| 目录级摘要 `abstracts`（v1.15.35 / ADR-0075） | **开** | **边界 ADR 已接受但收益未验证**（ADR-0075 自陈：召回收益未测 → T9） | 写失败 → `console.log` 且该目录**不列入** `_index.md`（**部分可见**：索引里看不到它，但无显式 warn） | 仓库未定义 | 每日期目录写一份 `_abstract.md`（L1 + L0）；`abstracts.enabled: false` 关、`showInIndex` 控制索引里列几个（默认 3） |
| Knowledge Engine `knowledgeEngine` | **并非「关」——闸门不存在**（注④） | **边界 ADR 未接受**（`adr/0047` 已提出；`adr/0046` 实现计划冻结） | 读路径**无条件**建树；唯一闸门 `llmNavigate`（默认关）→ 确定性检索，**输出显式标注**「LLM 导航未启用/失败」（可见） | 仓库未定义 | `mode:"knowledge"` 直接用；`llmNavigate.enabled` 是**唯一**闸门 |
| 工程知识图谱 `kg` | 关（注⑤：**不是 config 键**，是 per-call 参数） | 无开放未验证项（已知局限：`MEMORY.md:92` 域推导，未解决） | 未传 → 不加图谱块；传入无匹配 → 输出「暂无匹配的组件/域」（无降级） | 仓库未定义 | 按需 `read_shadow(topic, { kg: true })` |
| 证据 Provider `evidenceProvider` | `fs` | 有开放未验证项（ADR-0059 真机 `host.fs`；V1 zg 未装未实测） | zg 未装 → `unavailable` + `zg_not_installed`；provider 拼错 → `unavailable` + `provider_unknown`；逐条 status+reason + 可执行缺件提示（可见） | 仓库未定义 | 换 `zg` 需已装 CLI；未装报 `unavailable`，不静默 fallback |
| 索引候选 `indexEngine`（**原表缺此行**） | `fs` | 有开放未验证项（V1：本机 `zg`/`semble` 均未装 ⇒ 两条 provider 路径**未实测**） | `fs` = 全量扫描（无外部依赖）；`zg`/`semble` 未装 → `unavailable` + 缺件提示，**绝不**冒充候选（可见） | 仓库未定义 | `indexEngine.provider` = `fs`（默认）/ `zg` / `semble` |

**表注（每条都对应一处实现与文档不符，或一处「看起来有开关其实没有」）**

⓪ **行数**：原表 16 行 ⇒ v1.15.34 补 **`indexEngine`**（原缺行）、v1.15.35 补 **`abstracts`**（D6 新能力）
⇒ **现 18 行**。

① **`episodes` 关不掉**：`showInIndex: 0` 会被 `core/writer-core.ts:69` 的 `|| 8` 吞掉 ⇒
   `core/writer-materialize.ts:161` 的 `episodeShow > 0` 闸门**恒真**（死分支）；`gapMinutes: 0` 同样被
   `|| 60` 吞掉（`:68` / `core/episode.ts:230`）⇒ 两处 `Math.max(0, …)` 永不生效。
   **这是缺陷，不是设计**（用 `||` 取默认值把「显式 0」与「未传」混为一谈）⇒ 见 `BACKLOG.md` **T8**。
② **采集没有总开关**：`writeConsent` 的语义是「改成仅明说才落盘」，**不是**「关掉采集」。
③ **`retention` 的「stale 默认排除」在代码里没有对应实现**：`staleDays`/`stale` 在
   `retention.enabled` 判断**之外**计算（`query/query.ts:275-276`），关闭 retention 也照标 stale；
   而 `stale` 只喂生命周期标签（`observer/arbitrate.ts:15,28,39`、`core/lifecycle.ts:33`），**不做排除**。
   唯一带「排除」语义的是 `retention.enabled` 时对 `rec.status !== "active"` 的 `continue`（`query/query.ts:279`）。
   原表把它写在「默认」列，属**串列**。
④ **`knowledgeEngine` 的闸门不存在（v1.15.34 实测校正的硬缺陷）**：`ShadowConfig.knowledgeEngine.enabled`
   **生产零读取**（全仓唯一读取是 `core/writer.ts:79` 读 `.llmNavigate`）；`query/reads.ts:141`
   **无条件**建树；且 `createKnowledgeEngine` 原本收一个 `config` 形参却**从不使用**它
   （已删死形参）。⇒ 原表写「默认 关 / `enabled: true` 启用」描述的是**一处不存在的开关**。
   本 mode 的**唯一**闸门是 `llmNavigate.enabled`。
⑤ **`kg` 不是 config 键**：它不在 `ShadowConfig` 里，只是 per-call 参数（`query/query.ts:424`），
   原表却把它排在「默认」列里，与真正的 config 默认值混用同一列。

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

**当前版本：`v1.15.40`（本地全部材料总台账 `MATERIALS.md` + 平台契约纠错，T16）** —— 最新几版摘要：

| 版本 | 主题 |
|------|------|
| v1.15.55 | **修台账里的高危条目（6 类）+ 修闸自身的 2 处缺陷**；`verify` **52/52**。**高危**：① **flush 顺序反了** —— 先 `pending.delete`/`comps.delete` 再 `if (!ws \|\| !fs) return` ⇒ 取不到工作区/会话 fs 时**整批记录已被消费**：没落盘也没留痕（`lastFlushError` 未设 ⇒ 读侧告警**在最需要它时失效**）⇒ 取 ws/fs 提到消费前，取不到则**保留 pending** + 留痕。② **索引失败后照读陈旧索引** —— `rebuildIndex` 吞异常返回 void 且 `ensureIndex` 无条件清 `indexDirty` ⇒ 一次失败后**再也不重建** ⇒ 返回 boolean、失败**不清 dirty** + `lastIndexError`（渲染「索引可能不是最新的」）。③ **证据落盘失败仍播报 `registered`** ⇒ 返回 `{evidence, persisted}`，未落盘时明说「**未落盘**」。④ **假设落盘失败仍打印 `hypotheses N`** ⇒ `writeHypothesis` 返回 boolean，报「其中 k 条未落盘」。⑤ **台账坏件 ≡ 空件**（冷却静默清零 ⇒ 已冷却记忆被重发）⇒ 坏件带 `corrupt` + `writeLedger` 返回 boolean。⑥ **600 字截断无痕迹**（长消息尾部从未落盘）⇒ 显式写「**已截断**：原文 N 字」。**闸自身的缺陷（本轮真实发生）**：⑦ **V7 语料闸把 `.git` 当语料** —— `git gc` 打包松散对象 ⇒ 目录数 **428→185** 而语料未变（指纹相同）⇒ 假 **PARTIAL** ⇒ 遍历排除 `.git`；⑧ **PARTIAL 拒绝录基线 ⇒ 闸堵死自己的修正**（实测卡住）⇒ 目录数判据改用**文件面定案**（文件健康 ⇒ 判为口径/结构变化，NORMAL **但必须印理由**），保留两档保护（文件面也掉 / 目录掉到 **<10%**）⇒ 真截断仍拦。**标定**：`corpus-health.selftest.ts` 新增 ⑪ 并把 10% 边界显式化；`audit-layers.selftest.ts` 新增 ⑨（未解析 import **计违规** —— 曾经只打印、退出码 0 ⇒ 改坏一个 import 路径即可让违规边从判据里消失）；`test/review-fixes.test.ts` 加 ④⑤。**自查改正**：我把语料指纹写成「路径 + 全文」，实际是 `sha256(路径集合)`**不含内容** ⇒ 措辞已改准（论点不变：同一路径集即没丢文件）。**仍未修**：`adr/0083` §6.3 的中危/待定语义 · `core/memory.ts:77-79` · 169 个测试类型错误 · 整目录未读 |
| v1.15.54 | **对抗性审查（按缺陷类全仓扫）**：修 **7 类** + **三条新纪律** + 一份未修线索台账；`verify` **52/52**。**方法**：三个角度**并行只读审查**（①报错却仍生效 ②静默丢弃 ③判据分叉），**每条动手前我自己读过原文核实**（不据报告直接改），三份报告共**排除** 30 余条可疑点并给理由。**已修**：① **判据分叉** —— 正/负结果分类器在**三处**各写一份且**答案不同**（实测 `"依赖降低"` 一边 true 一边 false；`"unstable"` 因 `includes("stable")` 恰好相反）⇒ 同一份 trace 一处记成功、一处记反例；收进 **`core/polarity.ts`**（词表**并集** + 负向**一票否决**），**已知语义变化已标注**（`依赖降低/solved/…` 由反例→支持、`unstable` 由支持→反例，**未回溯重算历史**）。② **`_meta.json` 坏件 ≡ 空件**：解析失败返回空快照且不报，`mutateMeta` 把它**整体写回** ⇒ 一条坏字节把全工作区 pinned/archived/compacted/hits **清零** ⇒ `MetaSnapshot.corrupt` 显式标记 + 遇坏件**直接放弃**。③ **validation timeline 坏件被覆盖** ⇒ append-only 历史永久销毁 ⇒ 新增 `readTimelineDetailed` 区分「还没有」/「读不出」，坏件**拒绝覆盖** + 读路径播报。④ **写失败报成功**（`writeMetaGuarded` 非冲突错误 `return true`，而 `true` 契约是「落盘成功」）⇒ 三态 `MetaWriteOutcome = "ok" \| "stale" \| "failed"`。⑤ **未知枚举落回默认值**（枚举外 `disposition` 静默落进 `open` 桶污染 buckets/最老/p90，**本轮新加的字段被审查当场指出**）⇒ 单列 `invalidDisposition` 且**不进任何桶**。⑥ **`query/query.ts:220` 漏 `isConcreteLocator`**（另三处都有）⇒ glob 被当路径验、必然 not_found ⇒ 补上。⑦ **测试面从不被类型检查**（`test/*.ts` 不被任何 tsconfig 覆盖，却用 `node x.ts` 跑）⇒ v1.15.52 手写 fixture 少一个必填字段**静默变成错的语义** ⇒ 新增 `tsconfig.test.json` + `typecheck:tests` **接入 `verify`**。**三条新纪律**（`adr/0083`）：**坏件 ≠ 空件**（禁止把解析失败后的空对象写回）· **未知枚举不得落回默认值** · **判据收一处要说清「怎么收」**并标注会改变哪些历史分类。**边界**：审查另撞出 **约 30 条确证未修** + **169 个既存测试类型错误** + **整目录未读**（`adaptation/`/`agency/`/`federation/`/`long-horizon/`/`simulation/`/`soul/`，`tools/*.selftest.ts` 全部未读）⇒ 逐条带 `文件:行号` 记入 `BACKLOG.md` §六，**不得读成「已修」或「不存在」**；棘轮**如实变红 4 处并逐条点名后重录**（`b_keys 105→107` 正是 `outcome=ok`/`outcome=failed`） |
| v1.15.53 | **对抗性审查 + 全部修复**：原语 **4 处真缺陷**、M1 读数 **3 处缺维度**；`verify` **51/51**。**审查判据**：① 同一份数据会不会给出**两个答案** ② **报了错是否仍然生效**。**`core/proposal.ts`（`adr/0082` §8）**：① **重复 id 报了违规却仍然生效** —— `proposals.set()` 照旧覆盖，后一条**静默顶掉**前一条的语义；confirmation 侧连检测都没有 ⇒ 改为 **违规 + 保留首见**（闸⑭）。② **判据分叉**：`candidateStats` 自写一遍分类，`action!=="confirm"` 即算「已裁决」⇒ **`revoke` 被算成「被拒」**，且被撤销的候选落进 `pendingConfirmation`（同一份记录：事实层说「消失」、统计层说「被拒/还没人看」）⇒ 抽出 `collect()` + `effectiveConfirmations()` **两层共用**，四分之一 `confirmed/rejected/revoked/pending`，口径可机械断言 `candidates = 四者之和`（闸⑬）。③ `oldestCandidateDays` 取**全部**候选最老（与「找没人看的候选」的用途不符）⇒ 改名 `oldestPendingDays` 只统计 pending，并补 `unmeasuredAges`（缺件不静默）。④ **F8**：`acceptanceRate` 混所有 `actor` ⇒ **tool 自确认能刷成满分** ⇒ 新增 `byActor`（human→tool→ci），**总体率只认 human，无 human 裁决 ⇒ `null`（不可测不报 0）**（闸⑫）。**`core/decision-outcome.ts`（`adr/0081` §10）**：**F6** 补 `disposition?: "open" \| "deliberate-deferral"`（缺省 `open` 向后兼容），读数分 `pendingOpen`/`pendingDeferred`，**年龄/最老/p90 只统计 `open`**；**F7** 补 `Attribution.lagHours`（floor 不插值）并写进 `reason`；**注释撒谎** —— `toPrimitiveRecords` 注释写「故下面单独报」而代码没有那个报 ⇒ 新增 `missing: string[]`；`outcomeReadout` 改用 `considered` 不再重判「有没有键」；`at` 不可解析报 `unmeasurable`。**修复后用同一批真实决策重跑**：`待结算 5 · 刻意推迟 2（不计入积压）· 在等 3 · missing 0 ✅`、`候选 7 · 口径自查 7=7+0+0+0 ✅`、`[tool] 接受率 1` 而 **总体率 不可测（null）**、`lag 0h/1h/5h` **可见**。**未修（只依赖载体）**：F1/F2/F3 行号谁填·key 建议·确认时看证据；`inputRefs` 多余字段仍通过；`factualOnly` 仍是约定入口；**未落盘/未接读路径 ⇒ 仍无生产消费者**。棘轮**如实变红**（`b_keys 104→105`：新键 `action=reject` 正是本版引入的 `revoke ≠ reject` 分类）并按 V6/V7 规程记录理由后重录 |
| v1.15.52 | **M1-A′：拿本会话真实决策做端到端 dry run** —— **机制被真跑验证，载体只拿到「要求清单」**；**撞出 2 个契约缺维度**。**无仓库代码变更**（探针在仓外 `.docs/fix/2026-09-12/m1-dry-run.ts`，**只读/不落盘/不接读路径**）。用本会话真实发生过的 **9 条决策 + 10 条观察**走 `attributeOutcomes → toPrimitiveRecords → projectFacts → candidateStats / outcomeReadout`，**验证 7 条路径**：正常归属 · **一决策多观察**（`DEC-4` 2 条 ⇒ 事实 2 条、**读数按决策聚合**不虚增）· 同刻并列 ⇒ `ambiguous` 且**不归属** · **真超窗 31d** ⇒ `unattributed` 且**可见** · 键不匹配 ⇒ `unattributed` · 无确认 ⇒ `pending` · 全链路 **`违规 0`**（事实只经 `projectFacts`）。**自己撞出的一处错（已修正重跑）**：第一版把 `22:00−17:00=5h` 标成「超窗」—— **`lagDays` 整日粒度 ⇒ 5h = 0d、在窗内**；补真 31d 对后 `未归属 1→2` ⇒ **教训：fixture 本身要当被测对象看**。**两个契约缺维度（不是 bug，是缺维度）**：**F6** 4 条 pending 里 2 条是「**刻意不做**」，schema **区分不出「刻意不做」与「忘了做」** ⇒ 需 `disposition`（`open`/`deliberate-deferral`）且**读数按 disposition 分层**（→ **M1⑥**）；**F8** dry run 报「接受率 **1**」，而 7 条确认**全是规则代码生成**（`actor:"tool"`）、**0 条来自人** ⇒ **零信息量**，这正是「candidate 统计只能用于待确认候选」最易被绕开处 ⇒ 候选统计**按 `actor` 分层**、`human` 组为空**不得**报总体率（→ **M1⑦**）。其余：**F1** `inputRefs` 行号必须自动填（手填必退化成 `line: 1` ⇒ **闸在证据没了**）· **F2** key 建议 + 人确认（与 P1 两层同构）· **F3** 确认必须看得见证据（否则 `actor:"human"` 是**盲签**）· **F4** 一决策多观察是常态 · **F5** `ambiguous` 保留但不应常响 · **F7** 整日 lag 对「当天决策-当天结算」丢失分辨率。**本轮不能回答**：确认是否高频/是否批量/是否要 diff（**0 次真实确认动作**）· 采集侧能否拿到原文（事后手工整理）· `windowDays` 取值 · `inputRefs.line` 真实可获得性。`verify` **51/51**（无代码变更）|
| v1.15.51 | **M1-A：把 M1 接到原语上**（`core/decision-outcome.ts` + 11 组闸）—— **确定性归属，且结果事实只能经 `projectFacts` 产生**（P1 原语得到第一个真消费者）。**归属规则 `same-key-window/v1`**：同 key · `O.at ≥ D.at` 且 `lag ≤ windowDays` · **取窗内最晚前驱** · **最晚前驱并列 ⇒ 不归属**（计入 `ambiguous`，**可见**）。**两处刻意的保守设计**：① **归属键 `key` 由调用方显式传入** —— `ObservationTrace` 里**没有 `entry`**（只有 `id`/`observerId`/`createdAt`/`decision?`/`outcome?`），所以**我不发明 entry 的推导**（那正是「不得推断」的边界，与「`subject` 只接受显式提供」一致）⇒ **「key 从哪来」这条链仍未接**（M1③）；② **并列不归属而不是任选**，与 ADR-0061「**错误关链是静默破坏**」的不对称一致 —— **宁可少归属，不可错归属**。**接线**：`attributeOutcomes → Attribution（候选层）→ toPrimitiveRecords → Proposal(source=观察者 user/tool/ci · inputRefs 必填) + Confirmation(actor="tool", reason="rule:same-key-window/v1 key=… lag=…d window=…d") → projectFacts → Fact`；**内容来源=观察者、确认=确定性规则且可审计**；闸 ⑧ 验证**本模块不返回 `facts`**、**直接写 `type:"fact"` 仍被拒**。**`pending` 读数**：条数 + 年龄分布（<7d/7–30d/30–90d/≥90d）+ 最老一条 + **`pendingAgeP90`（nearest-rank，不插值）**；**年龄只暴露风险、不改变状态**（闸 ⑩：换 `now` 只改读数不改状态）；**无 pending ⇒ p90 = `null`（不可测不报 0）**。**`verify` = 51/51**；棘轮再次**如实变红并按规程重录**（`a1 19→23`、`a_total 33→37`、`b_keys 103→104`：两个新模块**尚未接进读路径** ⇒ 无生产消费者，这是刻意的「契约先落地、消费者后接」）。**未改动** `index.ts` 与既有业务路径 |
| v1.15.50 | **P1①② 落地：语义防火墙**（`core/proposal.ts` + **11 组闸**）—— **Fact 是投影，不是可写入的记录**。用户批准「先做纯类型 + 解析 + 闸，不等 Confirmation 载体」；本轮把 `adr/0082` 的原语做成代码与闸，**任何写入者（LLM / CLI / 人工 / MCP / 外部工具）都不能绕过这条边界**。**实现选择比要求更强**：`type:"fact"` **一律拒收**、Fact **只由 `projectFacts(P,C)` 派生**（`id = fact-<proposalId>`，同输入同结果，吻合 ADR-0003「派生件不是 source」）⇒ **Proposal 冒充 Fact 在结构上不可能（没有写入路径）**；两条伪装负例已成闸（`{type:"fact",source:"model-proposal"}`、`{type:"proposal",status:"validated"}` —— **且被拒的 proposal 即使有 confirmation 也不得复活**）。**机械不变量**：`FACT ⇔ 有效 Confirmation ∧ 指向 Proposal ∧ Proposal 有 inputRefs`；有效动作按 `timestamp` 升序取最后一条、**同刻按 id 升序（与插入顺序无关）**；`reject`/`revoke` ⇒ 事实消失但**历史保留**。**按你追加冻结的两条**：**① Confirmation = 授权事件**（`{id, proposal, actor, action, timestamp, reason?}`，**actor 无 `model`**，`action ∈ confirm/reject/revoke`）⇒ **Fact 是其投影**，未来 **M4 Revision 直接落在 `revoke` 上**；**载体刻意不决定**。**② 防 Silent Candidate Graveyard**：`candidateStats` 输出 `candidates / confirmed / rejected / pendingConfirmation / oldestCandidateDays / acceptanceRate / rejectionRate`，**待确认不入分母**、**分母 0 报 `null`（不可测不报 0）**、**`now` 由调用方传入（不读时钟）**；**不进普通召回，但必须可见**。**`npm run verify` = 50/50**。**棘轮如实变红并按规程重录**（`a1 17→19`、`a_total 31→33`：新导出**尚无生产调用点**、待 M1 接线）—— 这正是 V6/V7 设计的路径：**合法上升必须有人确认后再重录**。**未接线既有业务路径**（先有闸、再接能力） |
| v1.15.49 | **`Proposal → Confirmation → Fact` 升为通用原语**（`adr/0082`）—— **Inference is cheap; facts are expensive.** 用户选 **A** 并要求把这条边界**从 M1 的特殊处理升为所有 Memory Intelligence 能力的共同纪律** ⇒ 单独立 ADR；**M1 降为它的第一个使用者**，Memory Track 顺序变为 **P1 → M1 → M2 → M3 → M4 → M5**。**唯一升级路径**：`Inference → Proposal（候选层）→ Confirmation（显式确认）→ Fact（事实层）→ Pattern / M5 统计 / 棘轮`；**事实层只有两条写入路径**（显式外部来源，`source` **不得**为模型 · 确定性规则「同入口+时间窗」，**不看语义**），**`model-proposal` 永不直接进 Fact**。**用户的三条硬要求全部入契约**：① **proposal 必须自带「基于什么提议」**（`source`/`model`/`prompt_version`/`input_refs[{file,line}]`/`proposed_relation`，**缺一不得入库** —— 否则连被复核的资格都没有）；② **proposal 不参与任何事实统计**（❌ Pattern count · ❌ influenced_decision · ❌ confidence · ❌ ratchet baseline · ❌ knowledge fact · ❌ identity；**唯一允许** `candidate coverage`/`acceptance rate`/`rejection rate`，即**度量模型能力而非改世界状态**）；③ **升级必须留链** `P ──confirmed_by──→ C ──→ F`，**没有 C 的 F 不存在**。**核心不变量**：**只有 FACT 可以改变系统的认知统计；CANDIDATE 只能改变「待确认候选」的统计。** 另冻结两条 M1 配套纪律：**`subject` = explicit + deterministic-normalized，明确关闭「语义实体消解」这条演化路径**（理由：用相似度把 A、B 吸到同一 subject ⇒ Pattern 统计量**虚假变高**，而「Pattern 的质量上限会被 subject resolution 的错误率锁死」）；**`pending` 年龄只暴露风险、不得改变状态**（印条数 + 年龄分布 + 最老一条，可加轻量派生 `pending_age_p90`，**不得设自动结算阈值**）。**T15 Registry 第 2 条真条目**（`proposal-confirmation-fact-v1`，verification **含 3 条负例**，待建棘轮桶 = coverage/acceptance/rejection）。**主干**：`Memory → Evidence → Inference → Confirmation → Knowledge`。**本 ADR 没加任何能力** —— 只给「什么算事实」定了一条**不可绕过**的路径。**未改业务代码与 `dist/`** |
| v1.15.48 | **M1 三处拍板入账 + 一处异议与「两层合成设计」**（`adr/0081` §7）。用户决定：① 结果来源＝**允许 LLM 判断归属**；② **引入 `subject`，与 `entry` 并存**；③ **不设结算窗口，永远 `pending`**。**我接受 ②③ 并各补一条配套纪律**（`subject` **只接受显式提供、绝不从文本推断**，与 ADR-0037 的 `DecisionReason` 同一纪律；`pending` 不设窗口 ⇒ **读数必须印条数 + 年龄分布 + 最老一条**，否则「还没到」与「永远不会到」不可区分，ADR-0049 同族）。**① 我提出异议**：LLM 归属若进**事实层**会有四条后果 —— **不可复现 ⇒ 会打在 V6/V7 刚做可信的那一层**（换模型版本即换归属 ⇒ Pattern/M5 漂 ⇒ 棘轮因「判断重跑了」而红，变成噪声源）、**不可审计**（无可核证据）、**精度上界已被量过**（`adr/0080`：AUROC 0.5926 / precision 上限 0.667 / 0.95 不可达 ⇒ M5 指标带不可量化偏差）、**与已冻结边界冲突**（`adr/0037:29-42` 冻结「Reason 绝不生成」，而归**比理由更强**——它在断言因果）。**合成设计**：`显式外部来源 / 同入口+时间窗（确定性）` → **事实层**（受契约保护，进 Pattern/M5/棘轮）；`LLM 提议` → **候选层**（`source=model-proposal`，**永不进事实层**，只在候选视图出现，需「确认」才升级）—— 同形先例已有两个：`dream/` 候选不进主路径、`world` 状态**永不 `fact`**。**若仍要 LLM 直接进事实层**，须显式改掉契约第 ④ 条禁令并登记「归属不可复现」，**不能默默实现**。**未改任何业务代码与 `dist/`** |
| v1.15.47 | **双泳道 + M1 契约草案**（`adr/0081`）：**决策 → 结果 → 经验**。用户修正上一轮表述 —— **不是「先治理、不做新 Memory 能力」，而是两条泳道并行**（🛡️ `T8 → T15 Registry → D1/D2/D3 → Contract Freeze → T14` ‖ 🧠 `M1 → M2 → M3 → M4 → M5`），新能力**纵向生长**、不再横向堆功能；**两泳道在 M1 交汇**（**M1 的契约条目就是 T15 Registry 的第一条真条目**）。**本轮没写任何新能力代码**：先把 M1 现状清点做透并按 T15 规格写成契约。**最重要结论：M1 最难的那条边界已经冻结** —— `DecisionEvent` 与 `DecisionReason` 的**分离**、以及「**绝不生成理由**」（原文明确存在才算）已由 `adr/0037:29-42` 冻结。**M1 缺口只有三件**：① **决策 → 结果这条边**（现有 `outcome` 是**别的**东西：`observer/trace.ts:26` 的轨迹 `{expected,actual}`、`validation` 的**假设**验证结论）；② **结算状态机** `pending → observed → settled`（**允许 `unresolved`，不编结果**）；③ **`alternatives`（可选）**。**M2–M5 大多是「接上」而非「新建」**：M2 **不新建对象**（`validation/types.ts:23` 已有完整 outcome 状态机 + append-only 历史；`long-horizon` 已有 ActionFeedback），否则会有**第二个平行 outcome 概念 = 判据分叉**；M3 **算法内核已存在**（`reflection/patterns/success-rate.ts` 的 decision→outcome 相关性、`dream/compress.ts` 的 cross-domain 抽象），**真缺口是反例字段**（`reflection/types.ts:8` 无 `counter_examples` —— 只报 support 不报反例＝自欺）；M4 机制已有（`Forget ≠ Delete` / `superseded` / append-only / 取代的确定性），**缺「因哪条证据而改判」的可追溯对象**；M5 只有 `recall_count` 雏形，**前提是 M1**。**契约十字段齐备** + **四条禁令**（不推断优劣/不编造/不建第二个 outcome 概念/不用相似度做归属）。**待你拍板 3 处**：结果从哪来（显式外部来源 / 同入口+时间窗确定性归属 / LLM——**建议否决**）、`subject` 要不要、结算窗口如何定（走 config）。**明确不做**：现在不做 KG、不做 Soul。**未改任何业务代码与 `dist/`**；清点只凭源码与 ADR 阅读，**未跑真实决策链路** |
| v1.15.46 | **V7 语料健康门（Corpus Health Gate）+ 五级审计口径 + 阶段路线入账**。V6 只防住「语料**全空**」；本轮补上危险兄弟 **Partial Corpus**（工具坏了给出「看起来合理」的小读数）。**四档，只有 NORMAL 放行**：`EMPTY`（0 文件）· `PARTIAL`（**文件数 < 基线×0.9 / 目录数 < 基线×0.9 / 线索跌 > 20% / 哨兵文件缺失**）· `UNKNOWN`（无基线）⇒ 退出 **2**；`NORMAL` ⇒ 继续跑棘轮。**哨兵**（`index.ts`/`core/paths.ts`/`core/types.ts`/`core/util.ts`/`security/scrub.ts`）能在**无基线**时发现「走错目录 / 递归被 junction 截断」。**关键一条：`--update-ratchet` 也受闸** —— EMPTY/PARTIAL **拒绝录基线**，堵住「工具坏了 → 线索骤降 → 棘轮判『下降不是违规』→ 提示收紧基线」这条**假绿自我固化**路径（代价刻意保留：大幅合法下降必须「确认 → 重录」）。覆盖四个语料消费者：`audit-wiring`/`audit-drift`（基线+哨兵）· `audit-layers`（自比+哨兵）· `retrieval-eval`（协议常量 `min_corpus_files`，**从数据读不从代码读**）。**🔴 V7 首次运行就抓到我自己一处缺陷**：两工具**共用一个 `corpus` 键**却量不同语料（wiring 778 文件含 `dist/`；drift 193 文件）⇒ drift 被误判「骤降 76%」而拒录 ⇒ **改为 `corpus.wiring` / `corpus.drift`**（**共享键 + 不同口径 = 必炸**，且是**新闸自己发现**的）。**统一审计口径写入 `MATERIALS` §6**：**Artifact existence ≠ Runtime capability** —— `package exists ≠ installed ≠ loaded ≠ active ≠ usable ≠ verified`（来历：据 Service 目录断言 `invariants` 存在 → 运行时 `undefined`；`e2b` 在目录里而 `dsh-e2b` **没安装**）。**阶段路线入账**：`V6 假绿 → V7 语料可信 → T8 → **T15 Protected Contract Registry** → D1/D2/D3 → A段 → … → Contract Freeze Gate → T14 冻结契约语料 → V8/V9 Identity Ratchet`；**T15 定为下一阶段主产物**（每条契约**十字段**：id/surface/owner/semantic meaning/stability/allowed/forbidden/evidence/verification/ratchet + 模块归属表 `Owns/Reads/Writes/Must not own`）；**D1/D2/D3 明确不要先拍**。门禁 **49/49** |
| v1.15.45 | **V6 闭环：两个分诊报告有了棘轮退出码，并接进 `npm run verify`**。`audit:wiring` / `audit:drift` 一直是**人工分诊**工具 —— 输出是线索清单、**退出码恒 0** ⇒「工具会随时间失效」。本轮把语义定下来：**① 线索数只能降不能升**（多于基线 ⇒ **退出 1**，报文给「旧 → 新」与增量）；**② 下降不是违规**（退出 0 + 提示 `--update-ratchet` 收紧基线 —— 判紧会让人习惯性绕过这道门）；**③ 基线里有的桶消失 ⇒ 退出 1**（缺件不静默：可能是工具坏了，不是问题没了）；**④ 出现新桶 ⇒ 退出 1**（否则整类新线索被漏掉）；**⑤ 基线缺失 / 两表皆空 ⇒ 退出 1**（「通过」不能靠没有判据换来）。新文件 `tools/audit-ratchet.lib.ts`（纯逻辑）+ **8 组标定测试** + 共用基线 `tools/audit-ratchet.baseline.json`（`wiring = {a_total 31, a2b 0, a1 17, a2a 3, a3 11, b_keys 103}`、`drift = {drift_keys 10, drift_sites 25}`）；`npm run audit:ratchet` 已进 `verify` ⇒ 门禁 **48/48**。**同轮踩到并修掉一处真缺陷**：`node tools/audit-wiring.ts --ratchet` **漏了根参数** ⇒ `ROOT` 取到旗标字符串 ⇒ 扫描目录不存在 ⇒ **0 文件 ⇒ 0 线索 ⇒「安静地全绿」**，而 `--update-ratchet` 会把这个全 0 读数**录成基线** ⇒ 两个 CLI **都加闸：零文件语料直接 `exit 2`**（缺件不静默）。诚实边界：棘轮只覆盖**计数**，答不了「计数相同但线索换了一批」（需逐条 diff）；`audit-drift` 只棘轮 **B 段**（A 段计数在块作用域内） |
| v1.15.44 | **台账回填**：把「读了什么 / 还没读什么」追平到事实（`MATERIALS.md` 六处 + `references.md` §6.3）。本仓纪律是「**台账比事实旧＝缺陷**」（ADR-0072 那一族），而 v1.15.41–43 一口气读了五片面（harness 关键面 / hl_mem 门禁面 / 安装体 / profile 组合 / agent preset）后，台账状态列**还停在第一轮** —— 其中**两处会主动误导下游**：**① `MATERIALS` §4 说「`invariants` 是唯一候选、两条前置未确认」** ⇒ 前置**已答**，且更关键的是**该服务在运行的 web 部署里根本没挂**（运行时读取 `undefined`）⇒ 判**暂不吸收**，并新增纪律 **Service 目录 ≠ 活性表**（反例：`e2b` 在目录里而 `dsh-e2b` **没安装**）；**②「harness 克隆与运行体偏差未逐项核对」** ⇒ **已逐项核对（8 个平面）**：机制面零漂移、组合/产物面全漂移，且 `packages/AGENTS.md` 的「Every package owns `./invariant`」在 0.1.5-rc.2 **发布产物上不成立**。其余：`§2.1` 五行状态改为「读到哪一面」、`§2.2` hl_mem **门禁面已读**、`§2.8`/`§3.2` 给将来时措辞加时态说明（四路已整合；MemStrata 已读正文 + Appendix B/C/D + Table 1/2/3，**A.1/A.2 与 Table 4/5 仍未读到、分数未复现**）、`§6` 两条边界改为已答/已核对。**本轮只改状态列与结论，未改任何计数**（按 `MATERIALS` §5：改数必须重跑枚举命令）；未动任何代码与 `dist/` |
| v1.15.43 | **三路并行查证落账**：**A 段残余 18 条分诊** + **T12 时间炸弹闭环** + **T16 版本偏差逐项核对**，并修掉其中**唯一两处真缺陷**。**① 工具口径缺陷（持续误导了两轮）**：`audit-wiring` 原把 `!isProductionPath(...)` 当「测试」⇒ **`dist/**` 与 `node_modules/**` 的 `.d.ts` 全被算进「测试引用」**，实测 `hasNoUpgradeApi` 的「1」全来自 `dist/agency/guards.d.ts`、`apply` 的「230」里 15 来自 `node_modules` ⇒ **已修为「只认 `test/` 下」并把判据打进输出行**（修后 A2b 由 1 → **0**）。**② 唯一真断线（已修）**：`ledgerMismatch` 被 CLI **import 了却另写内联过滤**（`toolset-authority.ts:99-102`）⇒ 判据分叉隐患；`git log -S` 为空 ⇒「import 了但忘了接线」；**已改为直调 lib 那份** + 新增**源码级棘轮 ⑦**（断言 CLI 调它、且 `--check` 分支内不得再有 `ledgerVerifiedSrc !==` 内联比对）。其余：**4 条配对包装**（一处家族级决定）· **7 条正当**（`apply` 是 Cordis 入口、`writeMeta` 是逃生舱、`readGraph`/`readTemporalGraph` 是公开读 API）· **6 条待产品决策**（`hasNoUpgradeApi` 恒 `true` 且真实测试引用 **0**、`renderIntent`、`renderIdentityModel`、`progressiveDisclosure`+`refineTree`、`relationForProposal`＝T7）。**T12 闭环**：22 个含硬编码日期的文件判定（**先纠自己的数**：题面 354 处/8 文件 → **实测 357 处/22 文件**），方法＝逐文件读断言 + **行为探针**（把 `Date` 钉到 2027-06-01/2027-10-01/2028-06-01/2030-01-01 各跑一遍）+ 机制探针；成分 **85% 的日期不参与任何阈值运算**，**只有 1 处 `periodTo` 默认值被「今天」消费** —— 那就是**唯一的真炸弹**（场景 58/60 同一根因，**引爆日 2027-01-02**：`recency=exp(-ln2·119/90)=0.39992 < 0.4` ⇒ status 由 `accepted` 变 `candidate`）；**修法一行** `to: opts.periodTo \|\| today()`（场景 60 此前被 58 掩盖），修后 `ALL PASS`。**T16 结案（8 个平面）**：`isolate` 继承 / `export default` 丢命名空间 / `ctx.get` vs 代理 **三处源码 SHA256 与克隆面相同** ⇒ 可继续引用克隆面行号；而 **base −2 行 / web-app +10−1 行 / sdk-minimal +16 行（含 `invariants` 装配）**、**agent preset 内容 6 文件不同**、**「每个包都发 `./invariant`」系统性丢失**（bundle 家族与注册表包丢、服务包保留）；口径纠正：原型链挂在 **isolate 符号表**上而非 `entry.realm`。门禁：受影响两测试 `ALL PASS`、A2b 归零 |
| v1.15.42 | **确定性基准门（T14 落地）**：本仓唯一的评测（`tools/retrieval-eval.ts`）此前**只打印读数** ⇒「这次比上次好还是坏」**无法由机器回答**。本轮做成可执行门并**补掉 hl_mem 自己的两个洞**：**① 比较器不再零调用**（`eval:retrieval:check` 已接进 `verify`，标定测试自动进 `run-tests`）；**②「两跑功能字段逐字相同」从散文变成脚本**（`--determinism-check` 同进程跑两遍逐字节比对，真仓库**通过**）。落地物：`retrieval-eval.lib.ts`（纯逻辑：稳定序列化 / 语料指纹 / 协议自检 / **基线只含聚合面**白名单 / 比较器「先证同源再比数值」）+ `retrieval-eval.protocol.json`（**冻结协议**：门控指标显式列名 `recall_mean`·`noise_offtopic_mean`·`avg_returned_mean` + 方向 + 容差 + **外部调用必须 0**）+ `retrieval-eval.baseline.json`（**签入基线**，`provenance: local_dev_aggregate_only`）+ `retrieval-eval.selftest.ts`（**12 组标定测试**，每一类判据都有负例）+ 5 个新模式（`--json`/`--check-baseline`/`--update-baseline`（**拒绝覆盖**，需 `--force`）/`--compare`/`--determinism-check`）。「外部调用即失败」用**抛错桩 + 计数**（运行期换掉 `globalThis.fetch`）并在比较层**再判一次**。**🔴 本仓特有结论**：hl_mem 的语料是**冻结数据集**，而本仓语料是**活的 `.shadow` 记忆**（实测两次调用之间 **1414 → 1435** 条）⇒ **哈希钉死的基线在本部署恒「不可比」**；故把「不可比」做成**显式的第三种结论**（退出码 **3**，既非通过也非失败），与「分母为 0 要报『不可测』而非 0」同一条纪律。可执行判据因此分两层：**恒可用**的 `determinism` + `check`（后者在 `verify` 里），**只在冻结语料上可用**的 `compare`；**是否物化一份冻结语料快照＝用户取舍**（会把真实记忆复制到新目录）⇒ 本轮未替用户做，留作 T14 唯一未决项。**顺路修的真缺陷**：默认语料根硬编码 `D:/project/dsh1` 而本机工作区在 `G:\` ⇒ `npm run eval:retrieval` 此前一直在**空语料**上跑（`docs=0` 还「跑得通」）；现默认由文件位置推导 + 环境变量可覆盖 + **找不到 `.shadow`/语料为空时非零退出**。**两处自我暴露**：容差边界用十进制直觉值（`0.5-0.01` 在 IEEE754 下是 `-0.010000000000000009`）导致断言**假红**；把全文件 `console.log(` 批量换成 `emit(` 时**把 `emit` 函数体也换了** ⇒ 递归自调爆栈（**改名/批量替换是「断的是谁调用它」的高发区**）。门禁 **47/47**；未改业务源码与 `dist/` |
| v1.15.41 | **结构门 `audit-layers`：把「结构纪律」从散文做成可执行判据（T13 前半落地）**。本仓此前**一条结构纪律都没有可执行形态**（「`core/` 是纯函数」「层间不许成环」都只是散文）。**先实测再定表**：按 hl_mem `check_imports.py` 形状起草的「按目录分层」表，在真仓库（**193 文件 / 523 条 import 边**）**实测当场为红** —— `core` 不得碰 `node:fs`(1) / `node:child_process`(1) / 不得 import `persistence`(4)，`query` 不得 import `persistence`(4) ⇒ **`core/` 不是「纯函数层」，是「脊柱」**（`paths`/`types`/`util` 无依赖，`memory`/`writer-materialize`/`toolset-exec` 有副作用）⇒ **照搬目录分层 = 当轮就红的门 = 假闸门** ⇒ **换判据对象**，只留**实测为真**的三条：**① 文件级依赖图无环**（实测 **0** 个强连通分量）/ **② 纯模块白名单零副作用**（`core/paths.ts`、`core/types.ts`、`core/util.ts`、`security/scrub.ts` import 数均为 **0**，**带腐化自检**：路径不存在即违规 —— 用不存在的 `core/lexicon.ts` 实测到它真的会报）/ **③ 方向禁令**（`core↛query` / `core↛tools` / `persistence↛query` / `query↛tools` / 任何层↛`index.ts` / 任何层↛`agent-presets`，当前 **0** 违规）。**明确不判层间环**：实测存在 `{core, evidence, persistence}` 层间环（成因即「core 是混合层」，**非**文件级环）⇒ 写成禁令则门当场红（又是假闸门），故只**留档**。落地物 `tools/audit-layers.lib.ts`（纯逻辑，**复用** `audit-wiring.lib.ts#stripComments`）+ `tools/audit-layers.ts`（CLI，打印**口径**）+ `tools/audit-layers.selftest.ts`（**8 组标定测试**）+ `package.json`（新增 2 script，`verify` 加一步）⇒ **`npm run verify` = 46/46**（45 → 46）。**两个当轮自我暴露**：**(a)** 标定测试当轮抓到我自己的真 bug —— 层边写 `.map((e) => ({ from: layerOf(e.from), to: layerOf(e.to), ...e }))`，**`...e` 在后把层名覆盖成文件路径** ⇒ **方向禁令永不命中、门恒绿**（「机制对了、断的是谁调用它」那一族）；**(b)** 默认白名单在合成夹具上会**正确地**逐条自曝腐化 ⇒ 零违规正对照必须显式清空判据表。**方法边界（诚实）**：**不用 TS 编译器 API** —— 本仓 `typescript@7.0.2` 是 native(Corsa) 移植，包根 `.` **只导出 `version`**，AST 在 `unstable/ast` 子路径 ⇒ 说明符抽取是**剥注释后的正则**，字符串里形如 `from "./x"` 会误命中。**未做**：复杂度预算（无可用 AST）、拆 `core/`（架构决策）。**未改动**：`index.ts` 与任何业务源码、`dist/` |
| v1.15.40 | **本地全部材料总台账（`MATERIALS.md`）+ 平台契约纠错（T16）**。用户立目标「**本地全部材料深入分析 整合 吸收 审查 以及 论文 github**」。**先把「本地材料」的定义从「hl_mem 一份」扩到磁盘上真实的 8 项**：**DSH 本体**（`dsh-w/deepseek-harness`，**MIT**，`cd5ef81481` = 0.1.2-alpha.1，74,163 文件 / 1.64 GB）+ `hl_mem`(Apache-2.0) + `openviking`(**AGPL-3.0**) + `archify`(MIT) + `awesome-dsh-plugin`(CC0) + `ppt-master`(MIT) + `voyager`(GPL-3.0 fork) + 本仓；**`MATERIALS.md` 是磁盘枚举生成的唯一台账**（名册/许可/规模/已吸收 ADR 指针/未读/优先级/更新命令）。**第一条纪律即：harness 克隆是 0.1.2-alpha.1 而运行体是 `dsh-web-app@0.1.5-rc.2` ⇒ 凡据本地文档的结论必须回运行体核对**。**四路并行深读回报 7 条「下游可能理解错」**，其中**两条当轮自查/裁定**：✅ **`export default` 会静默丢 `inject`**（`postmortem/0001:110-111`）——**本仓不适用**（`index.ts`/`dist/index.js` 无 `export default`）；✅ **`sandboxPolicy` 省略是否合法**——平台文档说合法，**回运行体核对**：`dsh-fs-sandbox/index.js:158` 确实 `??` 回退（省略合法），但 `dsh-sandbox-policy/lib/index.js:116-117` 的**无参**解析取**服务级**根（`config.workspaceRoot ?? process.cwd()`），只有 `:138-142` 的 **`resolve({session})`** 才用 `session.header.cwd` ⇒ **ADR-0074 结论成立、机制表述已修正**（已落补记；并暴露本仓 `core/fs-scope.ts` **重造了平台已有的 `ctx.sandboxPolicy`** ⇒ T16）。**其余回报**：**`isolate` 是行级 option、`group` 不继承**（`vendor/loader/src/config/isolate.ts:79`）⇒ `editing-cordis-compositions` 技能那句「provider **和每个 consumer** 包在一个带 isolate realm 的 group 里」**散文不精确**（每行都要各自写）；平台**已有**而本仓可能在重造的四项（`ctx.sessionProjections` 纯 fold / `ctx.storageDomain` / `ctx.invariants` / `ctx.jobs`）；**openviking**（AGPL⇒只取概念）给出 8 条可移植 + 一张 **8 行「设计承诺 vs 落地」不一致表**（`hotness_alpha` 默认 0.0 = 默认关且**无对照消融**；CLI 兼容门是 `\|\| true` + 缺件即 `exit 0`），最值得抄的是**用子进程起新解释器验证依赖方向**（同进程断言会被 import 顺序掩盖）；**四个 DSH 生态仓定位**：**只有 archify 是真 DSH 插件**（`dsh.bundle` + `cordis.patch.yml` + 适配器测试 + 独立 CI），`awesome-dsh-plugin` 是「手写 YAML + 脚本生成 README + CI 强校验」（1556/1556 一一对应，但 3 个 `.pyc` 入库），`voyager` 与 DSH 是**文档级 + DOM 级**关系（**不是插件**），`ppt-master` 与 DSH **零关系**。**论文层**：已用 MemoryBank(`2305.10250`)/工具拐点(`2606.30317`)；⭐[arXiv:2606.26511](https://arxiv.org/abs/2606.26511)「Temporal Validity in Retrieval Memory」（MemStrata）**已于第 3 轮读完正文 + Appendix B/C/D + Table 1/2/3**（裁定 `adr/0080`），并**认领了本仓早已引用的「cosine AUROC 0.59」的原始出处**——它还给出更强的表述「**任何阈值 precision 上限 0.667、0.95 安全线不可达**」；四项可吸收全在**指标与协议**层（`stale-fact-error rate` + 允许/强制作答两 regime / marker-free 不变式 + 词边界 tell 自检 / 两侧夹逼消融 / 「未做就说未做」），三项不吸收（键规范化靠 LLM、持久化取代、向量读路径）；**A.1/A.2 表体与 Table 4/5 未读到、本版无可克隆地址**（诚实标注）。另有 2026-09 前检索到的记忆机制综述两篇与 Scrub Jay 原则，**均未读全文**。**新开 T16（平台契约核对与纠错）**；**纯文档，无代码改动**；门禁 **45/45**。**（第 4 轮追加，同日）** 两条独立产出：① **平台 `invariants` 的两条前置结案** —— **(b) 默认执行**（`src/index.ts:96,115` `enabled` 默认 `true`，**安装体 `0.1.5-rc.2/lib/index.js:45,62,67-70` 与源码逐字同构 ⇒ 版本偏差不影响**；选择由**挂载行**的 `config` 给，实例 `dsh-sdk-minimal/cordis.patch.yml:103-104` 无 config = 全默认）；**(a) 失败 = dispose 子 fiber + 回滚保留 + 注册方自身 `apply` 失败**（`:161-163` 抛 `InvariantError` → `:172-175` dispose 后 rethrow → 从 `ctx.effect` 冒出 ⇒ `register()` 的 thenable reject），但**「是否阻断整个宿主启动」仍未验证、未写成已知**；**新查到的第三条更影响裁决**：**「只挂服务不挂配套入口 == 没有检查」**（`README.zh.md:12,156`：注册表自身不携带产品检查）⇒ 检查是否真跑取决于**本仓有没有自己 `register()`**，对本仓**有利**。**⛔ 同轮改判（运行时读取）**：我原先写「运行中的 web 宿主**确实有** `invariants` 服务」——**这条是错的**（依据是**运行体 Service 目录**，而**目录不是活性表**）。改用**只读动态 Host 插件**逐名读 `ctx.get`：**`invariants` = `undefined`**，而同一次探测里**只在宿主/Web 层 patch 挂载、任何预设都不提供**的 `spillStore`/`tokenMeter`/`shellEnv`/`codeRuntime`/`webServer`/`clientModules`/`sessionTitle`/`sessionQuery` **全部读到** ⇒ 沙箱 `ctx.get` 读的是**全局服务表**，`undefined` 就是**真的没挂**（对照名也 `undefined`）⇒ **`invariants` 判「暂不吸收」**（写 `ctx.get('invariants')?.register(...)` 在此部署＝**静默 no-op＝假闸门**）；重启前置 = **同时把挂载行写进部署组合**（范本 `dsh-sdk-minimal/cordis.patch.yml:103-104`）或**缺件响亮报告**（ADR-0049）。**由此得一条更一般的纪律：Service 目录 ≠ 活性表**（反例：`e2b` 在目录里而 `dsh-e2b` **本 profile 根本没安装**；`dsh-invariants` **装了没挂**；`authorization`/`inspector` 在目录里而 `ctx.get` 均 `undefined`）⇒ 凡「运行体里有没有」，**唯一判据是运行时读取**。**✅ 附带**：同一次探测里 `ctx.get('sandboxPolicy')` 读到对象 ⇒ **ADR-0074 结论不变、证据从「目录」升级为「运行时读取」**。② **hl_mem 门禁形状清单**（读完 `scripts/` 11 个 `check_*.py` + 5 个 workflow + `benchmarks/release/` + `tests/eval/`）：最值钱三件 = **「生成器 + 签入产物 + 门禁逐字比对」三件套**（同形 6 次、唯一入口 `--update`/`--write`、**缺件即非零**）· **allowlist 腐化自检**（白名单里不存在的路径**也算违规**）+ **棘轮只降不升** · **协议常量与代码分离 + 先证同源再比数值**；并明确**它自己没接上的线**（比较器**零 workflow 调用**、「两跑逐字相同」**只有散文无脚本**、覆盖率地板 80 vs 60、缺件即通过），落进 **T13 / T14 / V6**。③ **新增一条枚举纪律**：**PowerShell `Get-ChildItem -Recurse` 默认不跟随 junction**（实测该目录 **70 条里 69 条是 reparse point**），不加 `-FollowSymlink` 的递归 grep 会**静默跳过 69 个包**并给出**看似确凿的 0 命中** ⇒ 凡以「0 命中」为结论的搜索，**必须先证明枚举到了非空且完整的语料**。**✅ 同轮还把 B3 闭环**：宿主于 `2026-09-12 16:40:02` 重启（`dsh web` 的 pnpm wrapper 与 node 主进程 **PID 全新**）⇒ 重启后逐条实测：`read_shadow()` **不再有**「落盘失败」横幅；`.shadow/2026-09-12/` 出现**本轮之后**新建的记忆文件（`…165353-shadow.md` = 16:53:52 等，且**与本轮改过的文件一一对应**）；`.shadow/_index.md` mtime 同步更新 ⇒ **ADR-0074 的落盘修复在真机生效**（判据 4 宿主日志侧**未单独核验**：会话日志 `.zstd` 只解出首帧 195 字节，流式解码报 `Unknown frame descriptor`，已如实标注）。**顺带观察（未立条目）**：今日已 **1034 条**记忆，几乎每次工具调用/每次改文件一条 |
| v1.15.39 | **hl_mem 第三轮深读：首次本地克隆、一手读源码 —— 三处自我更正（ADR-0078）**。用户指令「继续深入研究资料」并选定**本地克隆**（此前两轮全程 raw、从未克隆）。克隆到仓库**外** `G:\project\dsh1\hl_mem`（v1.1.7，`aa5d068`，**1025 文件 / 16.03 MB**），**全程只读**。**先做一件此前没人做的事：以磁盘枚举算覆盖率** —— 本轮之前**从未一手阅读**的面 = **901 文件 / 6.67 MB = 87.9% 文件**；0073/0076 的手写「未读清单」**漏了整片**（`docs/research/`7 · `docs/archive/`21 · `docs/*.md` 顶层 13 · `tests/`384 · `scripts/`42 · `src/`352 · `migrations/`69）⇒ **清单是散文、不是磁盘台账**，既不完整也无法自证完整（与「靠自觉不是闸门」同族）。**三处自我更正**：**①** ADR-0077 D1 说「`assert_transition()` 是写侧守卫」**不准确** —— 守卫是纯函数（`lifecycle.py:111-118`），但**写原语 `update_status()`（`storage/claims.py:160-169`）只校验「是不是合法状态名」、不校验转换**，收口靠 **28 处调用点自觉**，且**至少两处完全绕过**（`workers/deduplicate.py:571-575` 治理回滚、`application/conflict_backlog.py:178-186` 集合式修复）⇒ 其 `AGENTS.md`「**所有**状态变更统一经过它」**作为全称命题为假**；更尖锐的是矩阵里 `SUPERSEDED`/`EXPIRED`/`RETRACTED` 是**终态**，而回滚通道**必须反向走这些边** ⇒ **矩阵只是「正向可达」的真相**。（本 ADR-0077 的**结论不变、理由更强**，已落补记。）**②** ADR-0076 §1 把 ADR-0004 读成通用细粒度取代，**落地形态其实是「窄面 + 默认只建议」**：`state_latest_wins.py:1` 自述 `narrow … for config.version`、`:94-95` 非该 slot 一律 `compatible`（不做取代）、`config/models.py:508-510` **类型层面锁死只允许一个 slot**（且有测试断言 TOML 不能授权白名单外 slot）、`:506` `latest_wins_mode` 默认 **`observe`** 而**同文件** `provenance/price_target/plan_fulfillment` 三个默认都是 `enforce` ⇒ **默认值按破坏性分级**。**这实质改写 D3 的对照面**：问题从「要不要三元组」变成「**要不要为特定 slot 建确定性取代，其余一律不做取代**」。**③** 路径/计数记错：`specs/` 实为 `docs/superpowers/specs/`；migration 它 `AGENTS.md` 写 **57**、其 CHANGELOG 写 **60**、**我实测 60 个 `.sql`(001…060)+9 个 `.py`=69 文件** ⇒ 它自己的 agent 指令文件比事实旧 3 个（本仓 ADR-0072 同族）。**一手读到取代协议真身**（版本量级**只用于相等**、方向只由 **tz-aware 可信事件时间**决定、并列即 `needs_review`、`historical_predecessor` **绝不移动 current tip**、15 条否决一律 `needs_review`、精确坐标匹配无 FTS/向量、**候选 ≥17 即拒判**、决策前实测无环+深度<64、CAS 失败**抛错**）。**找到 `verify` 的下一层形态**：11 个 `scripts/check_*.py`（**分层是 AST 检查**、复杂度预算只能降、6 个快照比对）、**零网络确定性基准门**（`docs/benchmark/core-v1.md:3-8`「**any external model call fails the run**」+ 冻结容差 + **两跑功能字段与 hash 逐字相同** + 签入基线 + compare 子命令）、**13 项冒烟且检查项数量本身是断言**（`smoke_full_chain.py:402`）、**13 条冻结阈值含零容忍 + 可满足性审计**。**一条新对照透镜**（两端一手核实）：**`schema 继承` ≠ `运行时契约继承`** —— 其审计设计要求 `emit()` 永不打开 SQLite（`audit-log-design.md:183-191`），落地却是**同步写**（`observability/audit.py:44/144`），而**同一份设计的 DDL 被逐字照搬**。**自曝**：我做覆盖率检查时两次用**未标定判据**（字面路径匹配 ADR 文本 ⇒ 把 0076 写过的 `specs/` 判成未提及；`-like` 正斜杠匹配反斜杠路径 ⇒ 5 个面匹配到 0 个文件）。**新开 T13（结构性门禁）/ T14（确定性基准门）/ T15（兼容性弃用纪律）**，并把 **T11①** 推进为「有可照抄形态」。**纯文档 + 待办登记，无代码改动**；回归 **45/45** |
| v1.15.38 | **吸收 hl_mem 的「能吸收的部分」+ 顺路修两处真缺陷（ADR-0077）——本轮最有价值的产出是那道门当轮抓到两处「既有失败」**。用户指令「**能吸收哪些？做**」⇒ 只做**形态可移植**的三件（**不照搬**；0073/0076 已逐条否决 llm 抽取/向量库/物理删除/双时间字段/成熟度等级）。**① 状态机信号表棘轮**（落实 0076 §6 ③「本仓缺状态机单一收口」）：**移植形态而非位置** —— hl_mem 的 `assert_transition()` 是**写侧守卫**，而本仓 `lifecycleOf` 是**纯函数**、无可写坏的持久状态（硬加＝**假闸门**）⇒ 改为**声明表 + 源码级棘轮**（4 组），机器核实「`pinned` **真值** / `status:"archived"` / `status:"superseded"` 在生产里**零写入者**」（此前只是散文）。**⚠ 自曝**：表最初写在 `core/lifecycle.ts`，**把工具自检纳入门禁后立刻变红** —— 表必须同行写出字段名与触发值，而 `hasProducer` 是**文本**判据 ⇒ **把声明当成写入者** ⇒ 审计工具**丢掉 `status=superseded` 真线索**（与它标定测试③的「读点冒充写入点」同一机制）。**改的是设计不是测试**：声明唯一消费方就是棘轮 ⇒ 移到测试面，强制力不变、且无需任何文件排除 ⇒ **是审计工具自己的自检挡住了对审计工具的一次回归**。**② 前置冒烟门**（0076 §4 的门）`npm run verify`：改前**只跑工具类型门**（插件自身未类型检查/未构建/未跑测试）⇒ 改为 工具类型门 + 插件 `tsc --noEmit` + `test:all`(= build + `tools/run-tests.ts` 串行跑 **43 行为测试 + 2 工具自检 = 45 项**，每文件一子进程以免模块级全局副作用互相污染、`stdio:inherit` 以免沙箱 EPERM)。**它第一次运行就抓到两处既有失败**（均在干净 HEAD 用 worktree 复现）⇒ 本仓此前「全绿」的结论**当时是错的**；顺带把 **V6**「审计工具未接入任何自动门禁」推进为**部分接入**。**③ 「错误方向不对称」成文**（0076 §2 只到「建议」）：*并存噪音是可观察问题；错误关链是静默破坏* ⇒ 落 CONTEXT（术语级）+ `adr/0061` 补记（判据级）+ D3（待决策级），与 ADR-0049 **互补**（一个管缺失可见，一个管破坏保守）；**不改 ADR-0061 任何决定**。**④ 真缺陷：consolidated `time` 两条读路径两套值**（ADR-0069 同族第 3 例）——写侧 `ep.startedAt.slice(11,17).replace(/:/g,"")` 在 `YYYY-MM-DD HH:MM:SS` 下取到 `"09:00:"` ⇒ **`"0900"`（4 位，不是 HHMMSS）**，而文件名不含时间戳 ⇒ 读侧反解得 **`""`**；`time` 是**取代裁决**输入（`arbitrate.ts:63` 严格 `t < newest`）⇒ 两个**同日同 entry** 的 consolidated 在磁盘路径上**并列、谁都不被取代**，而较早的那个**应当**被取代 ⇒ **本进程与重启后裁决不同**。修法是**判据收一处**（`timeFromName` 唯一正则源 + 写侧文件名带 `<date>--<HHMMSS>-`、缓存 `time` **由文件名反解**）＋反例正控测试。**⑤ 真缺陷：一颗已在本地零点引爆的时间炸弹** —— 场景 30 硬编码 `2026-09-05`，而 `stale = ageDays(rel) >= staleDays`(默认 7) 且 `DECAYING` **排在** `OBSERVED`/`VERIFIED` 之前，`today()` 用**本地**日期 ⇒ 本地 `2026-09-12`（UTC 才 09-11）当天 age=7 ⇒ 三者被整片盖掉；已改**相对今天**。**这是一类问题** ⇒ 新开 **T12**（已扫出全仓硬编码日期风险面：12 个日期 / 8 个文件，但**只有场景 30 被确认与 age 判据耦合**）。**未做**：`historical_predecessor`（属 D3 决策范围）、冻结语料（待 T11① 语料决策）、`audit:wiring`/`audit:drift` **报告**进门禁（分诊工具退出码语义未定义）。回归 **45/45**（43+2） |
| v1.15.37 | **重点材料 hl_mem 深读第二遍（ADR-0076）—— 0073 漏掉了一份 26 KB 的 ADR，而它恰好与待决策的 D3 直接对题**。ADR-0073 是第一遍表层对标；本轮补齐它 `## 自检` 里**明确留空**的几处，**新读到 `docs/adr/0004-config-version-deterministic-latest-wins.md`（0073 完全未提）**。**它的坐标是四元组** `(namespace, canonical_subject, canonical_slot, coordinate_qualifiers)`（**比 D3 设想的三元组更结构化**），且 `conflict_key` 只是**派生指纹**、「**不是第五个独立真相**」（≈ 本仓 ADR-0003/0051）；候选发现**必须 exact-match 坐标**。**关系枚举冻结六类**，其中 **`historical_predecessor`**（**乱序到达**：新到的记录描述更早事实 ⇒ 只接前驱、**不反向关闭 current tip**）是本仓单键+时间序**没有的分支**。**一条本仓尚未成文的判据**：**「并存噪音是可观察问题；错误关链是静默破坏」** —— 与 ADR-0049「缺件不静默」**互补**（一个管缺失可见，一个管破坏保守），已写进 D3 判据面。**它还为本仓既有裁决补了独立量化证据**：本仓 ADR-0059 裁决「不让 LLM 判语义」，hl_mem **独立走到同一结论并给数字** —— E1C 70 案 exact **54/70** 且**有 2 个危险反向**；29 个双序案一致率仅 **21/29 = 72.4138%**（顺序敏感）。**它的失败史**：v0.30.0 在同一份 dev 上 **13/13**，独立 held-out-r5 **仅 3/13**（27 条错误 edge / 3 条反例误 supersede）⇒ 整批撤回，催生三层冻结数据与「**烧语料前必须先跑零 LLM 缝合线冒烟**」⇒ 本仓对照后**只取两条同形的**（**新开 T11**；照搬 400 案冻结集**属过度设计**）。**一处罕见诚实**：它公开的 LongMemEval 里**自家结构化路径 43/50（86.0%）低于两条对照臂**（full-context 92.0% / native RAG 90.0%）=「**结构化 ≠ 更好**」。**结构对照**：hl_mem **4 篇 ADR + 41 行矩阵**（**故意跳过 0003** 以免两决策共号）vs 本仓 **76 篇 ADR + 18 行表** ⇒ 0073 说的「补三列」只是该差异的**表层**。**纯文档 + 待办登记，无代码改动**；回归仍 **41/41** |
| v1.15.36 | **修接线审计工具自身的盲区（ADR-0062 补记）—— 先实测，于是发现原记的三条里有一条位置与方向都记错了**。用户指示「fix 三条盲区」，本轮**先逐条量证**：**注释**里 `Foo(` → 旧实现得 **0**（早已 `stripComments`）⇒ **不是盲区**；**字符串**里 `Foo(` → 旧实现得 **1** ⇒ **真盲区，且方向是漏报**（把死代码看成活的，比误报危险）。**教训**：那条「成因」当初是**推理**出来的、没实测，写进 ADR 后就成了「事实」，我上轮还把它复制进了 BACKLOG ⇒ 已两处更正。**修 ①**：新增 `maskStrings`（在 `stripComments` 之上抹掉字符串字面量，**仍是状态机、保长度保换行 ⇒ 行号不漂移**；`` `…` `` 模板串**只抹字面部分、`${…}` 里的代码原样保留并递归** —— `` `${f(x)}` `` 里的 `f(x)` 是真调用，抹掉会制造**新的漏报**，测试 ⑨ 有**反向不变量**锁住）；`countCallSites` 改用它，**`stripComments` 保留不动**（B 类要匹配的正是字符串里的值）。**量证**：两种掩码在真仓库（204 文件 / 516 导出）**逐符号比对**只有 **3 个符号**计数有差异（`isProductionPath` 8→6、`markedLines` 8→6、`notRevoked` 3→2），**均只是去掉虚高**、未翻转归桶 ⇒ **当前真仓库零净效果（真但潜伏）**。**②③ 不伪造精度**：②（间接调用）与 ③（平行 API）**无法靠文本分析解决** ⇒ 从「一个 33 条大堆」改为**四桶**：**A2b 导入即闲置**（被 import 但导入行外零提及）**1** · A1 零引用 **17** · A2a 间接调用/类型位置 **3** · A3 平行 API **11** ⇒ **需逐条查的 32 → 18**。**关键判据 `bareMentions` 是量证出来的**：它在 A2 候选上**恰好切开**已知答案 —— `ledgerMismatch` 裸提及 **0**（T1 已核实仅测试用，真可疑），而 `ChangeSet` 1（类型位置）/ `renderExperience` 1（回调）/ `sembleCandidates` 1（默认参数值）**全正当**。**第 4 类盲区（新发现，未修）**：`notRevoked` **有** 2 个调用点故**不在 A 段**，但那两点**都在零调用的 `assertNotRevoked` 内** ⇒ **事实上不可达却被报「有接线」**（数到了调用点，但它在死代码里）；修它需**调用图/可达性分析** ⇒ 已写进工具输出的「判定纪律」并立 **T10**。`audit-wiring.selftest` **11 → 13 组**；回归 **41/41** |
| v1.15.35 | **D6 结案：目录级 L0/L1 sidecar（ADR-0075）—— 吸收 OpenViking 三条，并把「层间不漂移」做成构造性质**。**落地前先实测枚举器**：`listMemories`（= 语料枚举器）只扫 `.shadow/<YYYY-MM-DD>/*.md`，且**只排除 `_index.md` 这一个名字** ⇒ 其余**任何** `.md` 都被当成一条记忆（进索引/召回/计数）。故**改判据而非逐名列举**：`n === "_index.md"` → **`n.startsWith("_")`** —— 原写法每加一个派生件都要记得回来补一句，**忘了补就静默污染语料**（本项目最常见的一类缺陷）；改成前缀分类后「派生物 vs 记忆」有了**唯一判据**（与 ADR-0074 的 `scopedFs`、T5 的 `isAdmissibleClaim` 同一手法）。**层次（每层只从下面那层派生）**：记忆（source）→ **L1**（确定性：条数/时刻跨度/入口/主题清单，≤4000）→ **L0**（**由 L1 抽取**：剥标题行、折叠空白、截断，≤256）→ `_index.md` 的「目录摘要（L0 · 派生物）」段。**②的要害**：若 L0 也从记忆文件另抽一遍，就会出现「同一条记忆两层说法不一致」而两层各自看都「没错」、**无判据可发现**（ADR-0063/D5 那一族）；**L0 = f(L1)** 让不一致在**构造上不可能**。**三条硬边界**（各有测试）：派生件不是 source（ADR-0003）· 所有输入显式传入（**不读时钟/随机数/fs** ⇒ 同输入逐字节相同）· 命名必须 `_` 前缀。**③ 覆盖率自报**：`covered`/`pending` 写成**显式可解析行**，由 `sidecarDrift` **独立重算**（不信自报）；**含正对照** —— 构造三种坏件（源头多一条 / L0 被单独改 / 坏文件）断言**全部被抓到**（否则「0 条漂移」可能只是检测器不工作）。**默认开**（与 `projectionStore` 默认关**不同**）：它是派生件、写入次数**有界**（每日期目录一份，O(#dates) 而非 O(N)）、且默认关等于**又一次「写好了但从不执行」**（T1/T4 刚清理的那一类）。**读路径存在**：先写 sidecar **再**引到 `_index.md`（顺序不能反，否则索引会指向写失败的摘要）。**诚实标注（新开 T9）**：**`pending` 恒为 0 是构造性的**（sidecar 与 `_index.md` 用同一份 `recs` 派生 ⇒ 不可能落后），该字段当前**只在构造坏件时有意义**、**不是**「会真实报警的增量检测」；真机规模/耗时未测、**召回收益未测（本轮未改检索排序）**、L0 质量未评、存量回填未做。回归 **41/41** |
| v1.15.34 | **D8 结案：默认开关表补齐三列（成熟度 / 降级行为 / 晋级标准）—— 并查出一处不存在的开关**。**补列**：**成熟度**这一列**本仓填不出来** —— 仓库从不给自己打 `stable`/`beta`/`experimental`（`adr/0073:53` 自陈「0 个 ADR 带『重新评估条件』小节」），**凭空造等级就是让文档比事实强**（正是 ADR-0072 刚修的谎）⇒ 改填**可核实的代理信号**（有开放未验证项 / 无开放未验证项 / 边界 ADR 未接受，均带出处）；**晋级标准**列 **15/16 = 仓库未定义**（唯一例外 `projectionStore` 且那是**启用触发条件**而非 beta→stable）——「查不到」如实写出来。**硬缺陷（本轮唯一代码改动）**：`knowledgeEngine.enabled` **生产零读取**（唯一读 `knowledgeEngine` 的是 `core/writer.ts:79`，读的是 `.llmNavigate`），`query/reads.ts:141` **无条件**建树，且 `createKnowledgeEngine(config)` 的**函数体从不引用 `config`** ⇒ `core/types.ts:36` 注释的「默认 off」与 README 的「`enabled: true` 启用」**三处都在描述一个不存在的开关**。**选「纠正文档」而非「补写闸门」**（与 D4 同判据）：真去实现 `enabled` 会让 `mode:"knowledge"` 默认失效（破坏现成可用功能）⇒ 校正类型注释 + **删死形参**（危害不是多一个参数，而是它**构成假象**让读者以为 `enabled` 已接线）+ 调用点注明 + README 表注④校正。**另 5 处实现与文档不符**（已在表注标明）：`episodes` **关不掉**（`showInIndex: 0` 被 `core/writer-core.ts:69` 的 `|| 8` 吞掉 ⇒ `:161` 闸门**恒真=死分支**，根因是**用 `||` 取默认把「显式 0」与「未传」混为一谈**）· 采集**无总开关**（`writeConsent` 语义不是关采集）· `retention` 的「stale 默认排除」**代码里无对应实现**（串列）· `kg` **不是 config 键**却被排在「默认」列 · 表**缺 `indexEngine` 行**（已补为第 17 行）。**立 T8**：按 ADR-0049 枚举（`unavailable`/warn/debug 三选一，**`console.log` 不算**）查出 **7 条静默降级** —— `llmRecall`（**最彻底**：回退无标记且 `label:""` 使 catch 日志分支也不触发）· `summary` · `recall` · **`queryLog`（默认开 ⇒ 优先级最高）** · `cooldownTurns` · `projectionStore`（**唯一可能属正当静默**：结果仍正确、只损失性能）· `episodes`（**`_index.md` 写失败仅 log ⇒ 可静默读到陈旧索引，与 ADR-0069 同族**）。回归 **40/40** |
| v1.15.34 | **D8 结案：默认开关表补齐三列（成熟度 / 降级行为 / 晋级标准）—— 并查出一处不存在的开关**。**补列**：**成熟度**这一列**本仓填不出来** —— 仓库从不给自己打 `stable`/`beta`/`experimental`（`adr/0073:53` 自陈「0 个 ADR 带『重新评估条件』小节」），**凭空造等级就是让文档比事实强**（正是 ADR-0072 刚修的谎）⇒ 改填**可核实的代理信号**（有开放未验证项 / 无开放未验证项 / 边界 ADR 未接受，均带出处），它恰好回答了这一列原本要问的「哪些稳定但耗 token、哪些接口还会变」；**晋级标准**列 **15/16 = 仓库未定义**（唯一例外 `projectionStore` 且那是**启用触发条件**而非 beta→stable）——「查不到」如实写出来。**硬缺陷（本轮唯一代码改动）**：`knowledgeEngine.enabled` **生产零读取**（唯一读 `knowledgeEngine` 的是 `core/writer.ts:79`，读的是 `.llmNavigate`），`query/reads.ts:141` **无条件**建树，且 `createKnowledgeEngine(config)` 的**函数体从不引用 `config`** ⇒ `core/types.ts:36` 注释的「默认 off」与 README 的「`enabled: true` 启用」**三处都在描述一个不存在的开关**。**选「纠正文档」而非「补写闸门」**（与 D4 同判据）：真去实现 `enabled` 会让 `mode:"knowledge"` 默认失效（破坏现成可用功能）⇒ 校正类型注释 + **删死形参**（危害不是多一个参数，而是它**构成假象**让读者以为 `enabled` 已接线）+ 调用点注明 + README 表注④校正。**另 5 处实现与文档不符**（已在表注标明）：`episodes` **关不掉**（`showInIndex: 0` 被 `core/writer-core.ts:69` 的 `|| 8` 吞掉 ⇒ `:161` 闸门**恒真=死分支**，根因是**用 `||` 取默认把「显式 0」与「未传」混为一谈**）· 采集**无总开关**（`writeConsent` 语义不是关采集）· `retention` 的「stale 默认排除」**代码里无对应实现**（串列）· `kg` **不是 config 键**却被排在「默认」列 · 表**缺 `indexEngine` 行**（已补为第 17 行）。**立 T8**：按 ADR-0049 枚举（`unavailable`/warn/debug 三选一，**`console.log` 不算**）查出 **7 条静默降级** —— `llmRecall`（**最彻底**：回退无标记且 `label:""` 使 catch 日志分支也不触发）· `summary` · `recall` · **`queryLog`（默认开 ⇒ 优先级最高）** · `cooldownTurns` · `projectionStore`（**唯一可能属正当静默**：结果仍正确、只损失性能）· `episodes`（**`_index.md` 写失败仅 log ⇒ 可静默读到陈旧索引，与 ADR-0069 同族**）。回归 **40/40** |
| v1.15.33 | **T1/T4 结案：A 类逐条分诊 —— 修 1 处真断线 + 1 处同型漂移 + 删 1 处空壳**。**A 段 33 条全部落格**：误报 12 · 零引用 18 符号 · 仅测试消费 4 · **真断线 1**。**补上「A 类精度低」的成因**（原 ADR 只给结论）：工具数不出三类调用 —— ① 调用点只在**注释**里（`progressiveDisclosure`/`refineTree` 命中的是 `core/knowledge-engine.ts:8` 的清单式注释）；② 经**数组/变量间接调用**（4 个长程 `assertResultNo*` 入 `resultGuards` 后循环调用、`renderExperience` 作回调传入、`sembleCandidates` 作默认参数注入）；③ 「成对导出、只接一半」的**平行 API**（delegation 7 个 `assert*` 包装，引擎只用谓词）。**真断线（唯一一处，已修）**：`countInconsistency`（`tools/toolset-authority.lib.ts:66`，注释写明「清单自洽性：`counts` 必须与 `rows` 相符」）**生产从未被执行** —— CLI 的 import 不含它，直接 `writeFileSync` ⇒ counts 与 rows 漂移无人发现。已在**写盘前**接线 + `process.exit(1)` 拒绝坏清单；锁是 **⑥ 接线棘轮**（断言 CLI **调了它**、在 `writeFileSync` **之前**、失败走 `exit(1)`；已验证**先红后绿**）。**关键点：断言的是「CLI 调了它」而非「函数存在」** —— 后者才是「机制对了、断的是谁调用它」的正解。**与 T5 同型的第二处真漂移（已修）**：`federation/contract.ts:23` 的 `isExchangeable` **再手写一遍**同一三元素数组，而 `federation/types.ts:13` 的 `EXCHANGEABLE_KINDS` 是唯一源（且零引用）。**危险点比 `c.status` 更具体**：`EXCHANGEABLE_KINDS: ExchangeableKind[]` **会被类型检查**，但内联字面量**不受该类型约束** ⇒ 加第四种可交换种类时类型系统**逼你**改前者、**不提醒**后者 ⇒ 静默漏掉。**删除空壳 `auditDrift`**：全仓零引用，判据不是「没人 import」而是它**没有信息价值**（只是打包两个检测器，CLI 本就直接调用）。**保留并注明 4 处**（`renderIntent`/`renderIdentityModel`/`core/knowledge-cost.ts`/delegation assert 家族）。**新发现（→ T7）**：`relationForProposal`（`temporal/edge.ts:30`）**忽略入参**恒返回常量 —— 与 §3 那族的危险不同：那是**口径分叉**（可加唯一源棘轮），这是**掉参数**（只能靠行为断言）。**两处对原文的更正**：`progressiveDisclosure`/`refineTree` 不是「误报」而是**仅测试消费**；`renderIntent` 不是「有生产调用点」而是**零引用**。**`ChangeSet` 与 D1 不矛盾**（一条说接口可达、一条说没人实例化）⇒ **D1 维持原判**。A 段 **33 → 31**；回归 **40/40** |
| v1.15.32 | **T5 结案：检测 B 各键逐个复核 —— 并先修了工具自己的漏报（ADR-0070 补记）**。**先修工具**：检测 B 的正则 `\b([\w$.]+)\s*===` 字符集**不含 `?`** ⇒ `c?.status === "supported"` 只从 `status` 起匹配，与不带 `?` 的**归不到同一个键** ⇒ **静默漏报**。实测后果：`world/guard/claim-admission.ts:6` 的 `isAdmissibleClaim`（**唯一判据源**）从 B 段**消失**，而它恰是那处真漂移的关键证据。修法：允许 `?.` 并把键里的 `?` 归一（`a?.b` 与 `a.b` 是同一条访问路径）；**键形态随之改为「接收者.字段=值」**（更精确）。回归锁 **⑤b**（夹具一侧 `x?.flag`、另一侧 `x.flag`，断言归到同一个键 `x.flag=join`）。**逐键复核（11 → 10 键）**：`c.status=supported` **真漂移（已修）**；`res.status=not_found`（v1.15.27 已修）；其余各落「正当分层」（`c.kind=*` 声明↔消费、`r.status=unavailable` 产出↔消费且该值是宿主声明类型、`err.code=ENOENT` 同一外部契约口径一致、`e.kind=user` 写侧↔读侧、`type=principle/anti_pattern` **共用同一类型声明**）或「同形不同义」（`kind=error` 是宿主流事件字段 vs 本插件局部形参；`v=string` 是回调形参别名）⇒ **1 处真漂移 + 0 处待复核**。**真漂移**：判据源已存在却在 `world/builder/representation-builder.ts:9`（**同文件已 import 该模块**）与 `query/world.ts:42` 各手写一遍 —— 性质同 ADR-0063/D5（同一条规则多份实现），已**收敛**到唯一判据源；新锁 `test/claim-admission-single-source.test.ts`（判据语义 / **源码级棘轮** / 行为反向不变量 / **正对照**）。**自曝**：该测试第一版自己写 `line.replace(/\/\/.*$/, "")` 剥注释，而本仓 `.ts` 是 **CRLF** ⇒ `.` 不匹配 `\r`、`$` 匹配不上 ⇒ **替换静默失败** ⇒ 测试**假红**；更根本地，那等于把「注释剥离」又写了一份 ⇒ 已改为**复用工具自己的 `stripComments`**。**附带**：台账「两级边界」不变量从**实测**升级为**棘轮**（`toolset-catalog.test.ts` **⑧**）。B 段 **11 键/28 处 → 10 键/25 处**；回归 **40/40** |
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
