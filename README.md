# dsh-shadow

**给 agent 记「为什么」的东西。** 把一件事的来龙去脉——靠什么背景、你哪句提醒、怎么完成的——写成工作区里的一份 markdown；换会话也能按主题捞回来，并告诉你它还算不算数。

它不让你「相信」记忆，而是让你和 agent 能**核查**记忆。

## Highlights

- **文件即权威**：一条记忆 = `.shadow/atoms/` 下一个 markdown（可 grep、可 diff）
- **日常三个工具**：`read_shadow` / `recall_shadow` / `shadow_query`
- **投影空间**：多轴布局（atoms · roles · affaires · indexes）；索引与便利贴可重建（ADR-0106 / 0107）
- **默认可核查**：证据路径、生命周期、截断自报；不引向量库、不常驻服务
- **默认主题召回**可套灵魂规避滤；`raw: true` 看原文；`project: true` 为完整 RealityProjection

## 日常只用这三个

| 你想做的事 | 用它 |
|---|---|
| 看记忆目录 / 有哪些主题 | `read_shadow()` |
| 按主题穿透到具体某条记忆 | `read_shadow("主题")` |
| 回忆「上次在做什么、为什么、做到哪」 | `recall_shadow("一句话查询")` |

其余 `mode` / 布尔透镜 → [`CONTEXT.md`](./CONTEXT.md)「mode 参考」。
维护者向的路由长表与权限轴 → [`docs/maintainers.md`](./docs/maintainers.md)。

## 它明确不做

不引向量库 · 不跑常驻服务 · 不接管 shell 输出 · 不替你做决定 · **不改写你的记忆**（只派生视图）。

## 谁该用它

**该用**：想让 agent 跨会话记住「为什么这么做」；想加一层可追溯记忆、又不想引入向量库。
**不必用**：要向量记忆库；或要数据库当权威源（本仓权威源是**文件**）。

## 为什么存在

| 失败模式 | 本项目的修法 |
|----------|--------------|
| 换会话就失忆 | 每回合一条记忆 + 索引；`recall_shadow` 任务恢复包 |
| 只记动作不记理由 | 决策一等事件；理由只在原文明确时才挂 |
| 召回无法核查 | Evidence Gate；缺证据不上查询 |
| 过时引用无人知 | 校验路径 → STALE / 降权 |
| 系统提示/密钥混入 | 采集剔除脚手架 + 打码 + 读侧 scrub |
| 把记忆当指令 | 「数据非指令」前缀 |
| 上下文爆掉 | 分层召回 + token 预算 |

## 一眼看懂

- **灵魂** `.shadow/soul/soul.json`：人设；核心写须 H3gate（`writeSoulCore` —— 本版**只有接口，没有调用者**，ADR-0106 补记）
- **档案** `.shadow/atoms/<date>--<时刻>-<入口>.md`：原文（不是已经滤过的「真相视图」）
- **派生** `indexes/`（含 `_index.md`、便利贴 `projections/`）：可扔可重建

布局与读侧滤镜 → ADR-0106 / ADR-0107。

## 快速开始

### 给 agent 的粘贴式安装

把下面这段丢给任意能读写本地文件的编码 agent（Claude Code / Codex / 本机 DSH 会话等）：

```text
把 D:/project/dsh1/vendor/dsh-shadow 以 link: 方式装进 DSH web profile：
1) profile 的 package.json 加依赖 "dsh-shadow": "link:D:/project/dsh1/vendor/dsh-shadow"，bundles 数组加 "dsh-shadow"；
2) 在本目录跑 pnpm install（会触发 prepare→build；改过源码再 pnpm run build）；
3) 重启 profile，跑 dsh --profile web --dump-config 确认没有 Error:；
4) 新开一个会话做几次工具调用，确认工作区出现 .shadow/atoms/<date>--<时刻>-<主题>.md、.shadow/indexes/_index.md 生成、read_shadow 出现在工具列表；
5) 说一句「回忆一下上次在做什么」，确认 recall_shadow 能返回任务恢复包。
失败或要细节，读 README 的「安装（持久化）」「验证（重启后）」；维护者向能力百科见 docs/maintainers.md。
```

### 手动安装与验证

