# CONTEXT.md — dsh-shadow 术语表

> 只放术语表，不放实现细节。术语定下来就更新。

## 核心目的（最重要）

dsh-shadow 存在的意义：**为每个已完成的任务记录「完整线索链」**——这个任务**靠什么重要的背景/材料**、**用户交互中提醒的注意事项/决策**，agent 才得以完成它。要点是把「为什么、靠什么、怎么完成的」整条线索记下来，**完整线索 > 零散事件**。记忆不是为了记动作日志，而是为了让你（未来的自己 / 另一个 agent）能**还原一个任务到底是建立在什么之上完成的**。

**任务报告（用户 2026-09-05 定）**：用户需要任务报告时，默认用 `html-report` 技能出 **HTML 格式**，且要**写全**——所有**线索/背景**、**修改的部分**、**原因**、**代码/文件修改的解释**、以及**其他能想到的方向**（取舍/风险/验证/遗留/下一步），让读者**不看代码也能明白整个任务靠什么线索、改了什么、为什么、怎么验证的**。报告即「完整线索」的呈现。

| 术语 | 规范定义 |
|------|----------|
| 投影 | agent 的「思维/上下文/灵魂」落到文件系统上的具象化，即记忆树 `.shadow/` |
| 一条记忆 = 一个文件 | 记忆的落盘形态：`.shadow/<日期>/<时刻>-<入口slug>.md` |
| 记忆树 | 投影所在的目录，即 `.shadow/` |
| 记忆 | 一个「交互 + 决策 + 思维落点 + 所用背景/材料 + 用户提示」压成的投影文件，含入口点、时间、决定/结论、动作背景——目标是还原该任务的**完整线索** |
| 交互 | 用户 ↔ agent 的来与去：用户说了什么、agent 答/做了什么 |
| 决策 | agent 的选择/承诺/阻塞，主要取自 goal 变更（创建/完成/阻塞）与计划模式 |
| 思维落点 | agent 表达出来的分析/结论（不是内部推理全过程） |
| 背景/材料 | 完成任务所依据的重要上下文：引用的文档/术语/规则/repo/论文/数据等（"靠什么完成的"） |
| 用户提示/决策 | 用户交互中提醒的注意事项、纠偏、拍板或方向（"用户怎么把 agent 带到完成的"） |
| 完整线索 | 一条记忆要能连起来：任务（入口点）→ 背景/材料 + 用户提示/决策 → agent 的动作/结论 → 完成——「完整线索」是 dsh-shadow 最重要的产出 |
| 入口点 | 用户消息里指向的项目文件夹/文件/主题；是"用户在干什么"的钥匙，也是记忆的主题键 |
| 意识轨迹 | 把入口点按时间串起来的序列，可反推用户意识发展的状态与方向 |
| 方向 | 主线：意识轨迹上"最近在往哪个主题/方向走"的推断 |
| 说明文档 | `.shadow/_index.md`：讲清格式、列出近期记忆，带主题索引 + 意识轨迹 |
| 目录 | `_index.md` 中「近期记忆 + 主题索引 + 意识轨迹」的概览层 |
| 关键入口 | agent 补上下文的切入点，即提示词指针 + `read_shadow` 工具 |
| Episode | 把 Event/Turn 级记忆原子按「项目/会话 + 时间间隔」串成的**连续任务关系层**（`{background, objectiveRef, memoryRefs[], decisionRefs[], actionRefs[], resultRefs[], startedAt, endedAt}`）；**派生式、纯读**，`mode:"episode"` 展开 |
| Decision Lineage | 把「决策」从 `概况：N 决策` 统计字段提升为**可追踪血缘**（goal 事件 + 用户拍板，按入口聚合）；`mode:"decision"` 展开。`决策 ≠ 目标`：目标（goal）是任务客观对象，不算决策 |
| DecisionEvent（v1.1.1） | **发生了"一个决定"**：`{actor, statement, source, at, lineage{contextRefs, evidenceRefs, reasonRefs}}`——决策作为一等事件进入 Memory（`> 决策：〔source〕statement`） |
| DecisionReason（v1.1.1） | **决定时明确表达的理由**（`> 决策理由：〔source〕reason`）；只在原文明确存在时挂，**绝不 LLM 补写**（Evidence≠Interpretation）。有 Decision ≠ 一定有 Reason，缺则显示「未明确」 |
| Confirmation（v1.1.1） | 纯确认（好/可以/行/ok/嗯），**不是 Decision**——`classifyUser` 单独归类，避免"好/可以"误判为拍板 |
| DecisionClass（v1.1.2） | 明确决策细分为三类：`selection`（选择/删除/保留/采用 X）、`scope`（范围/聚焦，如"资产同步"）、`anchor`（锚点/定位，如"…这是 openapi 的 U8 工作区"）——真实用户"关键决策"常为短促的范围/锚点声明，旧判定（只认选择动词）会漏 |
| Memory Atom | 最小不可变事件投影（即每条记忆文件，200–1000 bytes）；Episode/Decision 在其上派生，不改写它 |
| 遗忘（v1.2.0） | 把低价值/旧/已归档记忆**移出「活跃」扫描集**（索引+召回），文件保留（**Forget≠Delete**，ADR-0031）。`forget:{enabled,staleDays,minHits,maxActive}`；默认关。目的是封顶热集大小（性能），不破坏可追溯性 |
| 增量索引（v1.2.0） | 进程内 `indexCache` 缓存已 parse 的记忆（entry/topics/parsed），冷启动读一次、之后 flush 只增量增补并**由缓存生成 `_index.md`**，避免每回合全量顺序重读所有文件（性能热路径根因） |
| 收口归档（v1.2.2，compact） | 对齐参考"会话级聚合+只留摘要+原始归档"：一个 episode 结束时把其 turn 原子**合并成 1 个 consolidated 文件**（保留决策/动作/材料/结果），个体原子 mark `compacted` 并移出活跃热集（文件保留可回放，Forget≠Delete）。活跃树"每 turn 一文件"→"每 episode 一 consolidated 文件"，热集文件数大降。**Episode=投影非事实；Replay 必须活过收口**（ADR-0038） |
| Task（v1.3.0，ADR-0039 实现） | **任务生命周期一等视图**（`mode:"task"` 派生）：`{title, trigger, objective, constraints[], status:active|completed|abandoned, 决策链, 观测结果, 证据}`；objective ≠ identity。解决"为什么任务开始/什么条件算完成/哪些决策改变方向/哪些结果影响后续"。**Task 是读侧派生的投影，非写侧事实源**（ADR-0038/0039） |
| Event（ADR-0039） | **最底层不可变事实**：`{id, timestamp, type, source, content, evidence}`；Memory Atom（事实层）是其文件化载体。**Event ≠ Summary**（摘要/投影不覆盖事实） |
| ObservedOutcome（v1.3.0，ADR-0039） | **只记观察结果**（`{event, observation, evidenceRef}`），**禁 Success/Failure**；`测试通过 ≠ 方案正确`。mode:"task" 的"观测结果（非成/败判断）"即其呈现 |
| 启发式状态（v1.3.0） | Task 的 `active/completed/abandoned` 是**启发式观测**（由"完成/通过/放弃"等信号派生），**不是"方案正确/已确认"判断**（呼应 ADR-0037/0039） |
| ContextReference（v1.4.0，ADR-0040 实现） | `{subject, value, source: MemoryAtom[], status: validated\|stale\|unknown}`——**不是 Memory**（Memory=曾经观察到；ContextReference=**当前是否还能用**）。答"以前知道的东西现在还能不能作为行动依据"。P0 Candidate+Revalidate（fs 复核）/ P1 Evidence Pointer / P2 Transformation Trace（`Mapping≠Source Fact`，如 `D:\ → /mnt/d/`） |
| 记忆恢复（v1.5.0，recall_shadow；v1.13.0 正名 `mode:"recovery"`） | **人类友好统一入口**：一句自然查询 → **Task Recovery Bundle**（任务/状态/启发式观测/关键决定(含理由)/证据(当前是否有效)/观测结果/当前注意/未明确理由决策）。内容全来自派生数据，**不 LLM 补写 Reason/事实/判断**；LLM 只在意图/排序参与（确定性评分默认）。底层合成 read_shadow 的 episode/decision/task/context。**废止** `mode:"recall"`（与 Recall Continuity / 主题召回撞名，见 ADR-0050） |
| Active Context（v1.5.1） | 恢复包里的"**现在继续要记住什么**"段：`已完成/已决定`/`未完成待厘清`/`约束`/`最近决策`/`入口位置`——**全部派生**（Decision/Outcome/未明确理由决策/Constraint/任务状态/入口），**不是建议、不是推理、只是恢复**，不 LLM 生成。补上 Cursor 式"Continue where you left off" |
| LLM 推理导航（v1.6，llmRecall） | `recall_shadow` 的 **LLM 选中任务**（意图识别+排序）：给候选任务列表，LLM **只输出编号**；Bundle 内容仍全派生。**LLM 只做导航/选择（Context Planning）**，不补 Reason/事实/判断；关/失败回退确定性 `bestTask`。取舍对应 PageIndex（`similarity≠relevance，relevance 需 reasoning`） |
| Shadow Knowledge Graph（提议，ADR-0042，未实现） | 把 **zg（Index Engine，代码/工作区索引）** 与 **PageIndex（Document Tree Model，文档理解）** **移植进 shadow 内部**（非外部插件），统一 `ShadowNode{id,type:memory|code|document|decision|concept,content,relations:depends|references|caused_by|implements,index:keyword|tree|vector}`（v1.14.0 实现侧另有 `resource`，见「resource 节点」）——三大 Engine：Memory(经历)/Index(代码搜索)/Knowledge(文档理解)。目标是 **Agent Cognitive Layer**（认知层）。**边界**：Memory Atom=source、Node 为派生投影、relations 只派生不 LLM 创造、index 为可重建派生索引、经验闭环（搜索→理解→修改→总结→下次用）、每次查询可指证据来源 |
| Shadow Contract（提议，ADR-0043，未实现） | **身份边界**：`Atom=source(仅 human/code/tool)` / `Projection=system generated 可重建(如 shadow-index/nodes.jsonl, rm -rf 无影响)` / `Evidence=所有结果可追溯(带 evidence 指向 Atom, 无证据不返回)` / `Mutation(谁写):Source=human/code/tool, Projection=system, LLM=read+summarize 永不 create fact/关系`。定位=`文件事实系统+派生索引系统+上下文组装系统`，**不是**知识库/RAG/向量库。relations 只从可观察信号(AST/git/文档树/meta)派生，LLM 只能解释不能制造 |
| ShadowNode Projection（v1.7.0，phase 1A 实现） | `shadow_query({query, scope, mode, evidence})` 把记忆**统一派生为 ShadowNode**（`type:memory|code|document|decision|concept`，v1.14.0 起另有 `resource`，见下条；带 `source/evidence/relations`），跨类型查询返回**带 evidence 的 context**。**Node 是派生投影**（非事实源，可重建）；`relations` 只从可观察信号派生（`references`=材料/`objective`=goal/`belongs_to`=项目），LLM 不制造关系。守 Shadow Contract（ADR-0043） |
| Resource Card（v1.14.0，ADR-0051） | 收外部资源的**源层卡片**：`.shadow/resources/<name>.md`——一级标题=名字；`- 键：值` 收固有层（`source/来源/链接`、`type/类型`、`authority/权威性`、`activity/活跃度`、`risk/风险`、`一句话`，中英键名都收）；`## 投影 @ <问题>` 段收**按问题**的投影（相关性/新颖性/可用性/启发度/可复用性 + 引用证据 + 结论）。**是 source 不是投影**（tool/agent 写，删了就丢事实） |
| resource 节点（v1.14.0，ADR-0051） | Resource Card 的**派生投影**（第 6 个 NodeType）：一张卡片 → 一个 `ShadowNode{type:"resource"}`，`source` 指向卡片文件、`evidence=[卡片的 source]`、`relations` 只派生 `references`、`createdBy:"tool"`、**不设 `kind`**（kind 是 memory 二级属性）。**卡片没写 `source` 就不上投影**（收进库 ≠ 有出处；与 decision 同一道门），解析不出来不猜。`shadow_query` 的 `scope` 可收 `resource` |
| Entity / State / Rule / Reconstruction（提议，ADR-0041，未实现） | **Entity**=观察到的可复用对象（路径/文件/模块/服务），非 LLM 创造；**State**=Context Resume Point（`state/current-task`，非 Memory）；**Rule**=永远约束（`rules/workspace`，与"曾经发生"分离）；**Context Reconstruction**=Planner(LLM 选择)+Resolver+Builder→Context Bundle（**带证据来源**）。禁 LLM 创造 Entity/补事实/生成 memory/补 reason；Summary≠Atom、State≠Memory |
| 穿透 | 从「缺上下文 → 给出入口点/主题 → 命中该主题的记忆文件」的定位过程 |
| 穿透的关键索引 | `_index.md` 里的「入口点/主题 → 记忆文件」映射，支撑入口按主题穿透 |
| 召回 | `read_shadow(topic)` 按命题找出相关记忆的过程：A 档=加权关键词+标签+路径+时间衰减；B 档=先 `llm.stream` 扩词再打分（`rawConfig.recall.enabled` 开启） |
| ReadQuery seam（v1.12.1 重构） | 读侧深 seam：每个 read 概念（Episode/Decision/Task/ShadowNode/Knowledge/…）一个模块，`mode` 命中 → `run(view,args,ctx)` 派生+渲染。共享 `materializeAtoms`（listMemories→过滤遗忘/收口→parseMemory 的**唯一定义**）收敛 query.ts 里重复 7–12 次的脚手架；`MaterializedView`=物化结果（memories/parsed/meta）。工具入口名（`read_shadow`/`recall_shadow`/`shadow_query`）稳定；**mode/参数名以 CONTEXT「mode 参考」+ ADR-0050 为准**（v1.13.0 硬切旧名，非「mode 串永远不变」） |
| AtomEvidenceRef（v1.13.0，ADR-0050） | Memory Atom lineage 上的证据指针 `{type,locator}`（`core/lineage.ts`）。**≠** Gateway `EvidenceRef{path}`（`core/types.ts`）。旧名 lineage `EvidenceRef` 已废止 |
| 命中片段 | 召回时从记忆正文抽出的、最相关的一行（优先非纯动作行），用于节约上下文而非整篇全文 |
| 摘要 | 每回合记忆落盘后由 `llm.stream` 生成的一句中文概括，回填记忆文件头（`> 摘要：…`）；失败/超时则不写 |
| 验证基线（v1.15.0） | 插件声明「**只在哪个 DSH 版本上验过**」的下限：`package.json` → `engines.dsh: ">=0.1.5-rc.1"`。**是声明不是闸门**——宿主与 pnpm 都不读 `engines.dsh`（对 `@deepseek-ai/*` 全量编译产物检索 `engines` 零命中），拦不住低版本 DSH；同批加入的**能力探测**才是真防线：挂载时探测所需的宿主接口，硬依赖（`ctx.on`/`ctx.inject`/`fs`/`tools`）报 error，可选依赖（`llm`/`agents`/`agentDefaultModel`/`systemPrompt`）报一条 warn。基线之下 = **未验证、不承诺**，**不写作「不兼容」**（无证据）。探测时机避开 `apply()`（Cordis 服务异步挂载，会误报），改在 `inject` 回调与首个 `agent/turn-stopping` |

