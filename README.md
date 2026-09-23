# dsh-shadow

**给 agent 记「为什么」的东西。** 它把一件事的来龙去脉——**靠什么背景、你哪句提醒、怎么完成的**——写成工作区里的一份 markdown；
换会话、换 agent，也能按主题把这条线索捞回来，并**告诉你它还算不算数**（当时引用的文件还在不在）。

它不让你「相信」记忆，而是让你和 agent 能**核查**记忆。

## 一眼看懂（投影的三层）

- **灵魂** `.shadow/soul/soul.json`：它是谁、在乎什么、不干什么。很少变，**只有你能改**。
- **思维** `.shadow/<日期>/<时刻>-<入口>.md`：它按人设做的判断——**人设投出的影子**，一次一件事，一个文件。
- **笔记会长成人设的新版本**：反复复盘、过了门槛（出现次数／时间稳定性／反证不过多）才允许；**人设原文仍只有你能改**。
- `.shadow/` 是整套投影的落盘；`_index.md` 与召回都是它的**派生视图**（可随时重建）。

## 日常只用这三个

| 你想做的事 | 用它 |
|---|---|
| 看记忆目录 / 有哪些主题 | `read_shadow()` |
| 按主题穿透到具体某条记忆 | `read_shadow("主题")` |
| 回忆「上次在做什么、为什么、做到哪」 | `recall_shadow("一句话查询")` |

其余参数（`mode="…"` 与 `{ soul / identity / taste / experience / judgment / context … }`）是**按需查询面**：
逐个的语义、入参与返回见 `CONTEXT.md` 的「mode 参考」表。

## 它明确不做

不引向量库 · 不跑常驻服务 · 不接管 shell 输出 · 不替你做决定 · **不改写你的记忆**（只派生视图）。

## 谁该用它

**该用**：想让 agent 跨会话记住「为什么这么做」的人；想给 DSH 加一层**可追溯**记忆、又不想引入向量库的人。
**不必用**：想要「更会检索」的向量记忆库——它刻意不做；想要一个记忆数据库——它的权威源是**文件**，不是 DB。

---

> **本文件给人看**；agent 读三处：`AGENTS.md`（在本仓库干活时的约定）· `CONTEXT.md`（术语表 + 各 mode 的入参与返回）· `adr/`（决策与边界，按编号）。
> 下面的顺序是「**为什么存在 → 灵魂那一层 → 怎么开始用 → 路由表 → 它做什么 → 外部 CLI → 安装与验证 → 维护者面（兼容性／契约／台账）→ 版本**」。

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


## 哲学

它不是"记动作的日志"，而是把 agent 的思维与上下文**落成文件树**：`.shadow/` 就是投影，`_index.md` 是投影的索引。记忆以「入口点 + 时间」为纲，思维/决策为正文，动作为背景。


## 灵魂投影系统（投影的第三层：身份与尺度）

- **Soul Kernel**：`read_shadow({ soul: true })` 返回 curated 公理层（身份/价值观/原则/品味/边界，`.shadow/soul/soul.json`）——这是"为什么我是我"的稳定锚，**非事件流、按需查询**；`systemPrompt.context` 接线提示取舍可查灵魂。
- **Experience**：`read_shadow(topic, { experience: true })` 从**完整线索头**派生结构化工程经验（情境/问题/决策/实现/证据/结果/教训/项目/目标）——把一段开发经历投影成可复用的 `Experience #N` 对象，而非零散行。
- **Judgment + Taste**：`read_shadow(topic, { judgment: true })` 从记忆派生「面对情境 → 我判断/选择决策」；`read_shadow({ taste: true })` 读 curated 偏好（灵魂 taste + `.shadow/taste/taste.json`）。灵魂四对象（Soul/Experience/Judgment/Taste）+ Memory 五层全部就位。
- **Observer / Observation Window**：`read_shadow(topic, { observer: true, asOf })`——`asOf` 时间锚定只召回窗口内记忆，`observer` 只呈现「当时可知」（情境/问题/决策），把 outcome/lesson/verdict 等「后来才知」标为 `[后验]`。这是从"端全局答案的 Oracle"升级为"模拟一个拥有这些长期结构的人、只站在当前时刻会怎么想"的 Observer。
- **Projection + Observer 透镜**：`read_shadow(topic, { project: true })` 用 **Soul-as-Observer 透镜**（`soul.observer.what_matters/what_to_ignore`）把全局模型投影成 `LocalContext`（`relevant` 原则/经验/偏好 + `current_state` + `uncertainty` + `excluded`）。**与 retrieval 的本质区别**：retrieval 返回"相关排名"，projection 返回"**带取舍的局部上下文**"——`excluded` 字段就是"为体验而限制视角、故意不看的部分"的工程化身。
- **Observer Kernel / RealityProjection / Judgment**：**Observer 是根**（不是 Memory）。`read_shadow({identity:true})` 返回长期 `Identity` 主体锚；`{context:true}` 返回一次观察事件 `ObserverContext`（observerId/identityRef/intent/asOf/lens/realityAnchor），intent 是**目标导向**；`{project:true}` 输出 `RealityProjection` 带 `distortion`（为什么这个视角看到这些/没看到那些）+ `excluded_reason`；`{claim:true}` 输出 `Judgment`（claim→Evidence→Judgment，**Observer 决定、Evidence 输入**）。同一事实在不同 Observer 透镜下投影不同——"不是记忆检索，而是观察投影"。
- **Episode / Decision Lineage**：`read_shadow({mode:"episode"})` 把 Event/Turn 级记忆原子按「项目/会话 + 时间间隔」串成**连续任务（Episode）**，`{mode:"decision"}` 把**决策从统计字段提升为可追踪血缘**（按入口聚合：goal 事件 + 用户拍板）。**派生式、纯读、不改写侧采集**：Memory 文件仍是 source of truth，`_index.md` 新增「任务回溯（Episodes）」段把碎片呈现给人类/agent。一次连续任务靠「决策链 + 动作 + 背景」还原。


## 快速开始

### 给 agent 的粘贴式安装

把下面这段丢给任意能读写本地文件的编码 agent（Claude Code / Codex / 本机 DSH 会话等）：