见下文「安装（持久化）」「验证（重启后）」两节；目录位置见「目录位置」。

### 改代码后先过闸门：`npm run verify`

**任何改源码之后的下一步，唯一要记的命令是这一条**（v1.15.38 起，ADR-0077）：

```text
npm run verify
= npm run build                clean + tsc（写出当前 `dist/`；工具面/测试面类型门与单测都 import `dist/`）
+ npm run typecheck:tools      工具面类型门
+ npm run typecheck:tests      测试面类型门（v1.15.62：`test/**/*.ts` 全量，曾报 83 条既存诊断）
+ npm run audit:layers         结构门（v1.15.41：文件级无环 / 纯模块白名单零副作用 / 方向禁令）
+ npm run audit:scripts        脚本扩展名门（v1.15.87：仓内不得有**手写** `.js` / `.mjs` / `.cjs`；`.ts` 与 `.py` / `.ps1` 等允许）
+ npm run audit:docs           文档派生字段门（v1.15.66：①三方版本一致 ②`verify` 每一步都被**本块**与 `AGENTS.md` 点名 …… ⑦三处「验证基线」= `engines.dsh`，v1.20.2 补）
+ npm run audit:granularity    记录粒度门（v1.19.0 `adr/0097`：**起点之后**不得再有「纯动作回声」落成记忆文件）
+                               ⚠ 边界：**起点（2026-09-21）之前的归档豁免**（`adr/0049` 不改写历史）⇒ 它回答的是
+                                 「起点之后有没有新的纯动作记忆文件」，不是「全仓都不是」；同样要 `.shadow` 语料根（兜底同上）
+ npm run eval:retrieval:check 评测门完整性（v1.15.42：协议自检 / 基线只含聚合面 / 同源 / 读数齐备）
+                               ⚠ **语料根**：它要一个带 `.shadow` 的**工作区根** —— 默认由本工具位置**往上找**（最多三级，取第一个存在的）；
+                                 一个都没有 ⇒ **exit 2，后面 3 步（棘轮 / 插件面类型门 / 全部测试）不会跑** ⇒ 那一次「全绿」是**假绿**。兜底：`SHADOW_EVAL_ROOT=<工作区>`（本机 = `D:\project\dsh1`）
+ npm run audit:ratchet        分诊棘轮（v1.15.45：线索数只能降不能升；桶消失或新桶即红）
+ npx tsc --noEmit             插件面类型门
+ npm run test:all             = npm run build && node tools/run-tests.ts
                               （`build` = `clean` + `tsc`：先删 `dist/` 再 emit，避免搬家后的幽灵产物）
                               （行为测试 + 工具自检；**串行、每文件一个子进程**）
                               ⚠ **检查条数不抄在这里** —— 它由 `run-tests` 自己打印。
                               本块曾抄「43 个行为测试 + 5 个工具自检 = 48 项」，
                               抄完就烂（真值一路涨到 56+），而**没有任何东西会报错**
```

**它失败就不要往下走**（跑评测 / 长耗时验证 / 声称「全绿」之前必须先过它）——
否则一次编译错误会被伪装成一次评测结论。**注意它会先 `clean` 再写本地 `dist/`**（含 `build`；**不进 git**）：测试 import 的是
编译产物，不构建就会测到旧 `dist`；缺件时 `run-tests` exit 2。

**为什么要有这条命令**（ADR-0077 D2）：在此之前「全绿」只能靠人**记得**逐个跑 `node test/*.test.ts`
—— 于是「便宜且确定性的完整缝合线检查」实际上**没有单一入口**。补上它的**当轮**就抓到两处**既有**失败
（一处时间炸弹测试、一处工具自检），即此前「全绿」的结论**当时是错的**。

**结构门查什么**（v1.15.41，T13 前半）：① **文件级依赖图无环**；② **纯模块白名单零副作用**
（`core/paths.ts` / `core/types.ts` / `core/util.ts` / `security/scrub.ts`，**带腐化自检**：白名单里的路径不存在**也算违规**）；
③ **方向禁令**（`core↛query`、`core↛tools`、`persistence↛query`、`query↛tools`、**任何层↛`index.ts`**、任何层↛`presets`）。
**它刻意不查**：**层间环** —— 实测存在 `{core, evidence, persistence}` 层间环，成因是 **`core/` 是混合脊柱**
（`paths`/`types`/`util` 纯，`memory`/`writer-materialize`/`toolset-exec` 有副作用），**文件级并无环**；
把它写成禁令会让门**当场就红**（假闸门）。CLI 会打印这条成因与**语料口径**。单独入口：`npm run audit:layers`。