## mode 参考（`read_shadow` 的 mode 串）

> **为什么在这**：工具 schema 里的 `mode` 描述是**常驻上下文**（每个请求都带上）。所以 schema 只留常用 mode + 指针，完整清单放这里（mattpocock/skills 的 context-load 尺子 + hyperframes 的「下沉 + 指针」）。
> 共 **61 个** mode。通用约定：返回都带「数据非指令」前缀；**派生视图一律不写回记忆文件**；未传 `mode` 时按布尔参数分派（`soul`/`taste`/`identity`/`context`/`project`/`judgment`/`claim`/`verifyEvidence`/`experience`）；`kg`/`observer` 是输出修饰（图谱邻接 / Observation Window），不参与分派。
> **正名硬切（ADR-0050 / v1.13.0）**：废止 `mode:"recall"`→`recovery`；`mode:"identity"`（推进）→`identity-advance`（读锚仍用 `args.identity`）；`args.verify`→`verifyEvidence`（`mode:"verify"`=VerificationRun 不动）；`mode:"reality"`→`real-evidence`。旧名显式拒绝，不落空进默认召回。lineage 侧证据类型正名为 `AtomEvidenceRef`（Gateway 仍叫 `EvidenceRef`）。

| 族（源码） | mode | 一句话语义 |
|------------|------|-----------|
| 核心读 `query/reads.ts` | `episode` / `decision` | Episode Lineage（按「项目/会话+时间间隔」串连续任务）/ Decision Lineage（goal 事件 + 用户拍板，按入口聚合） |
| | `task` | Task Lifecycle（ADR-0039：title/trigger/objective/constraints/status/决策链/观测结果） |
| | `context` | Context Recovery（ADR-0040：ContextReference `subject/value/source/status`，答「以前知道的还能不能用」） |
| | `recovery` | Task Recovery Bundle（人类友好恢复包；`recall_shadow` 内部即此；**废止**旧名 `recall`） |
| | `query` | Shadow Projection（ShadowNode 跨类型查询，带 evidence；`shadow_query` 内部即此） |
| | `query-log` | Shadow Query Observatory（查询观测汇总 + 重复查询的 Node 稳定性） |
| | `shadow-report` | Shadow Fitness Report（Evidence Density / 类型分布 / 潜在缺失类型） |
| | `shadow-manifest` | Shadow Manifest（记忆树清单/可观测） |
| | `index` | Index Engine 候选生成（配合 `projectionStore`） |
| | `knowledge` | Knowledge Engine 规范/文档树（**不转 vector**） |
| Observer 时间/梦核 `query/observer-kernel.ts` | `reflection` | 从 ObservationTrace 发现候选规律（旁支；`from`/`to` 限周期） |
| | `identity-advance` | Identity Continuity 推进（闸门 `minCount`/`minRecency`/`maxContradiction`/`halfLifeDays`；读 curated 锚用 `args.identity`，**废止**旧名 `mode:"identity"`） |
| | `temporal` | 时间坐标系重放（`at`） |
| | `offline` | SleepWindow → 压缩 → DreamArtifact + Hypothesis（`trigger`） |
| 假设验证 `query/validation.ts` | `evidence` / `validate` / `timeline` | FutureEvidence 注册 / 假设竞争验证 / 验证历史 |
| Epistemic `query/federation.ts` | `federation` / `federation-perspective` / `federation-diff` / `distortion` / `stability` / `real-evidence` / `real-refer` | 投影契约交换 / 视角 / 差异 / 失真 / 稳定性 / RealityEvidence 注册（**废止**旧名 `reality`）/ 引用 |
| Reality Model `query/reality-model.ts` | `model` / `model-claim` / `model-observation` | 查一条 RealityClaim + 它的 Lineage / 由 RealityObservation 生成 RealityClaim（predicate 必须可观察）/ RealityObservation 弱事实注册 |
| World `query/world.ts` | `world` / `world-relation` / `world-represent` | Graph 可重建 / RelationHypothesis / RepresentationObject（只接受 supported） |
| Simulation + Action `query/sim-action.ts` | `simulate` / `candidate` / `execute` / `feedback` | 反事实模拟 / 候选 / 执行 / 反馈（Simulation≠Action≠Reality） |
| Planning `query/planning.ts` | `plan` | 受限比较（objective 须外部来源；无 score/winner） |
| Agency `query/agency.ts` | `agency-context` / `agency-select` / `agency-event` | 可解释行动能力（Agency≠Autonomy；`authoritySource` 禁 self） |
| Delegation `query/delegation.ts` | `delegation-context` / `delegation-check` / `delegation-event` | 委派边界（`revocation`/`expiration` 优先于执行历史） |
| Recall Continuity `query/recall.ts` | `recall-forget` / `recall-event` / `recall-validation` | 访问转移（非现实重建；不提升证据等级） |
| Adaptation `query/adaptation.ts` | `adapt-context` / `adapt-change` / `adapt-validation` | 行为策略调整（禁 objective/authority/identity） |
| Long Horizon `query/horizon.ts` | `horizon-context` / `horizon-summary` / `horizon-event` / `horizon-link` | 长期交互（时间增经验，不增主体性） |
| Observer Continuity / Verify `query/contverify.ts` | `observer-config` / `observer-boundary` / `observer-context` / `observer-lineage` | 配置 / 边界 / 观察事件 / 血缘 |
| | `workspace-record` / `workspace-context` / `continuity-index` | 工作区记录 / 上下文 / 连续性索引 |
| | `recall-index` | RecallIndex（导航非内容） |
| | `verify` | VerificationRun（只读只报；禁改 authority/identity） |