```text
把 D:/project/dsh1/vendor/dsh-shadow 以 link: 方式装进 DSH web profile：
1) profile 的 package.json 加依赖 "dsh-shadow": "link:D:/project/dsh1/vendor/dsh-shadow"，bundles 数组加 "dsh-shadow"；
2) 在本目录跑 pnpm install（会触发 prepare→build；改过源码再 pnpm run build）；
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


## 什么情况用哪个（模式路由表）

| 你想做的事 | 用这个 | 说明 |
|------------|--------|------|
| 看记忆目录 / 有哪些主题 | `read_shadow()` | 无参数返回 `_index.md`：格式说明 + 近期记忆 + 入口索引 + 意识轨迹；**与带 `topic` 的路径共用同一份 token 预算**（`max_tokens`，默认 1600），超预算按段返回并**按段名 + 行数披露**丢了什么（v1.15.85，见 `adr/0088`） |
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

另有长程与边界族 mode（`agency-*`、`delegation-*`、`adapt-*`、`horizon-*`、`recall-*`、`federation*`、`distortion`、`real-evidence`/`real-refer`、`simulate`/`candidate`/`execute`、`validate`/`evidence`、`model-*`、`world-*`、`temporal`、`reflection`、`observer-*`、`workspace-*`、`continuity-index`、`identity-advance`、`recovery`），属 ADR 落地的按需查询，不是日常入口；**每个 mode（条数不写在这里 —— 由 `test/recall-envelope.test.ts` 断言，并要求 `CONTEXT.md` 覆盖齐全）的语义、入参与返回见 `CONTEXT.md` 的「mode 参考」表**（工具 schema 里的 `mode` 描述只留常用 mode + 指针，避免每个请求都背上这份清单）。
> **命名口径（ADR-0050 / ADR-0053）**：mode 名与参数名以工具 schema + `CONTEXT.md` 为唯一现行口径；被取代的旧名本文件不登记（映射与理由见 ADR-0050 / ADR-0053），调用旧名会返回「已废止：X → 请用 Y」，不落空进默认召回。
> **取舍（有意为之）**：schema 不再携带各族边界语（如「非 Autonomous Agent」「不提升 epistemic/authority」）。不读 `CONTEXT.md` 的模型会少这层提醒——换来的是每个请求少约 1.2k 字符常驻上下文。要恢复，把 `CONTEXT.md` 的 mode 参考表接回 `mode` 描述即可。

### 谁能调用（用户显式 vs 模型自动）

借 mattpocock/skills 的权限轴：**模型能自己调的，不能反过来触发「只该用户要求」的动作**。

| 工具 / 动作 | 谁能调用 | 说明 |
|-------------|----------|------|
| `read_shadow` / `recall_shadow` / `shadow_query` | 模型可自动调用 | 纯读：不写工作区、不落盘、不改索引；提示词已接线「缺上下文先查」 |
| `read_shadow(..., { debug: true })` / `{ verifyEvidence: true }` / `{ kg: true }` | 模型可自动调用 | 只是多返回 trace / 证据验证 / 图谱邻接，仍不改状态 |
| `mode: "shadow-report"` / `mode: "query-log"` 体检 | 用户要求，或定期自查 | 只读、只生成派生报告（`rm -rf` 可重建） |
| **改** `retention` / `forget` / `compact`（**v1.15.85 起默认开**）· **开** `projectionStore` / `knowledgeEngine.llmNavigate` | **仅用户显式要求** | 会改召回集与索引行为，属有后果动作（改配置 + 重启）。**方向已变**：三件套现在是「**关掉**才是显式动作」（唯一判据 `core/util.ts` 的 `onByDefault`，见 `adr/0088`） |
| `mode:"toolset"`（只读巡检 / 能力预检） | 模型可自动调用 | 只是探测可选 CLI 是否可用，不改任何东西 |
| `mode:"toolset"` + `install:"<id>"`（**安装**） | **仅用户显式要求** | 有后果动作：**一律先经宿主审批**，只有 `allowed-once` 才执行；装完**重探**再报结果 |
| `writeConsent: true` 之后的落盘 | **仅用户显式要求** | 用户没明说「记住」时只累积不落盘（默认 `false` 照常采集） |


## 它做什么
> **怎么读这一章**：下面是**能力分组**，一段一件。**标了「维护者面 · 可跳」的小节**（受保护契约面 / 模块归属表 / 工具集台账）是给改这个插件的人看的，
> 你只是想用它，**整段跳过不影响**。日常入口见上面的「日常只用这三个」。

`dsh-shadow` 把 agent 的一回合压成「一条记忆 = 一个文件」，可穿透召回，并逐步升级为一套「灵魂投影系统」。核心能力按主题分组如下。

### 默认开关（装完什么都不动会怎样）

**只读工具不写工作区；默认值以本表为唯一台账。**两条方向的读法（**v1.15.85「默认全开」**起，「默认」列逐项对源码默认值）：**「默认开」= 关掉才是显式动作** —— 判据只有一处，`core/util.ts` 的 `onByDefault`（`undefined` = 开，**只有显式 `false`** 才关；`retention` / `forget` / `compact` 三件套共用它，见 `adr/0088`）；**「默认关」= 打开才是显式动作**，且按下面的权限轴**仅用户显式要求**（那一族多为需要外部 LLM / CLI 的增强）。`summary` / `queryLog` / `episodes` 都能一行关掉（`episodes.showInIndex: 0`，**v1.15.64 修好了**：此前被 `|| 8` 吞掉 ⇒ 那个开关**不存在**，见注①），采集本身**没有**总开关（只有语义不同的 `writeConsent`，见注 ②）。

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
> **「读者拿到的内容逐字节不变」**，见 `adr/0085` §5 与 `core/projection-store.ts`）。
> 下表**仍标 ⚠️静默** 的格子是**尚未进 T8 的同族**（如 `retention`），不是已修项。
> **⚠ 但 v1.15.85「默认全开」改了这一格的语义**：该格描述的现在只可能是**用户显式关掉**之后的样子，
> 而按 `adr/0085` 的裁定「**用户显式 `enabled:false` 不留痕** —— 关掉是用户的选择，渲染成告警＝把读者的决定当故障」
> ⇒ 它**不再是候选缺陷**，只是一句如实的后果说明（`adr/0088` §A.3-④）。

| 能力 | 默认 | 成熟度 | 降级行为（关闭 / 缺件时退到哪） | 晋级 / 启用标准 | 开着会怎样 · 怎么开 |
|------|------|--------|--------------------------------|------------------|----------------------|
| 采集与落盘 | **开**（无总开关） | **无开放未验证项**（ADR-0074 已于 `v1.15.40` 第 4 轮真机复核，**B3 闭环**） | 写失败 → `lastFlushError` + `console.error` → **读侧顶部横幅**（可见） | 仓库未定义 | 每回合压成一条记忆文件；`writeConsent: true` 改成「仅用户明说才落盘」（注②） |
| 一句话摘要 `summary` | **开** | 无开放未验证项 | 缺 `llm` / 缺 route / finish 出错 → `streamText` 返回 `""` → 文件里**只是没有** `> 摘要：` ✅**可见**（T8 第 2 条，v1.15.65：降级台账 → 横幅，含原因与后果；`v1.15.94`：横幅改取 `reason.failure` 的 code/message —— 原先取 `reason.message` 而 aborted 的 reason **只有 `failure`** ⇒ detail **恒空**、无法判断是「本插件超时」还是外部中断） | 仓库未定义 | 落盘后后台 LLM 生成一两句摘要；`summary.enabled: false` 关 |
| 查询观测 `queryLog` | **开** | 无开放未验证项 | 写失败 → 观测丢弃，读侧横幅**带真实原因** ✅**可见**（T8 第 4 条，v1.15.65；`v1.15.94`：`recordQueryObservation` 的返回值由 `boolean` 进一步收紧为 `{ok, reason?}` —— 原来只有真假、说不出「为什么」，横幅只能**猜**原因，一度把「读不到」写成「不可写」把排障引向错方向） | 仓库未定义 | 旁路写 `.shadow/query-log/<date>.jsonl`；`queryLog.enabled: false` 关 |
| Episode 回溯 `episodes` | **开**（`showInIndex: 0` 关，注①） | 无开放未验证项 | derive 抛错 → 索引不列 Episodes 段（与「暂无连续任务片段」**渲染成同一句**）✅**可见**（T8 第 7 条，v1.15.65）；写 `_index.md` 失败 → `lastIndexError` → 读侧横幅（`v1.15.55`） | 仓库未定义 | `_index.md` 生成任务回溯段；聚合间隔 `gapMinutes` 默认 60 |
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
| 目录级摘要 `abstracts`（v1.15.35 / ADR-0075） | **开** | **边界 ADR 已接受但收益未验证**（ADR-0075 自陈：召回收益未测 → T9） | 写失败 → 该目录**不列入** `_index.md`（索引少一行 = 内容变了）✅**可见**（v1.15.65 复查时补：它**不属于**正当静默那一类，判据同上；`showInIndex: 0` 的「不列」v1.15.64 才真的生效） | 仓库未定义 | 每日期目录写一份 `_abstract.md`（L1 + L0）；`abstracts.enabled: false` 关、`showInIndex` 控制索引里列几个（默认 3） |
| Knowledge Engine `knowledgeEngine` | **并非「关」——闸门不存在**（注④） | **边界 ADR 未接受**（`adr/0047` 已提出；`adr/0046` 实现计划冻结） | 读路径**无条件**建树；唯一闸门 `llmNavigate`（默认关）→ 确定性检索，**输出显式标注**「LLM 导航未启用/失败」（可见） | 仓库未定义 | `mode:"knowledge"` 直接用；`llmNavigate.enabled` 是**唯一**闸门 |
| 工程知识图谱 `kg` | 关（注⑤：**不是 config 键**，是 per-call 参数） | 无开放未验证项（已知局限：`MEMORY.md:92` 域推导，未解决） | 未传 → 不加图谱块；传入无匹配 → 输出「暂无匹配的组件/域」（无降级） | 仓库未定义 | 按需 `read_shadow(topic, { kg: true })` |
| 证据 Provider `evidenceProvider` | `fs` | 有开放未验证项（ADR-0059 真机 `host.fs`；V1 zg 未装未实测） | zg 未装 → `unavailable` + `zg_not_installed`；provider 拼错 → `unavailable` + `provider_unknown`；逐条 status+reason + 可执行缺件提示（可见） | 仓库未定义 | 换 `zg` 需已装 CLI；未装报 `unavailable`，不静默 fallback |
| 索引候选 `indexEngine`（**原表缺此行**） | `fs` | 有开放未验证项（V1：本机 `zg`/`semble` 均未装 ⇒ 两条 provider 路径**未实测**） | `fs` = 全量扫描（无外部依赖）；`zg`/`semble` 未装 → `unavailable` + 缺件提示，**绝不**冒充候选（可见） | 仓库未定义 | `indexEngine.provider` = `fs`（默认）/ `zg` / `semble` |
| 派生索引 `derivedIndex`（**T17-B** / `adr/0095`） | `fs`（**即不加速**） | 有开放未验证项（T17-C 的 9 项验证矩阵未跑；并发/多进程与跨平台锁未测；真实流量漏召回率未测） | 拿不到宿主路径 / 会话只读 / `node:sqlite` 缺失 → `unavailable` + **回退 fs 全量**（读侧横幅可见）；`corrupt`（schema 不符）→ 挪走坏件、本次回退、**下次整体重建**；`query error` → 回退本次；**合法 0 行不算降级** | **有**：`adr/0095` §七的 T17-C 矩阵全过之后才考虑把 `sqlite` 设为默认 | `derivedIndex: { provider: "sqlite" }`：候选改从 `.shadow/index.sqlite` 取（稳态一次查询 = 根 `listDir` ~5 ms + 查索引）；首次付一次冷建索引；`verifySources: "full"` 是「外部原地改内容」的逃生口 |

**表注（每条都对应一处实现与文档不符，或一处「看起来有开关其实没有」）**

⓪ **行数**：原表 16 行 ⇒ v1.15.34 补 **`indexEngine`**（原缺行）、v1.15.35 补 **`abstracts`**（D6 新能力）
⇒ **现 20 行**（v1.15.96 补 `derivedIndex`，见 `adr/0095` 的 T17-B 补记；v1.15.91 补 `lossDisclosure`，见 `adr/0092`）。

① **`episodes` 关不掉** —— ✅ **已在 `v1.15.64` 修复**（`adr/0084`），本条留档说明**修前**的形态：
   `showInIndex: 0` 被 `core/writer/core.ts` 的 `|| 8` 吞掉 ⇒
   `core/writer/materialize.ts` 的 `episodeShow > 0` 闸门**恒真**（死分支，即那个开关**不存在**）；
   `gapMinutes: 0` 同样被 `|| 60` 吞掉（`core/writer/core.ts` / `core/episode.ts` / `query/reads.ts` **三处各写一遍**）
   ⇒ `Math.max(0, …)` 永不生效。根因是**用 `||` 取默认值把「显式 0」与「未传」混为一谈**。
   现统一走 `core/util.ts:numOr`（判据只此一处），并把默认值的落点收成 `deriveEpisodes` 一处。
② **采集没有总开关**：`writeConsent` 的语义是「改成仅明说才落盘」，**不是**「关掉采集」。
③ **`retention` 的「stale 默认排除」在代码里没有对应实现**：`staleDays`/`stale` 在
   `retention.enabled` 判断**之外**计算（`query/query.ts` 的 `const staleDays = …` 与 `let stale = ageDaysOf(mm.rel) >= staleDays;` 两行），关闭 retention 也照标 stale；
   而 `stale` 只喂生命周期标签（`observer/arbitrate.ts:15,28,39`、`core/lifecycle.ts:33`），**不做排除**。
   唯一带「排除」语义的是 `retention.enabled` 时对 `rec.status !== "active"` 的 `continue`（`query/query.ts` 的 `if (rec && rec.status && rec.status !== "active" && !rec.pinned) continue;`）。
   原表把它写在「默认」列，属**串列**。
④ **`knowledgeEngine` 的闸门不存在（v1.15.34 实测校正的硬缺陷）**：`ShadowConfig.knowledgeEngine.enabled`
   **生产零读取**（全仓唯一读取是 `core/writer/index.ts` 读 `.llmNavigate`）；`query/reads.ts`
   **无条件**建树；且 `createKnowledgeEngine` 原本收一个 `config` 形参却**从不使用**它
   （已删死形参）。⇒ 原表写「默认 关 / `enabled: true` 启用」描述的是**一处不存在的开关**。
   本 mode 的**唯一**闸门是 `llmNavigate.enabled`。
⑤ **`kg` 不是 config 键**：它不在 `ShadowConfig` 里，只是 per-call 参数（`query/query.ts`），
   原表却把它排在「默认」列里，与真正的 config 默认值混用同一列。

### 采集与落盘

- **每回合采集四类**：入口点（真实改/读的组件，`fs/observed`，客观锚）、决策/意向（`goal/changed`）、动作（`tools/result`，背景）、交互与思维落点（`session/event` 的用户消息与 agent 结论，尽力而为）。回合结束（`agent/turn-stopping`）压成一条记忆：`<工作区>/.shadow/<日期>/<时刻>-<入口slug>.md`。
- **完整线索头（核心）**：每条记忆文件顶部带 `> 完整线索` 头，把「背景/材料」（本回合改/读过的路径 + 用户消息里引用的背景/材料，两路合并去重）+「用户提示/决策」（被分类为用户提醒/拍板的用户消息，标 `decision`/`reminder`）+「用户要点」（全部用户消息兜底，防漏记）+「概况」（动作/用户消息/决策计数）结构化列出——让一条记忆一眼能还原完整线索链。
- **说明文档 + 索引 + 意识轨迹**：`.shadow/_index.md` 讲清格式、列出近期记忆、给出「入口/主题 → 记忆文件」索引，并生成按时间的意识轨迹（可反推用户/自己的思考方向）。
- **入口语义切分 + 落盘兜底**：入口优先取语义路径（读/改文件路径的域，如 `acshModel`/`vendor/dsh-shadow`），纯工具名（`pwsh`/`edit`）不作 entry（防跨事务串线、命中错主题）；`session/flush` 收口时落盘全部 pending + pending 超 60 条异步落盘；落盘失败改 error 级 + `read_shadow` 显示「⚠ 数据不可达 / 请确认 shadowRoot 可写」（区分"数据不可达"与"召回不足"）。
- **一句话总结（增强）**：每一回合落盘后，detach 一个后台任务用 `llm.stream` 生成一两句中文摘要回填到记忆文件头（`> 摘要：…`）。纯聊天/无工具回合也能据此沉淀成可读记忆；失败/超时静默降级，不影响正文。默认路由取 `agentDefaultModel.currentSelection()`；可用 `rawConfig.summary` 配置 `{ enabled, provider, model, maxTokens, timeoutMs }`，`enabled: false` 关闭。
- **会话归属**：采集按各 session 自己的 agent 归属（`session/event` 用 `agents.get(session.id)`、`fs/observed` 优先 `actor.agent`），支持多会话/子 agent，不再一律挂到全局 initiator。
- **系统提示不泄漏**：采集时先剔除宿主注入的 `<system-reminder>`（workspace 指令 / runtime context / skill 目录 / 会话上下文）等系统级脚手架标签块（成对开闭 + 孤立残留变体），并识别无标签的裸脚手架块（以已知系统提示完整措辞开头）；纯系统消息整体跳过。这些是「系统提示 / 运行时上下文」，不是 agent 的思维/决策线索，不应写入记忆。

### 受保护契约面（Protected Contract Registry · `adr/0086`）
> **维护者面 · 人读时可整段跳过** —— 这一节回答的是「**改什么会破坏兼容性**」，不是「怎么用」。
> 守着它的门：`tools/contract-surface.selftest.ts`（冻结清单 = 工具名 / 参数名 / 配置键）；决策与八族边界见 `adr/0086`。
> **什么时候需要看**：要改工具 schema、改 `mode` 串、删/改配置键之前。日常使用不需要看。

**契约 ≠ API 清单。** 一条契约 = **Surface + Semantics + Stability + Allowed Drift + Verification**，
**十条字段缺一不得入册**（`adr/0086` §2）。本节是**登记册本身**：**每条契约 10 个字段全填**
（表 A 前五字段 / 表 B 后五字段，`id` 对齐）。**判据与理由在 `adr/0086`，清单在这里**（该 ADR §5 的分工）。
⚠ **本节不写「共 N 条」** —— 条数＝**下表行数**。v1.15.76 之前，条数被手写在文档的许多行里；而
**写下「有 N 处写了 8」这句话本身又添了几处**（**自指**：这个数在写下的瞬间就已经不对）⇒
按 `AGENTS.md`「**最好只给规则与命令、不写数**」，**条数一律删除**；要知道几条就**数表**。
⚠ **「字段已填」不等于「都已设防」** —— `verification` 一列如实写出**哪些面根本没人守**（见本节末的完成度表）。

**稳定性用内部三档**（本仓**不自造** `stable/beta/experimental` 等级 —— D8 已判：凭空造等级就是让文档比事实强）。
判据落在**「违反时的后果」**上，因为后果**可从代码核对**，成熟度不能：

| 档 | 判据 | 违反的后果 |
|---|---|---|
| **`hard`** | 使用者已依赖；改了会让**已记录的东西读不出来**或**调用失败** | 必须走弃用流程 |
| **`soft`** | 会改变可观察行为，但**不破坏数据**（派生件可整份重建 / 文本可改） | 需写 `CHANGELOG`；不需弃用窗口 |
| **`experimental`** | 无承诺 | 可随时改，但**必须就地可见地标注**（ADR-0049 同族） |

**表 A：结构与语义**（`id` / `surface` / `owner` / `semantic meaning` / `stability`）

| `id` | `surface`（**已实测**，命令：`node ../.docs/fix/2026-09-12/t15-counts-verify.ts`） | `owner`（一级模块） | `semantic meaning`（对使用者意味着什么） | `stability` |
|---|---|---|---|---|
| `tool-name-v1` | public-api · 工具名 **3**：`read_shadow` / `recall_shadow` / `shadow_query` | `index.ts`（三处 `name:`） | 工具名是**调用契约**：名字一改，已写进记忆、文档与别的会话里的调用**全部失效** | **`hard`** |
| `tool-schema-v1` | 工具 schema · 参数名 **132**（`read_shadow` **127** / `recall_shadow` **2** / `shadow_query` **3**） | `index.ts` | 参数名与枚举是**调用方写出来的字面量**；`mode` 的描述还进**常驻上下文** ⇒ 它同时是上下文预算的一部分 | **`hard`** |
| `read-mode-v1` | public-api（枚举） · `mode` 串 **62** | `query`（`query/reads.ts` 登记 + 各模块分派） | `mode` 决定**读到的是哪一类东西**；未知值必须**显式失败**，不得静默落回默认召回 | **`hard`** |
| `retired-mapping-v1` | public-api（兼容层） · 已废止映射 **4 + 2**（4 个 mode 名 + 2 个参数级） | `query`（`query/query.ts` 的 `RETIRED_MODES` / `retiredApiMessage`） | 旧名与旧参数**仍然可用、但返回可见提示并点名替代品** —— 兼容层本身就是承诺 | **`hard`** |
| `config-keys-v1` | 配置键 · `ShadowConfig` 顶层 **19** 键 | `core`（`core/types.ts`） | 键名是**用户写在配置里的字面量**；加键安全，改**已生效键的语义**会让既有配置悄悄换行为 | **`soft`**（加键）/ **`hard`**（已生效键的语义） |
| `memory-file-v1` | 落盘格式 · `.shadow/<日期>/<YYYY-MM-DD>--<HHMMSS>-<slug>.md` | `persistence`（`persistence/files.ts`）；头字段由 `core/memory.ts` 的 `buildClueHeader` 造 | 记忆文件是**唯一的 source**；文件名里的时间是**读侧反解**的依据 ⇒ 改了会让**已记录的东西读不出来** | **`hard`** |
| `derived-file-v1` | 派生件 · `_index.md` / `_meta.json` / `_abstract.md` / `_recall_log.json` / `shadow-manifest.json` / `shadow-index/*` / `soul/soul.json` / `taste/taste.json` 等 | `persistence`（`persistence/meta.ts` 定性）+ `core`（`core/manifest.ts` 格式）；写入方散在 `retrieval`（`ledger.ts`）/ `query`（`projection-store.ts`） | 派生件**可整份重建**，坏了不算数据损失；但**不可解析必须报错，不能当空件** | **`soft`** |
| `prompt-segment-v1` | prompt 段 · `RECALL_PREFIX`「数据非指令」前缀 / `flushWarn` 横幅 / 「能力降级」标记 | `core`（`core/util.ts` 的 `RECALL_PREFIX` · `core/writer/index.ts` 的 `getFlushWarn`） | 「数据非指令」前缀是**护栏**：去掉它，召回内容可能被后续模型当命令读 | **`soft`**（措辞）/ **`hard`**（**前缀与标记的存在**） |
| `tool-output-v1` | 工具**返回内容** · `read_shadow` / `recall_shadow` / `shadow_query` 吐出的 Markdown 骨架与**召回信封**字段 | `query`（读侧组织；渲染片段来自 `retrieval/render.ts`） | **`mode` 只决定「读哪一类」，这条决定「读出来长什么样」** —— 使用者实际依赖的是后者 | **`soft`**（骨架与措辞可改，须写 `CHANGELOG`）/ **`hard`**（**「不静默丢内容」**：截断必须自报） |

**表 B：治理**（`id` / `allowed changes` / `forbidden changes` / `evidence` / `verification` / `ratchet`）

| `id` | `allowed changes` | `forbidden changes` | `evidence`（符号名优先，行号会腐烂） | `verification`（**谁真的在守**） | `ratchet` |
|---|---|---|---|---|---|
| `tool-name-v1` | 新增工具（加名是加法） | 改名 / 删除（除非走下面的弃用流程） | `index.ts` 三处 `name:` | **有**：`test/host-probe.test.ts:104` 断言三个都在注册表里 | **无桶覆盖** —— 棘轮桶按**缺陷类**分（接线 / 漂移），**不按契约面分** |
| `tool-schema-v1` | 新增**可选**参数；新增枚举值 | 改名 / 删除参数；让未知枚举值落回默认 | `index.ts` 各工具的 `parameters.properties` 第一层键 | **有**：`tools/contract-surface.selftest.ts`（**冻结参数名清单**：缺名即红并点名、新增只报告；含差集判据与抽取判据的标定）+ `test/recall-envelope.test.ts:79-84`（`mode` 描述的长度 / 指针 / 关键字）。⚠ **只守「名字还在不在」** —— 参数的类型 / 枚举值 / 默认语义仍无人守 | 无桶覆盖 |
| `read-mode-v1` | 新增 mode | 删除 / 改名旧 mode；**未知 mode 静默落回默认召回** | `query/reads.ts` 的 `modes: […]` + 各模块 `MODES` / `if` | **强**：`test/recall-envelope.test.ts:104`（断言恰为 **62**）+ `:103`（`CONTEXT.md` 的表必须覆盖全部 62） | **`:103` 本身就是棘轮**：新增 mode 不写进 `CONTEXT.md` 就红 |
| `retired-mapping-v1` | 追加映射 | 移除映射；让旧名 / 旧参数静默落空 | `query/query.ts` 的 `RETIRED_MODES` / `retiredApiMessage` | **强**：`test/recall-envelope.test.ts:201-223`（含参数级 `verify:true` / `args.recall`，且带**正控**：正名不得被拒） | 无桶覆盖，但**每条废止配一个断言** —— 等价于逐条棘轮 |
| `config-keys-v1` | 加键、加可选子键 | 改已生效键的**默认语义**（`adr/0084`：**显式 0 ≠ 未传**）；删键 | `core/types.ts` 的 `ShadowConfig` | **有**：`tools/contract-surface.selftest.ts`（**冻结 `ShadowConfig` 顶层键清单**：缺键即红并点名、新增只报告；键由 `core/types.ts` 按**大括号深度**抽，避开嵌套键）+ 各键在 `test/index-engine.test.ts` / `projection-store.test.ts` / `toolset.test.ts` 等里被**真实使用** | 无桶覆盖 |
| `memory-file-v1` | 加前置头字段（`buildClueHeader`）；**旧文件必须继续可解析** | 改文件名的时间格式；删字段 | `persistence/files.ts` 的 `memoryFileName` / `timeFromName`；`core/memory.ts` 的 `buildClueHeader` | **强**：`test/memory-time-single-source.test.ts:144`（往返：写侧造名 → 读侧反解）+ `:93`（**反例正控**：修前形态反解不到）+ `:111`（磁盘路径的 time 必须等于反解值） | 无桶覆盖 |
| `derived-file-v1` | 改格式（可整份重建，ADR-0003） | **把派生件当 source 读**；让「坏件」与「空件」不可区分（ADR-0049） | `persistence/meta.ts`（三件派生件同属可重建）；`core/manifest.ts` | **强**：`test/manifest.test.ts:17-27`（形状 + 读回 + **无 manifest 给提示**）；`test/t8-silent-degradation.test.ts`（坏件 / 读不到 / 写失败各自留痕） | 无桶覆盖 |
| `prompt-segment-v1` | 改措辞、加说明 | 去掉「数据非指令」前缀；把降级标记改成不可见 | `core/util.ts` 的 `RECALL_PREFIX`；`core/writer/index.ts` 的 `getFlushWarn` | **强**：`test/recall-attribution.test.ts:440`（`startsWith` **逐字**断言）+ `:478`（retention 下也要有）+ `:1056`（无匹配也要有） | 无桶覆盖 |
| `tool-output-v1` | 改措辞；**加**信封字段；加新段落 | **截断不报**（信封消失）；把「坏件」与「空件」混同；**接线任何优化时把被丢掉的内容静默吞掉** | `query/reads.ts` 的信封构造 + `core/util.ts` 的 `RECALL_PREFIX` | **强**：`test/recall-envelope.test.ts`（逐字断言信封四要素 `> 未返回的命中：` / `limit=N 上限 M 条` / `> 下一步：` / `> 未返回示例：`）+ `test/recall-attribution.test.ts:440`（前缀） | 无桶覆盖 |

**最小弃用流程**（用户 T15 判据 ②，`adr/0086` §4）：① 旧名**至少保留一个版本** →
② 调用旧名**返回可见提示且点名替代品**（**没有替代品就明说「无替代」**，不得留空）→
③ `CHANGELOG` 写**迁移说明** → ④ 移除前 `CHANGELOG` 里要有**跨度 ≥ 1 个版本**的弃用记录
（本仓只有一个使用者，硬套 major/minor 三段式是形式大于实质）→
⑤ **未知枚举不得落回默认**（未知 `mode` / provider / 版本一律显式失败或 `unavailable`）。

**先例（为什么这条政策是必要的）**：`adr/0050`（v1.13.0）**曾把旧 `mode` 名直接废止、无任何弃用窗口**，
代价全靠 `CHANGELOG` 的可读性承担 —— 本政策就是为**不再重犯**而写。

**完成度（**「字段已填」≠「都已设防」**）**：

| 设防状态 | 契约 | 含义 |
|---|---|---|
| **有强门** | `tool-name-v1` · `read-mode-v1` · `retired-mapping-v1` · `memory-file-v1` · `derived-file-v1` · `prompt-segment-v1` · `tool-output-v1` | 有具体断言在守，改了会红（多条还带**正控**） |
| **有门（只守名字面，v1.15.83 补）** | `tool-schema-v1` · `config-keys-v1` | `tools/contract-surface.selftest.ts` 冻结**清单**：缺名即红并**点名**、新增只报告。⚠ **覆盖面就这么大** —— `tool-schema-v1` 只守参数**名**（类型 / 枚举值 / 默认语义不守）；`config-keys-v1` 只守**顶层键名**（子键不守，已生效键的默认语义归 `adr/0084`） |
| **无棘轮桶（全部契约）** | —— | 棘轮桶按**缺陷类**分（接线 / 漂移），**不按契约面分** ⇒ 契约面的守卫方式是 `verification`，不是 `ratchet`。**这是两类工具的分工，不是缺口** —— 不要为凑字段而新造桶（本仓已因「为凑形状而造东西」清理过一批）。⚠ **本行原先写「8 条」，而实测已是 9 个 `*-v1` id，且上面那条「有强门」当时漏了 `tool-output-v1`**（v1.16.0 一并修）⇒ **条数一律以本页表 A/表 B 的 `id` 为准，本行不写数** |

### 模块归属表（`| Module | Owns | Reads | Writes | Must not own |`）
> **维护者面 · 可跳** —— 它回答「**一处改动该落在哪个模块**」。
> 守着它的门：`npm run audit:layers`（方向禁令 / 无环 / 纯模块白名单），逐条判据见 `tools/audit-layers.lib.ts` 与 `adr/0086`。
> **什么时候需要看**：要新加一层、或把某段逻辑搬家之前。

**这张表是「生成」的，不是手写的**（v1.16.0 起**生成器就在本仓里**）。一级模块 **28** 个
（= 27 个目录 + `index.ts`）× 5 列 = **140** 个格子，**手写必然腐烂**，
而它的用途是「**暴露「谁开始越权」**」—— 本仓的「越权」**已有一份可执行判据**：
`tools/audit-layers.lib.ts` 的 `DIRECTION_RULES` · `FORBIDDEN_TARGETS_EVERYWHERE` · `PURE_MODULES`
（**条数以表为准，本行不抄** —— 抄一遍就会在下次加规则时腐烂）。

```powershell
node tools/module-ownership.ts   # 打印整张表 + **行数**（别在别处手写这个数）
```

> **为什么生成器回到了本仓**（v1.16.0）：它原先指向 `../.docs/fix/2026-09-12/t15-module-ownership.ts`，
> 而那个日期目录**已不在本机**（`.docs/fix/` 现存 `2026-09-14` / `-15` / `-16`），整个 `.docs` 下
> **没有任何 `t15*`** —— 于是「表是生成的」与「别在别处手写」**两条同时落空**。
> 按 `AGENTS.md` 自己的结论「**能复现的东西放 `tools/`**」，重建在 `tools/module-ownership.ts`。

**五个字段里只有两个能从代码机械推出，这里如实分开**：

| 字段 | 可机械推？ | 来源 |
|---|---|---|
| `Reads` | **可以** | 真实 import 出边（**沿用它自己的 import 图**，不是手抄） |
| `Must not own` | **可以** | `DIRECTION_RULES` / `FORBIDDEN_TARGETS_EVERYWHERE` —— **本来就有门在守**（`npm run audit:layers`） |
| `Owns` | **不可以**（语义） | 只对 ADR 已定过的层给结论，其余**标未核、不编一句** |
| `Writes` | **不可以**（副作用） | **已登记在 `derived-file-v1` / `memory-file-v1`** 两条契约里（判据收一处，不再列第二份派生件清单） |

**由 ADR 定过、可直接引用的 `Owns` 结论**：`core` 是**脊柱**（不是「纯函数层」：43 个文件里**只有 4 个**是 0 import，
且它 import `evidence`/`persistence`/`security` 与 `node:fs`）· `persistence` = **写侧** · `query` = **读侧** ·
`security/scrub.ts` = 纯模块 · `(root)`（`index.ts`）= Cordis 适配器，**任何层不得 import 它**。
依据：`tools/audit-layers.lib.ts` 文件头（T13 实测结论）。

**切片 3（`D1`/`D2`/`D3`）已判定（v1.15.74，`adr/0086` §8.9）**：
**`D1`** `ChangeSet` ⇒ **保留**（它是 `tools/audit-wiring.selftest.ts` 的**真仓库已知答案**，删它会把一条检测器变弱 ——
⚠ **这一条不能机械判**：「有没有验证价值」是主观的，**且恰好是唯一决定性的那条**）·
**`D2`** 四类漂移（名称/结构/语义/行为）各自对应登记册的 `allowed`/`forbidden`/`stability` 列，**不需要新造表** ·
**`D3`** 登记册里的契约**全是细粒度面、无一条是内部大对象** ⇒ 对内部大对象的重构是**允许的 breaking internal refactor**。
**仍未做**：没有为 `D2` 建「漂移类」的**可执行检测**（本轮只给分类的判据落点）。
**下一步（泳道 `adr/0083` §14.1）**：`T15` 与 `D1/D2/D3` 已判完 ⇒ 下一项是 **`A段`** ——
它是哪 6 条见 `adr/0086` §8.10；其中 #3/#4/#5 曾卡在同一个登记册缺口上（§8.11），
**v1.15.77 已补齐该契约并入册 `tool-output-v1` ⇒ 三条随之得判**（§8.12）：
三条**都允许接线**（属 `tool-output-v1` 的 `soft` 半边，须写 `CHANGELOG`），
其中 #4/#5 折叠掉的内容**必须由信封披露**（否则违反该契约的 `hard` 半边）。
#6 **归 `T7`**。#1/#2 判为不涉及兼容性（删或补棘轮 / 收敛成一份），**尚未动手**。
**没有生产消费者**：⚠ 这句说的是**这份登记册本身**（**没有代码读它**）—— **不是**说登记册里的面没人用
（`config-keys-v1` 的键**就被消费**）。说清楚免得它变成本仓清理过的那类「写好了但从不执行」的东西。
### 读取（`read_shadow`，可穿透）

- 无参数返回 `_index.md`（目录）；带 `topic`/`entry` 按主题穿透到具体记忆文件。穿透按**分层召回**：按「入口/主题标签 → 路径 → 正文 + 时间衰减」打分排序，在 token 预算内按深度返回——高分记忆给「摘要 + 命中片段 + 正文骨架」，低分只给「路径 + 摘要」；`max_tokens` 控制预算（默认 1600）。**无参读索引也走同一份预算**（v1.15.85）：超预算时按 `## ` 段整段装、**不腰斩行内**，并按**段名 + 行数**披露「未返回的段 / 部分返回的段」+ 三条下一步（穿透 / 提高 `max_tokens` / 直接读文件）；**装得下则逐字原样、零多余文字**。⛔ 由来是实测：本机 `.shadow/_index.md` = **2 251 348 字节 / 24 639 行**（8310 条记忆 / 7 个日期目录），而此前无参路径**整篇原样返回**（`adr/0088`）。借鉴 OpenViking 的 L0/L1/L2 分层思想，但**不引入向量库**（见 ADR-0001）。
- **冷热淘汰（默认关，显式开启）**：`rawConfig.recall.cooldownTurns = 5` 时，`.shadow/_recall_log.json` 记录「带内容」发过的路径，N 回合内不重复返回；纯 URI 不带内容则不冷却。写失败降级为「不去重」，且**读侧横幅披露**（T8 第 5 条，v1.15.65：台账读不到 / 坏件 / 写失败各自留痕）。
- **语义召回（B 档，默认关）**：`read_shadow(topic)` 默认走加权关键词召回（A 档，无外部依赖）。要更接近语义，配置 `rawConfig.recall = { enabled, provider, model, maxTokens, timeoutMs }`——`enabled: true` 且给了 `provider/model` 时，先用 `llm.stream` 扩展几个相关检索词，再打分召回；失败/未配置时退回 A 档并**在读侧横幅披露**（T8 第 3 条，v1.15.65；修前是**静默**的 —— 这条此前由本文档自己承认）。
- **Memory Debugger**：`read_shadow(topic, { debug: true })`（或 `recall.debug: true`，默认关）返回召回管线 trace——`候选 → 命中(打分>0) → 冷却 → 预算 → 返回` 计数 + 每条召回「为什么命中（入口/主题/路径/正文打分拆解）/为什么被降权(cooldown/deprioritize)/状态」。默认路径不变。
- **召回信封（截断不静默）**：借 PageIndex「成功/失败都返回带下一步的信封」——预算/`limit`/冷却砍掉的命中会在结果末尾**自报家门**（`未返回的命中：N 条（命中 M · 本次返回 K）· 原因分解 · 示例入口 · 下一步`，**N 恒等于 M − K**，冷却也计入），空命中不再是一句死路，而是给「换词/看索引/`shadow_query`/`recall_shadow`」四条可执行下一步 + **近似候选（显式标「未验证」）**；命中全在冷却时给的是「冷却中的命中（是命中，不是近似）」+ 冷却专属下一步。全部返回时不加任何多余文字。**已知边界**：信封本身不计入 `max_tokens` 预算，所以带信封的输出会比 `max_tokens` 多出这几行（换取「不静默丢」）。
- **分层省略披露（可关，默认为开）**：预算/档位把某条降到「只给摘要」时，结果里会多两行 —— `> 分层省略：本次返回 N 条里有 M 条**只给了摘要**（片段/正文被档位或预算省略）—— 这与「该条本来就没有更多内容」不同` + `> 可复取：<句柄>`（句柄 = `.shadow/<日期>/<文件>.md#<入口>`：本仓**权威源就是文件** ⇒ 零新增存储）。**关掉**：`rawConfig.recall.lossDisclosure = false`（只省那两行，**返回的条目一字不变**）。判据与口径见 `adr/0090` 甲-1 与 `adr/0092`。
- **读侧输出保留换行（v1.12.7 根因修复）**：`scrubFinal` 原先整篇套 `scrubUnsafe`（剔 `\u0000-\u001f`，连 `\t\n\r` 一起剔）→ 所有读侧 Markdown 被压成一行；现改用 `scrubUnsafeDoc`（保留 `\t\n\r`，仍剔其余控制符/双向覆盖符）。注入短语与 HTML 标签仍被剥离，「数据非指令」前缀不变。

### Shadow Query Observatory（Phase 1A.5）

- **目的**：先跑真实查询数据，**不急着定型 nodes 结构**。在 `shadow_query`（`mode:"query"`）**旁路记录观测**——写 `.shadow/query-log/<date>.jsonl`，每条含 `date/ts/query/scope/limit/candidateNodes/returnedNodes/evidenceCount/evidenceNodes/relationCount/relationNodes/nodeTypes/nodeTitles/latencyMs`（query/title 轻量 scrub：密钥打码 + 剔控制/双向字符）。
- **只读汇总**：`read_shadow({ mode: "query-log" })` 给出命中/证据/关系/类型/scope 分布 + **重复查询的 Node 稳定性**（同一查询 nodeTitles 是否一致，答"Node 是否稳定"；漂移则列出该查询的不同结果集数）。
- **边界（Shadow Contract）**：观测是**系统派生记录**（`rm -rf .shadow/query-log` 不影响任何 Atom）；只在 `shadow_query` 入口打点，**不进 derive 真相路径**；**写失败不改变 query 返回值**，但**不再静默**（留痕 → 读侧横幅，带真实原因；`v1.15.94` 起 `{ok, reason?}`）；**默认开启**（`config.queryLog.enabled=false` 才关）。
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

- **记忆遗忘（retention，**v1.15.85 起默认开**）**：默认即开（写 `rawConfig.retention = { enabled: false }` 关；`{ halfLifeDays: 7 }` 调半衰期）；开时 `.shadow/_meta.json` 记录每条记忆的 `created/hits/status/confidence/pinned`；召回用 **hotness**（命中数 × 半衰期衰减）加权（替换旧的「21 天归零」线性衰减），并把 `status: stale/superseded/archived` 的记忆**默认排除**。这是「记忆+遗忘=高效」的落地（借鉴 **MemoryBank** 衰减 —— Ebbinghaus 遗忘曲线按回忆时间与频率衰减，[arXiv:2305.10250](https://arxiv.org/abs/2305.10250) / A-MEM 动态合并 / MemGPT archival）。**两处勘误**：① **（ADR-0065）** 本行曾把 hotness 标成「OpenViking 式」——**标错了**，在 OpenViking 官方 README 与 Context Layers / Retrieval 两份文档里 `decay`/`hotness`/`half-life`/`reinforce`/`recency` **全部 0 命中**，真实出处是同一句里本来就引了的 **MemoryBank**；② **（ADR-0066 / 待办 D4）** 本行曾写「`pinned` 永存」——**该状态不可达**：生产只写 `pinned: false`，`pinned: true` 全仓零处，故「永存」这条路径**当前走不到**。真正的保留语义由 `status` 与 `hits` 派生（见下行）。
- **记忆生命周期（deriveLifecycle）**：从 `_meta.json` 信号**派生状态机**——`NEW → OBSERVED → VERIFIED → TRUSTED → STALE/DECAYING → SUPERSEDED`。触发信号：独立 session 确认（`confirmedBy`）、命中次数、新鲜度、冲突。召回 provenance + debug 暴露 `生命周期 <态>`。**可达性（ADR-0063 分诊 / 待办 D4 已决策为「纠正文档」）**：状态机里 **`TRUSTED`（经 `pinned`）与 `ARCHIVED` 两态当前不可达** —— `pinned: true` 与 `status: "archived"` 在**生产中都没有写入者**（生产只写 `pinned: false`）。**不补写入口**：那会把外部权威状态落进可重建的 `_meta.json`，与 ADR-0003 冲突；若将来确实需要「人工钉住/归档」，须先起 ADR 论证状态落在 **source** 层。**另一处口径不一致**：`lifecycleOf` 的两条最前置判断读的是**写侧** `rec.status`/`rec.pinned`，而 `MEMORY.md` 声明的口径是「纯按信号派生、不做写侧硬状态迁移」（已在 `MEMORY.md` 就地加勘误）。
- **冲突检测**：召回时校验每条记忆的**证据路径在当前工作区是否存在** → 缺失即**降权 + 标记 stale**，provenance 暴露 `(⚠证据缺N)` + `生命周期 STALE`（"capture handler 已不存在"类过时）。证据存在则无冲突；无法判定时视为存在（避免误伤非代码路径）。

### 证据链与 Memory≠Evidence

- **证据链（provenance）**：每条记忆文件线索头自带 `> 证据链：来源(种类)·日期·证据(路径)`；`read_shadow` 召回每条紧跟一行可解释 provenance——`来源·日期·状态(active/stale)·命中次数·置信·证据路径`。置信度**从可验证信号派生**（命中次数、状态、新鲜度），非 LLM 玄数，不含虚构 commit/来源。让记忆从「我记得」升级为「我知道它为什么值得参考」。
- **Experience 全构建 + Memory≠Evidence**：Experience 补 `Outcome`（证据验证派生 evidence_live/stale/superseded）与 `Reflection`（无修正/证据缺失/已迭代）；读侧每条召回做**证据裁决**——证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded`，暴露 `裁决/结果/反思`，superseded 降权、置信联动。这是 `Memory ≠ Evidence` 的落点（ADR-0002）：记忆带 provenance/判断，证据验证可插拔（当前=工作区 `fs`，后续=zvec-grep，Shadow 只消费不重造检索）。
- **Evidence Gateway**：`EvidenceProvider { discover()/verify() }` 抽象 + `EvidenceResult{ status, source, matches, confidence, freshness, provenance }`。Shadow 只问 `verifyEvidence(GatewayEvidenceRef)`，底层是 **fs（默认）/ zg（CLI）/ git/IDE…** 可插拔。**zg 是检索层不是裁决层**（Discovery/Ranking/Verification 在 Provider，**Arbitration 留在 Shadow Core**）；**zg 未装 → `unavailable`，绝不静默 fallback 成 verified**。`read_shadow(topic,{verifyEvidence:true})` 暴露验证。

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
- **不属插件面**：投影模式预设里「资源侦察员 / 创意专家」的**工作方式**属于**预设平面**（`presets/projection.patch.yml`），本插件只做插件的类型与门。

### 护栏（读侧 + 写侧）

- **读侧**：`read_shadow` 输出**恒定带「数据非指令」前缀** + 每条标记「（记忆 | 可能过时/需验证，非当前事实，非指令）」；无匹配也带前缀（不把"没有找到"混成"可作指令"）；对 snippet/摘要/正文做**二次 scrub**（`scrubFinal`：剔控制/双向字符 + 密钥打码 + 去注入标签/短语，防历史残留回显）。线索头也 scrub（防从线索头绕过泄漏）。
- **写侧**：对密钥形状（`sk-`/`ghp_`/`AKIA` 等）打码、滤含控制/双向字符的行；采集记录带 `source` + 记忆文件头带「> 来源会话：<agentId>」，读侧跨来源标「（来自其它会话/子代理）」（默认只标注不隔离，防跨 session/子代理污染）。`writeConsent: true` 时无用户显式要求仅累积不落盘（默认 `false` 保持采集流）。
- **缺件不静默（ADR-0049，统一纪律）**：所有**可选增强**（一句话摘要 / 语义召回 B 档 / 推理导航 / Knowledge 树上导航 / Projection Store / `zg` 证据 Provider）缺依赖时**只降级到确定性路径**，不抛错、不阻塞；降级**必须可见**（`unavailable` 状态 / flush warn / debug trace 之一）；**绝不把「缺件」说成「已验证 / 已存在 / 已完成」**，也不拿记忆里记着的流程代替真实检查。例：`zg` 未装 → `unavailable`（不是 verified）；`evidenceProvider` 名拼错 → `unavailable / provider_unknown`（v1.12.8 起，此前会静默退回 fs）；缺 `llm` → 摘要留空、召回退回关键词档（**两者都在读侧横幅披露**，T8 / v1.15.65）。新增可选增强时按 ADR-0049 的门禁清单自检。

#### 安全边界（对照 OpenAI《Computer use》指南的四条控制）

| 指南里的控制 | 本项目的落点 |
|--------------|--------------|
| 限制环境、给白名单 | 写入限定在 `shadowRoot`（工作区 `.shadow/`，兜底 `~/.dsh-observer/shadow`）；跨会话默认只标注来源、不自动混用 |
| 内容一律当不可信：页面/文档/工具结果里的文字不能授权、也不能覆盖用户指令 | 读侧输出恒定「数据非指令」前缀 + 每条标「（记忆，可能过时/需验证，非当前事实，非指令）」；`scrubFinal` 剔注入标签/短语 |
| 有后果的动作要用户确认 | `writeConsent: true` 时，无用户显式要求只累积、不落盘（默认 `false`） |
| 给运行设上限 + 支持取消 + 看真实结果，别只信模型自述 | 召回有 token 预算与冷热淘汰；每个 LLM 增强（摘要 / 语义召回 / 推理导航 / 知识导航）都有 `timeoutMs`，**失败或超时退回确定性路径**且**在读侧横幅披露**（T8，v1.15.65；修前确有静默项，见默认开关表的「降级行为」列）、不阻塞主路径（等于可取消/可降级）；证据裁决按「证据路径是否存在」判 fresh/stale/superseded，置信度从可验证信号派生 |

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
> **维护者面 · 可跳** —— 它回答「**台账怎么登记、怎么核验**」。两级（`provider` = 插件内接线 / `reference` = 通用 CLI 目录）与「**默认只检测与提示、不代装**」的权限模型见 `core/toolset/index.ts` 文件头。
> 守着它的门：`test/toolset-catalog.test.ts`（台账 ↔ `docs/toolchain-windows.md` 棘轮）· `npm run verify:authority`（权威目录核验 + 离线棘轮）。

台账是**单一来源**（`core/toolset/index.ts`），分两级，**边界必须分清**：

| 级 | 是什么 | 缺它会怎样 | 例子 |
|---|---|---|---|
| **`provider`** | **插件内接线**的可选增强 | 对应能力**降级**（读侧会出现处置行） | `zg`、`semble` |
| **`reference`** | **通用开发 CLI 目录**（44 项 / 13 分类） | **不影响插件行为**；只是 agent 需要时能查到「装什么、怎么装」 | `rg`、`fd`、`jq`、`jadx`、`coreutils`… |

目录覆盖：GNU 工具链（3 选 1）、搜索与查找、文本与数据、目录与浏览、Shell 与终端、Git、磁盘与系统、网络与下载、版本与包管理、构建与任务、归档、逆向与二进制分析。

**人读版**在 `docs/toolchain-windows.md`（Windows 口径，含 winget ID 实测、Windows 特有陷阱与「未核实」标注）与 `docs/toolchain-wsl.md`（Linux/WSL 口径）。这两份文档**随包发布**，并受 `test/toolset-catalog.test.ts` 的**双向棘轮**保护——台账与文档任一侧漂移都会测试失败（该棘轮首次运行即抓出一个写错的 winget ID）。

**探测的两条诚实纪律**：
- **探测失败只说「未检出」，不说「未装」**（探测方式可能不适用，如该工具没有版本旗标）；
- 宿主进程的 **PATH 是启动时快照**——宿主起来之后装的工具，要**重启宿主**才可见。


## 兼容性（验证基线）

| 项 | 值 |
|---|---|
| 验证基线 | **DSH `0.1.7-alpha.2`**（在这一版上验证并运行） |
| 声明 | `package.json` → `engines.dsh: ">=0.1.7-alpha.2"` |
| 更早版本 | **未经验证，不承诺可用** |

**这是一句「验证基线」声明，不是强制闸门。** 宿主与 pnpm 目前都不读 `engines.dsh`（对 `@deepseek-ai/*` 全量编译产物检索 `engines`：**无任何代码读取**，仅散文注释提及；`dsh plugin` 只转发 pnpm，并按「装了什么」同步 bundles 层），所以它拦不住低版本 DSH。**能观测到的防线是能力探测**——它只**报告**、不拦截：插件探测自己需要的宿主接口，缺哪个就报哪个：

| 档位 | 缺什么 | 表现 |
|---|---|---|
| 硬依赖 | `ctx.on` / `ctx.inject` / `ctx.get` / `fs` / `tools` | 控制台 **error**，写出缺哪一项、影响什么 |
| 可选依赖 | `llm` / `agents` / `agentDefaultModel` / `systemPrompt` | 控制台**一条 warn**，说明降级了哪项能力 |

探测**不放在 `apply()`、也不放在 `inject` 回调**：Cordis 的服务是异步挂载的，`apply()` 时可能尚未 provide（会误报）；而 `ctx.inject(deps, cb)` **只在依赖就绪时才回调** —— 依赖缺失时回调根本不执行，把「缺 X」写进去等于「缺了就不报」（v1.15.3 修正的正是这一点）。故服务面检查**统一在首个 `agent/turn-stopping`**（此时宿主已完全挂载，且只报一次）。

**为什么基线从 `0.1.5-rc.1` 抬到 `0.1.7-alpha.1`、又随 `v1.20.1` 抬到 `0.1.7-alpha.2`（ADR-0098）**：抬升的**唯一**理由是**预设形态**。0.1.7 起 agent 预设只能是 `@deepseek-ai/dsh-agent-preset` 声明行（随 bundle 的 `dsh.bundle.patch` **数组**发布），旧的 `$DSH_HOME/.agent-presets/<id>/` 目录**没有任何读取者**（官方 shipped skill 原文 *Nothing reads that directory any more*）⇒ 随包预设的形态迁移是**单向门**，迁过去之后 ≤0.1.6 不再认它。**插件体本身没坏**——实测（对 0.1.5-rc.2 与 0.1.7-alpha.1 的 `.d.ts` 逐文件比对）：`dsh-goal` 逐字未变；`user/message` / `assistant/message` 事件形状未变（新增的 `developer/message` 被 `core/collect.ts` 直接忽略）；`fs` 只**新增** `watch`；`systemPrompt.context({name,order,text})` 未变；`session.header.cwd` 仍在。所以这是一次**声明上的硬切**，不是插件面破坏。完整证据与隔离实测见 `adr/0098`。


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

然后在一个新会话里做几次工具调用，检查 `<工作区>/.shadow/` 是否出现「每条记忆一个文件」，并确认 `read_shadow` 出现在工具列表；`.shadow/_index.md` 是否生成索引。


## 目录位置

`<工作区>/.shadow/<日期>/<时刻>-<主题slug>.md`。Observer Projection 存储根 = **`<工作区>/.shadow/`**（点开头，`SHADOW_ROOT` 常量）。工作区取 `agent.session.header.cwd`（配置 `shadowRoot` 可覆盖）。解析优先级：显式 `shadowRoot`/`projectRoot` → session cwd → **兜底 `~/.dsh-observer/shadow`**（全球 Observer Continuity Shadow 根；仅当连 cwd 都解析不出时，保证可写而非静默不写；**不与 Workspace Memory 混合**，见 ADR-0036）。三者分层：`.shadow/`=Observer Projection、`.dsh-shadow/`=Workspace World Shadow、`~/.dsh-observer/`=Global Observer Continuity。


## 投影模式（DSH agent 预设，生产包构成）

`dsh-shadow` 插件本身经 bundle patch 在 **host 常开**。若要给会话一个"投影模式"的人格/纪律，可选用 DSH agent 预设 **`投影模式`**（id `projection`），**随本包入库**（`presets/projection.patch.yml`）：

- 包内位置：`presets/projection.patch.yml`（`@deepseek-ai/dsh-agent-preset` 声明行）+ `presets/README.md`，是**生产包构成**，随包发布。`package.json` → `dsh.bundle.patch` 是**数组**：`./cordis.patch.yml`（插件行）+ `./presets/projection.patch.yml`（预设声明行）。
- 内容：**0.1.7 shipped `standard` 预设的忠实副本** + persona 改为"投影模式"（唯二的两处有意偏差：persona 文本、delegation 组不含任何委派行）——agent 是独立思维意识体、思维/决策主动沉淀进 `shadow`，缺上下文先 `read_shadow` / `recall_shadow`（内部 `mode:recovery`，勿自造 `mode:recall`）；**并自带「按任务类型派子代理专家」的工作方式**（v1.12.9 立、**v1.13.2 补"编排者与专家不重做同一件事"**：① 先分活（不值得派的自己做、不许先做出成果再派）→ ② 准确激活专家 → ③ 提示词七要素（同一段原文只进一个专家的提示词，审查等要独立判断的场景例外）→ ④ **只验一错就要返工的那几条、其余按未复核处理并列出**（原「逐条复核」已废止）→ ⑤ 并行/扇出；完整版见用户级规则 `moe-subagent-dispatch`）；**v1.15.4 起派活改为「team 优先」**（**v1.15.11 修正为「复用优先」**）：默认先判该不该派，该派时**按复用次数选机制**——**会复用 ≥2 次**（或需要共享任务板）才用官方 Agent Teams（具名 teammate、共享任务板用 revision 做 compare-and-set 协调），**只用一次就自己做**（本预设已无 `subagent` / `subagent_fork` 行）——「优先 Team」只在复用成立；**只用一次就自己做**（用一次时 teammate 那份固定开销 —— `team:policy` + 9 个工具 schema，**每成员每请求** —— 是白付的；0.1.7 起本组合里**没有 `subagent` 可回落**）。**teammate 名额是会话终身累计、上限 8（随 profile 层 bundle 出厂值；本部署不再 override，v1.20.3 / ADR-0099）、不可释放、失败的创建也占名额**；往返纪律：**一次委派一条消息、最多 2 轮、避免 inactive 冷恢复**；名额耗尽不是死路（自己做 / `workflow` 扇出——后者不吃名额）。**⑥ 契约与根因卫生**（v1.13.1：根因三部曲、禁止生造词、结论进 shadow/项目文档（对应全局 memory 存档）、交手前/改口径后四查——强化 `~/.agents/AGENTS.md`，非全文拷贝）与 **⑦ 创意与资源**（v1.14.1：先派资源侦察员——查资源库（`shadow_query` 带 `scope:["resource"]`，命中跳过外搜）→ 八类词 + 反向词（每类 ≤5、两轮无新资源即停）→ 评价 → 写卡进 `.shadow/resources/<名字>.md`；再派创意专家——只发散、不检索；卡片必须有 `source` 才进认知查询，`启发度` 要有引用证据）。
- **安装到 DSH**：**装包即装预设** —— `dsh plugin --profile <p> add dsh-shadow`（bundle 自带的两个 patch 一起生效），不再需要复制目录。**Teams 不在本预设里**：0.1.7 起它由 profile 层的 `@deepseek-ai/dsh-experimental-agent-team-profile` bundle 提供（它插 `agent-team` / `tool-agent-team` / `ui-agent-team`，并自己 disable `tool-subagent*`）；不装该 bundle 时预设仍报挂载成功、但 9 个 Team 工具**静默不出现**——这是 ADR-0049「缺件不静默」的已知例外。**名额上限本部署不再自行设置**（随 bundle 出厂值 `maxMembers: 8`；v1.20.3 / ADR-0099 撤回了原先压到 4 的 override，理由见该 ADR §3.1）；要改就在 profile 的 `cordis.patch.yml` 里**按 id** override `agent-team`，且**必须重述该行全部 config 键**（patch 替换整份 `config`）。细节见预设 README。
- 校验：经 `agentPresets.standingKeyFor('projection')` 挂载校验通过；改动后按 `copy → standingKeyFor(新 id) → remove` 做一次**全新挂载校验**（`projection` 已挂载时 `standingKeyFor` 返回既有世代，不会重读文件）。
- **描述前置 + persona 的 Team 纪律（v1.20.4 / v1.20.5）**：预设选择器的卡片把描述**截到 4 行**（约 90 字）⇒ 「Agent Teams」必须落在前置窗口（用户 2026-09-23 报「文件里有、界面看不见」）。v1.20.4 把 Teams 前置并补 persona ⑤ 的 `team:policy` 口径；**v1.20.5 再把卡片文案压成短句**（`**委派只走 Agent Teams**`，细节见人格），门 ④a 只钉前 90 字含 Teams。persona ⑤ 仍带：**只有用户显式要求才建 teammate**、写作用域**互不重叠**、`blocked_by`、任务板 **list → get → claim → complete**、**任务就绪不会唤醒 owner**、`FS_STALE_VERSION` 重读 + rebase。由 `test/preset-projection.test.ts` **④** 锁住。
- **本机遗留部署副本已退役（v1.20.4）**：`~/.dsh/.agent-presets/projection/`（旧形态 `preset.yml` + `agent.cordis.yml`）里仍写着「上限 **4** / 只用一次用 `subagent` / 前置挂 `dsh-experimental-agent-team@0.1.5-rc.1`」。0.1.7 对该目录**没有任何读取者**（在装着的 `@deepseek-ai/*` 包体里 grep `\.agent-presets` **0 命中**）⇒ 已备份为 `projection.bak-<时间戳>/` 后删除；冻结的旧描述（写着一个已撤回的上限与一条已不存在的降级路径）比没有副本更误导。
- 注意：预设引用 DSH 标准内置插件（`@deepseek-ai/dsh-*`）与 `{{model}}/{{cwd}}` 模板变量，不依赖用户机器专属配置；`dsh-shadow` 本身在 host 常开，预设只在 persona 里指引 agent 使用 `read_shadow`。


## 版本 / 变更

> 完整变更历史（按版本，含每个版本的决策/边界/验证记录）见 [CHANGELOG.md](./CHANGELOG.md)。
> **尚未完成的事项（阻塞项 / 待分诊 / 待决策 / 未验证 / 已知空白）见 [BACKLOG.md](./BACKLOG.md)** ——
> 那是待办的唯一台账，每条带「依据 / 为什么没做 / 完成判据」，与 CHANGELOG 的「已做」互补。

**当前版本：`v1.20.11`**（第四伞 `selfhood` + build 前 clean —— 见 [`CHANGELOG.md`](./CHANGELOG.md)）—— **完整变更历史见 [`CHANGELOG.md`](./CHANGELOG.md)**（历史只写一处：本文件不再保留版本历史表）。