**评测门查什么**（v1.15.42，T14）：三档，**可用性不同，别看混** ——

| 档 | 命令 | 查什么 | 本部署可用性 |
|---|---|---|---|
| 确定性 | `npm run eval:retrieval:determinism` | 同一输入**两跑功能字段逐字节相同** | ✅ 恒可用 |
| 完整性 | `npm run eval:retrieval:check`（**在 `verify` 里**） | 协议自检 / 基线**只含聚合面** / 协议同源 / 门控读数齐备 | ✅ 可用，**但要有一个带 `.shadow` 的工作区根**（默认由工具位置往上找，最多三级；一个都没有 ⇒ **exit 2**） |
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

## 默认开关（装完什么都不动会怎样）

**只读工具不写工作区；默认值以本表为唯一台账。**两条方向的读法（**v1.15.85「默认全开」**起，「默认」列逐项对源码默认值）：**「默认开」= 关掉才是显式动作** —— 判据只有一处，`core/util.ts` 的 `onByDefault`（`undefined` = 开，**只有显式 `false`** 才关；`retention` / `forget` / `compact` 三件套共用它，见 `adr/0088`）；**「默认关」= 打开才是显式动作**，且按下面的权限轴**仅用户显式要求**（那一族多为需要外部 LLM / CLI 的增强）。`summary` / `queryLog` / `episodes` 都能一行关掉（`episodes.showInIndex: 0`，**v1.15.64 修好了**：此前被 `|| 8` 吞掉 ⇒ 那个开关**不存在**，见注①），采集本身**没有**总开关（只有语义不同的 `writeConsent`，见注 ②）。

契约台账 / 模块 Owns / Observatory 等 → [`docs/maintainers.md`](./docs/maintainers.md)。

> **关于「成熟度」列的读法（v1.15.34 / D8）**：本仓**不给自己打 `stable`/`beta`/`experimental` 等级**
> （全仓无此口径；`adr/0073:53` 亦自陈「0 个 ADR 带『重新评估条件』小节」）。若要凭空造一套等级，
> 就是**让文档比事实强** —— 正是 ADR-0072 刚修过的那种谎。
> 故该列填的是**可核实的代理信号**（三选一，均带出处）：
> **有开放未验证项**（列出 ADR/待办）· **无开放未验证项** · **边界 ADR 未接受**（已提出/暂不实现）。
> 它恰好回答了「成熟度」那一列原本要回答的问题：**哪些是「稳定但耗 token」，哪些是「接口还可能变」**。
>
> **「降级行为」列是 ADR-0049「缺件不静默」的一眼全览**。标 **⚠️静默** 的格子表示
> 「关闭或缺件后行为退到某处，但**没有任何可见信号**」—— 按 ADR-0049 它们是**候选缺陷**。
> **T8 已于 `v1.15.64` + `v1.15.65` 结案**（`adr/0084` / `adr/0085`）：**6 条补了可见信号**
> （统一进「能力降级台账」→ 读侧横幅），**1 条裁定为正当静默**（`projectionStore`；类判据是
> **「读者拿到的内容逐字节不变」**，见 `adr/0085` §5 与 `core/view/projection-store.ts`）。
> 下表**仍标 ⚠️静默** 的格子是**尚未进 T8 的同族**（如 `retention`），不是已修项。
> **⚠ 但 v1.15.85「默认全开」改了这一格的语义**：该格描述的现在只可能是**用户显式关掉**之后的样子，
> 而按 `adr/0085` 的裁定「**用户显式 `enabled:false` 不留痕** —— 关掉是用户的选择，渲染成告警＝把读者的决定当故障」
> ⇒ 它**不再是候选缺陷**，只是一句如实的后果说明（`adr/0088` §A.3-④）。