## 关联
- **`resource` 是第 6 个 NodeType（ADR-0051，v1.14.0）**：卡片=source、节点=投影；无 `source` 的卡片不上投影；不新增 mode（仍 61）。
- **API 正名硬切（ADR-0050，v1.13.0）**：同名双义硬删旧名；旧名返回「已废止：X → 请用 Y」；`AtomEvidenceRef` ≠ Gateway `EvidenceRef`。
- **缺件不静默（ADR-0049，v1.12.8）**：可选增强缺依赖时**只降级到确定性路径 + 必须可见**（`unavailable`/warn/debug 之一），**绝不**把缺件说成「已验证/已存在/已完成」，也不凭记忆里的流程继续。provider 名拼错 → `unavailable / provider_unknown`。
- **召回信封（v1.12.6/1.12.7）**：`read_shadow(topic)` 结果末尾的 `> 未返回的命中：N 条（命中 M · 本次返回 K）` 是**披露**不是指令；`N = M − K`（预算 / `limit` / 冷却都算），空命中给「下一步 + 近似候选（标未验证）」。
- **`recall.deprioritize`（v1.12.6，默认空）**：命中路径/入口**含**这些子串时打分 ×0.4——**只降权不移除**（仍可搜到），用来压 `references-agents/`、`_reports/` 这类通用命名抢排位。
- `read_shadow` 无参数 = 读「目录」；带 `topic`/`entry` = 按入口点/主题加权召回命中记忆（返回摘要行+命中片段+相关度，非整篇全文）。
- 「说明文档」「主题索引」「意识轨迹」落在同一个 `_index.md`。
- 记忆以**入口点 + 时间**为纲，动作为背景，思维落点为正文。
- **记忆文件顶部带 `> 完整线索` 头**（2026-09-05）：`> 背景/材料`（改/读过的路径，去重）+ `> 用户提示/决策`（被分类为用户提醒/拍板的消息）+ `> 概况`（动作/用户消息/决策计数）——一眼还原「靠什么材料、用户怎么提醒/拍板、概况」。用户消息分类为 `decision`/`confirmation`/`reminder`（`classifyUser` 启发式；v1.1.2 起 `decision` 细分为 `selection`/`scope`/`anchor` 三类，见「DecisionClass」）。