| 能力 | 默认 | 成熟度 | 降级行为（关闭 / 缺件时退到哪） | 晋级 / 启用标准 | 开着会怎样 · 怎么开 |
|------|------|--------|--------------------------------|------------------|----------------------|
| 采集与落盘 | **开**（无总开关） | **无开放未验证项**（ADR-0074 已于 `v1.15.40` 第 4 轮真机复核，**B3 闭环**） | 写失败 → `lastFlushError` + `console.error` → **读侧顶部横幅**（可见） | 仓库未定义 | 每回合压成一条记忆文件；`writeConsent: true` 改成「仅用户明说才落盘」（注②） |
| 一句话摘要 `summary` | **开** | 无开放未验证项 | 缺 `llm` / 缺 route / finish 出错 → `streamText` 返回 `""` → 文件里**只是没有** `> 摘要：` ✅**可见**（T8 第 2 条，v1.15.65：降级台账 → 横幅，含原因与后果；`v1.15.94`：横幅改取 `reason.failure` 的 code/message —— 原先取 `reason.message` 而 aborted 的 reason **只有 `failure`** ⇒ detail **恒空**、无法判断是「本插件超时」还是外部中断） | 仓库未定义 | 落盘后后台 LLM 生成一两句摘要；`summary.enabled: false` 关 |
| 查询观测 `queryLog` | **开** | 无开放未验证项 | 写失败 → 观测丢弃，读侧横幅**带真实原因** ✅**可见**（T8 第 4 条，v1.15.65；`v1.15.94`：`recordQueryObservation` 的返回值由 `boolean` 进一步收紧为 `{ok, reason?}` —— 原来只有真假、说不出「为什么」，横幅只能**猜**原因，一度把「读不到」写成「不可写」把排障引向错方向） | 仓库未定义 | 旁路写 `.shadow/query-log/<date>.jsonl`；`queryLog.enabled: false` 关 |
| Episode 回溯 `episodes` | **开**（`showInIndex: 0` 关，注①） | 无开放未验证项 | derive 抛错 → 索引不列 Episodes 段（与「暂无连续任务片段」**渲染成同一句**）✅**可见**（T8 第 7 条，v1.15.65）；写 `indexes/_index.md` 失败 → `lastIndexError` → 读侧横幅（`v1.15.55`） | 仓库未定义 | `indexes/_index.md` 生成任务回溯段；聚合间隔 `gapMinutes` 默认 60 |
| 语义召回 B 档 `recall` | 关 | 无开放未验证项 | `expandTerms → []` → 只用原词跑 A 档 ✅**可见**（T8 第 3 条，v1.15.65） | 仓库未定义 | 开需 `recall = { enabled: true, provider, model }` |
| 冷热淘汰 `recall.cooldownTurns` | 关（0） | 无开放未验证项 | 台账**读不到（真 I/O 错误）/ 坏件 / 写失败** → 各自留痕 ⇒ 冷却失效**可见**（T8 第 5 条，v1.15.65。注：v1.15.55 留的 `corrupt` 标记**此前没有任何消费者** = 等价于没留。`v1.15.94`：**「还没有台账」不算降级** —— 首次运行不再报；且 `cooldownTurns=0` 时**不读台账**，因为写入本就在同一个门里） | 仓库未定义 | 设 `cooldownTurns: 5`：N 回合内不重复返回同一段 |
| 召回 trace `recall.debug` | 关 | 无开放未验证项 | 无降级（仅不输出 diag，答案路径不变） | 仓库未定义 | 开需 `{ debug: true }` 或 `recall.debug: true` |
| 召回降权 `recall.deprioritize` | 空（不降权） | 无开放未验证项 | 无降级（空配置不降权）。注：**启用后**降权只在 debug 输出可见 | 仓库未定义 | 路径/入口含这些子串的命中打分 ×0.4（**只降权不移除**）；如 `["references-agents", "_reports"]` |
| 分层省略披露 `recall.lossDisclosure` | **开**（v1.15.91；`recall: { lossDisclosure: false }` 关） | 无开放未验证项 | **显式关掉** → 返回的条目**一字不变**，只是不再声明「这几条本该有片段却被省略」⇒ 读侧**无法区分**「本来就短」与「被省略」（`adr/0090` 甲-1 的那条判据被**显式放弃**；按 `adr/0085` 的裁定「用户显式关掉不留痕」） | 仓库未定义 | 关掉省约 150–250 字/次；开着才有 `> 分层省略：` + 逐条**句柄** —— **条内**损失与信封的**条级**损失分开说 |
| 记忆遗忘 `retention` | **开**（v1.15.85；`retention: { enabled: false }` 关） | 有开放未验证项（ADR-0067 / ADR-0068 真机待验） | **显式关掉** → 不做 hotness 加权、`registerMeta` 直接 return ⇒ `_meta.json` 不建档；差异**不可见** ⚠️**静默**（v1.15.85 起这是**用户的选择** ⇒ 按 `adr/0085` 不再是候选缺陷，见上注） | 仓库未定义 | 默认即 hotness 加权（注③：`stale` **不是**排除项，它喂生命周期标签）；`retention = { halfLifeDays: 7 }` 调半衰期 |
| GC / 归档 `forget` | **开**（v1.15.85；`forget: { enabled: false }` 关） | 有开放未验证项（`minHits` 链随 ADR-0067 待真机验） | **显式关掉** → `isForgettable` 恒 false、`maxActive` 失效（无降级） | 仓库未定义 | 默认即把低价值 / 过期记忆移出活跃召回集（**文件保留，Forget≠Delete ⇒ 不减磁盘占用**）；`staleDays` / `minHits` / `maxActive` 可调 |
| Episode 收口归档 `compact` | **开**（v1.15.85；`compact: { enabled: false }` 关） | 有开放未验证项（ADR-0068 `runCompact` delta 真机未验） | **显式关掉** → 直接 return，不合并（无降级） | 仓库未定义 | 默认即把结束的 episode 合成 consolidated 文件（**原子保留可回放**） |
| LLM 推理导航 `llmRecall` | 关 | 无开放未验证项 | 缺 `llm`/route/解析不出编号 → `[]` → 确定性 `renderRecovery` ✅**可见**（T8 第 1 条，v1.15.65。修前是**最彻底**的一条：`label:""` 使异常**连 log 都没有**，且 `!llm`/`!route`/finish 出错**三条路径从不进 catch**） | 仓库未定义 | 开需 `llmRecall = { enabled: true, provider, model }` |
| Projection Store `projectionStore` | 关 | 有开放未验证项（ADR-0069 真机端到端；D1 `invalidateFor` 未接线） | 读失败 / 坏行 → 全量重派生，**结果仍正确**、只是无缓存 —— **裁定为正当静默**（`adr/0049:38` 行级豁免 + `adr/0085` §5 的类判据：**读者拿到的内容逐字节不变**） | **有**：`projection-store.ts:5`「Node 稳定 + query 稳定 + rebuild 成本明显」 | `projectionStore.enabled: true` |
| 投影空间缓存 `projectionSpace.cache`（ADR-0107） | **开**（`cache: false` 关） | 新能力 | 关缓存 → 每次读重 hydrate（结果正确）；**不关**灵魂规避滤 | 仓库未定义 | **只**控小世界缓存。规避滤默认开、无独立 config（逃：`raw: true`）；便利贴 `indexes/projections/`（与 atom 同名，勿扫全树当记忆条数） |
| when 桶摘要 `abstracts`（v1.15.35 / ADR-0075；路径 ADR-0106） | **开** | **边界 ADR 已接受但收益未验证**（ADR-0075 自陈：召回收益未测 → T9） | 写失败 → 该 **when 桶**不列入 `indexes/_index.md`（索引少一行 = 内容变了）✅**可见**（v1.15.65 复查时补：它**不属于**正当静默那一类，判据同上；`showInIndex: 0` 的「不列」v1.15.64 才真的生效） | 仓库未定义 | 按 atom 文件名日期分桶，写 `indexes/abstracts/<date>/_abstract.md`（L1 + L0）；**不是**日期目录树；`abstracts.enabled: false` 关、`showInIndex` 控制索引里列几个（默认 3） |
| Knowledge Engine `knowledgeEngine` | **并非「关」——闸门不存在**（注④） | **边界 ADR 未接受**（`adr/0047` 已提出；`adr/0046` 实现计划冻结） | 读路径**无条件**建树；唯一闸门 `llmNavigate`（默认关）→ 确定性检索，**输出显式标注**「LLM 导航未启用/失败」（可见） | 仓库未定义 | `mode:"knowledge"` 直接用；`llmNavigate.enabled` 是**唯一**闸门 |
| 工程知识图谱 `kg` | 关（注⑤：**不是 config 键**，是 per-call 参数） | 无开放未验证项（已知局限：`MEMORY.md:92` 域推导，未解决） | 未传 → 不加图谱块；传入无匹配 → 输出「暂无匹配的组件/域」（无降级） | 仓库未定义 | 按需 `read_shadow(topic, { kg: true })` |
| 证据 Provider `evidenceProvider` | `fs` | 有开放未验证项（ADR-0059 真机 `host.fs`；V1 zg 未装未实测） | zg 未装 → `unavailable` + `zg_not_installed`；provider 拼错 → `unavailable` + `provider_unknown`；逐条 status+reason + 可执行缺件提示（可见） | 仓库未定义 | 换 `zg` 需已装 CLI；未装报 `unavailable`，不静默 fallback |
| 索引候选 `indexEngine`（**原表缺此行**） | `fs` | 有开放未验证项（V1：本机 `zg`/`semble` 均未装 ⇒ 两条 provider 路径**未实测**） | `fs` = 全量扫描（无外部依赖）；`zg`/`semble` 未装 → `unavailable` + 缺件提示，**绝不**冒充候选（可见） | 仓库未定义 | `indexEngine.provider` = `fs`（默认）/ `zg` / `semble` |
| 派生索引 `derivedIndex`（**T17-B** / `adr/0095`） | `fs`（**即不加速**） | 有开放未验证项（T17-C 的 9 项验证矩阵未跑；并发/多进程与跨平台锁未测；真实流量漏召回率未测） | 拿不到宿主路径 / 会话只读 / `node:sqlite` 缺失 → `unavailable` + **回退 fs 全量**（读侧横幅可见）；`corrupt`（schema 不符）→ 挪走坏件、本次回退、**下次整体重建**；`query error` → 回退本次；**合法 0 行不算降级** | **有**：`adr/0095` §七的 T17-C 矩阵全过之后才考虑把 `sqlite` 设为默认 | `derivedIndex: { provider: "sqlite" }`：候选改从 `.shadow/indexes/index.sqlite` 取（稳态一次查询 = 根 `listDir` ~5 ms + 查索引）；首次付一次冷建索引；`verifySources: "full"` 是「外部原地改内容」的逃生口 |

**表注（每条都对应一处实现与文档不符，或一处「看起来有开关其实没有」）**

⓪ **行数**：原表 16 行 ⇒ v1.15.34 补 **`indexEngine`**、v1.15.35 补 **`abstracts`**
⇒ **现 21 行**（v1.21.0 补 `projectionSpace`；v1.15.96 补 `derivedIndex`；v1.15.91 补 `lossDisclosure`）。

① **`episodes` 关不掉** —— ✅ **已在 `v1.15.64` 修复**（`adr/0084`），本条留档说明**修前**的形态：
   `showInIndex: 0` 被 `core/writer/core.ts` 的 `|| 8` 吞掉 ⇒
   `core/writer/materialize.ts` 的 `episodeShow > 0` 闸门**恒真**（死分支，即那个开关**不存在**）；
   `gapMinutes: 0` 同样被 `|| 60` 吞掉（`core/writer/core.ts` / `core/view/episode.ts` / `query/reads.ts` **三处各写一遍**）
   ⇒ `Math.max(0, …)` 永不生效。根因是**用 `||` 取默认值把「显式 0」与「未传」混为一谈**。
   现统一走 `core/util.ts:numOr`（判据只此一处），并把默认值的落点收成 `deriveEpisodes` 一处。
② **采集没有总开关**：`writeConsent` 的语义是「改成仅明说才落盘」，**不是**「关掉采集」。
③ **`retention` 的「stale 默认排除」在代码里没有对应实现**：`staleDays`/`stale` 在
   `retention.enabled` 判断**之外**计算（`query/query.ts` 的 `const staleDays = …` 与 `let stale = ageDaysOf(mm.rel) >= staleDays;` 两行），关闭 retention 也照标 stale；
   而 `stale` 只喂生命周期标签（`subject/observer/arbitrate.ts:15,28,39`、`core/retention/lifecycle.ts:33`），**不做排除**。
   唯一带「排除」语义的是 `retention.enabled` 时对 `rec.status !== "active"` 的 `continue`（`query/query.ts` 的 `if (rec && rec.status && rec.status !== "active" && !rec.pinned) continue;`）。
   原表把它写在「默认」列，属**串列**。
④ **`knowledgeEngine` 的闸门不存在（v1.15.34 实测校正的硬缺陷）**：`ShadowConfig.knowledgeEngine.enabled`
   **生产零读取**（全仓唯一读取是 `core/writer/index.ts` 读 `.llmNavigate`）；`query/reads.ts`
   **无条件**建树；且 `createKnowledgeEngine` 原本收一个 `config` 形参却**从不使用**它
   （已删死形参）。⇒ 原表写「默认 关 / `enabled: true` 启用」描述的是**一处不存在的开关**。
   本 mode 的**唯一**闸门是 `llmNavigate.enabled`。
⑤ **`kg` 不是 config 键**：它不在 `ShadowConfig` 里，只是 per-call 参数（`query/query.ts`），
   原表却把它排在「默认」列里，与真正的 config 默认值混用同一列。

## 能力还在哪

采集细节、灵魂投影百科、契约、模块归属、Observatory / Fitness / Evidence / 可选 CLI / 投影预设 → **[`docs/maintainers.md`](./docs/maintainers.md)**。

## 兼容性（验证基线）

| 项 | 值 |
|---|---|
| 验证基线 | **DSH `0.1.7-rc.2`**（在这一版上验证并运行） |
| 声明 | `package.json` → `engines.dsh: ">=0.1.7-rc.2"` |
| 更早版本 | **未经验证，不承诺可用** |

**这是一句「验证基线」声明，不是强制闸门。** 宿主与 pnpm 目前都不读 `engines.dsh`（对 `@deepseek-ai/*` 全量编译产物检索 `engines`：**无任何代码读取**，仅散文注释提及；`dsh plugin` 只转发 pnpm，并按「装了什么」同步 bundles 层），所以它拦不住低版本 DSH。**能观测到的防线是能力探测**——它只**报告**、不拦截：插件探测自己需要的宿主接口，缺哪个就报哪个：

| 档位 | 缺什么 | 表现 |
|---|---|---|
| 硬依赖 | `ctx.on` / `ctx.inject` / `ctx.get` / `fs` / `tools` | 控制台 **error**，写出缺哪一项、影响什么 |
| 可选依赖 | `llm` / `agents` / `agentDefaultModel` / `systemPrompt` | 控制台**一条 warn**，说明降级了哪项能力 |

探测**不放在 `apply()`、也不放在 `inject` 回调**：Cordis 的服务是异步挂载的，`apply()` 时可能尚未 provide（会误报）；而 `ctx.inject(deps, cb)` **只在依赖就绪时才回调** —— 依赖缺失时回调根本不执行，把「缺 X」写进去等于「缺了就不报」（v1.15.3 修正的正是这一点）。故服务面检查**统一在首个 `agent/turn-stopping`**（此时宿主已完全挂载，且只报一次）。

**为什么基线从 `0.1.5-rc.1` 抬到 `0.1.7-alpha.1`、又随 `v1.20.1` 抬到 `0.1.7-alpha.2`（ADR-0098）**：抬升的**唯一**理由是**预设形态**。0.1.7 起 agent 预设只能是 `@deepseek-ai/dsh-agent-preset` 声明行（随 bundle 的 `dsh.bundle.patch` **数组**发布），旧的 `$DSH_HOME/.agent-presets/<id>/` 目录**没有任何读取者**（官方 shipped skill 原文 *Nothing reads that directory any more*）⇒ 随包预设的形态迁移是**单向门**，迁过去之后 ≤0.1.6 不再认它。**插件体本身没坏**——实测（对 0.1.5-rc.2 与 0.1.7-alpha.1 的 `.d.ts` 逐文件比对）：`dsh-goal` 逐字未变；`user/message` / `assistant/message` 事件形状未变（新增的 `developer/message` 被 `core/retention/collect.ts` 直接忽略）；`fs` 只**新增** `watch`；`systemPrompt.context({name,order,text})` 未变；`session.header.cwd` 仍在。所以这是一次**声明上的硬切**，不是插件面破坏。完整证据与隔离实测见 `adr/0098`。

**基线在 `v1.21.4` 再抬到 `0.1.7-rc.2`（`adr/0098` §7 补记）**：判据与上面同源，且这次是**逐字节比对**的 —— 本机两代 dlx 树（alpha.2 vs rc.2）的**实质面**（`lib/**` / `presets/**` / `locale/**`）里，**`dsh-agent-preset` 与 `dsh-web-app`（含随包 `presets/standard.patch.yml`）均 0 处差异**（后者 7511 字节 / MD5 与 alpha.1 / alpha.2 / rc.1 **四代相同** ⇒ 本仓那份「faithful copy」**无需重同步**），`dsh-experimental-tool-agent-team` 也 0 处；rc.2 上 `preset-projection` 行 active，且**本会话的人格文本即它注入**（⇒ 声明行确被读取）。⚠ **未核**：`dsh-tools` / `dsh-session` / `dsh-experimental-agent-team` / `dsh-goal` 的 `lib/**` **确有变化**，本仓只经**注入的服务**消费它们，**「这四个包的变化对本仓有无影响」本次未逐行核对**（详见 `adr/0098` §7）。

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

改动 `cordis.patch.yml` 后需重启 profile 生效。源码为 TypeScript：`index.ts` → `tsc`（TypeScript 7.x）→ `dist/index.js`（DSH/Cordis 加载的是编译后 JS，`package.json.main` 指向 `dist/index.js`）；`dist/` **不进 git**（v1.20.6），`prepare` / `prepublishOnly` / 改码后的 `pnpm run build`（**先 clean 再 tsc**）负责产出；再重启 profile。

## 验证（重启后）

```sh
dsh --profile web --dump-config   # 确认无 Error:
```

然后在一个新会话里做几次工具调用，检查 `<工作区>/.shadow/atoms/` 是否出现「每条记忆一个文件」，并确认 `read_shadow` 出现在工具列表；`.shadow/indexes/_index.md` 是否生成索引。

## 目录位置

`<工作区>/.shadow/atoms/<date>--<时刻>-<主题slug>.md`。Observer Projection 存储根 = **`<工作区>/.shadow/`**（点开头，`SHADOW_ROOT` 常量；ADR-0106 投影空间布局）。工作区取 `agent.session.header.cwd`（配置 `shadowRoot` 可覆盖）。解析优先级：显式 `shadowRoot`/`projectRoot` → session cwd → **兜底 `~/.dsh-observer/shadow`**（全球 Observer Continuity Shadow 根；仅当连 cwd 都解析不出时，保证可写而非静默不写；**不与 Workspace Memory 混合**，见 ADR-0036）。三者分层：`.shadow/`=Observer Projection、`.dsh-shadow/`=Workspace World Shadow、`~/.dsh-observer/`=Global Observer Continuity。

## 投影模式（可选预设）

本插件经 bundle 在 host 常开。可选人格预设 **投影模式**（`presets/projection.patch.yml`）的 Teams 纪律与安装细节 → [`docs/maintainers.md`](./docs/maintainers.md) · [`presets/README.md`](./presets/README.md)。

## 版本 / 变更

> 完整变更历史（按版本，含每个版本的决策/边界/验证记录）见 [CHANGELOG.md](./CHANGELOG.md)。
> **尚未完成的事项（阻塞项 / 待分诊 / 待决策 / 未验证 / 已知空白）见 [BACKLOG.md](./BACKLOG.md)** ——
> 那是待办的唯一台账，每条带「依据 / 为什么没做 / 完成判据」，与 CHANGELOG 的「已做」互补。

**当前版本：`v1.21.11`**（四条决策已落账 —— 见 [`CHANGELOG.md`](./CHANGELOG.md)）—— **完整变更历史见 [`CHANGELOG.md`](./CHANGELOG.md)**（历史只写一处：本文件不再保留版本历史表）。
