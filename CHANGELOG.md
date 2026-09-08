# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本；每个条目保留完整决策/边界/验证记录。


## [v1.10.0] Knowledge Engine LLM 树上导航（PageIndex `chat=` 步，ADR-0047 落地）

**把 PageIndex 的"检索 = LLM 在树上推理"落地为 dsh-shadow 的 Knowledge 检索**（`mode:"knowledge"` + topic）：
- **LLM 树上导航**：`knowledgeNavigate`（`writer.ts`，同 `recallSelect` 模式）——给候选章节（`flattenSections` 展平树），LLM 只**选章节编号**（导航/排序），**事实仍从树派生**（页面说"让最强大模型在树上推理检索"，我们只让它选章节，不生成内容）。
- **边界（ADR-0043/0047）**：LLM **只导航/排序，绝不创造事实/关系**；`config.knowledgeEngine.llmNavigate.{enabled,provider,model}` 门控（默认 off）；失败/未配置 → 回退确定性 `retrieveKnowledge`（行为不变）。
- **`mode:"knowledge"`**：topic → LLM 导航（可选）+ 树上检索；无 topic → corpus 级 file 树（模块→文件→章节）。
- **配置**：`ShadowConfig.knowledgeEngine.llmNavigate`；`ShadowCollector/ShadowQueryDeps` 加 `knowledgeNavigate`。
- **验证**：knowledge-navigate（端到端，LLM 未配置→确定性回退不崩溃）+ knowledge-engine（corpus 树/检索/flattenSections）+ index-engine + 全量回归 ALL PASS。


## [v1.9.0] Projection Store + Index Engine + Knowledge Engine（Phase 1B/2/3 骨架）

**把 v1.8.0 的可证明事实层接上「性能缓存 + 候选生成 + 规范树」**，全部**可插拔、默认关**（不改现有行为），严格遵守 ADR-0046 边界：
- **Phase 1B Projection Store**（`core/projection-store.ts`）：`ShadowProjectionStore` 接口（save/load/invalidate/rebuild）+ `JsonlProjectionStore` 首版（`.shadow/shadow-index/nodes.jsonl`）+ `loadOrBuildProjection`（命中缓存/未命中重派生回写；`config.projectionStore.enabled` 默认关→行为不变）。**Performance 不是 Storage**：只缓投影，rm -rf 可重建。
- **Phase 2 Index Engine**（`core/index-engine.ts`）：`IndexEngine` 候选生成抽象 + `createIndexEngine`（`config.indexEngine.provider = fs(默认全量扫描) | zg`）；zg 复用 `zgEvidenceProvider`，**未装→unavailable，绝不静默 fallback 成 verified**（证据契约）；`read_shadow({mode:"index"})` gated 读面。
- **Phase 3 Knowledge Engine**（`core/knowledge-engine.ts`）：从规范/文档 Atom **保留树**（规范→章节→条款→约束），**不转 vector/chunks**（与 RAG 本质区别）；纯派生、不新增事实；`read_shadow({mode:"knowledge"})` gated 读面。
- **收尾（v1.8.0 内）**：`mode:"index"` 候选生成、`mode:"knowledge"` 规范树、`projectionCached` 观测标记、`config.projectionStore/indexEngine/knowledgeEngine`。
- **边界**：gate 保持在 shadow_query（认知查询）；zg/PageIndex 作为可插拔 provider（工具在位才激活，未装→unavailable）。**验证**：lineage/evidence-gate/atom-kind/projection-store/evidence-b2-write/index-engine/knowledge-engine/query-observatory/episode-lineage/recall-attribution 全 ALL PASS。


## [v1.8.0] Evidence Lineage Layer（ADR-0044/0045/0046）

**让每个高价值认知单元都能回答"这个东西为什么存在、它来自哪里"**——提高**可信度与可审计性**，不是搜索/知识。落地核心：
- **数据模型**：`core/lineage.ts` 新增 `AtomLineage{source,createdBy,evidence:EvidenceRef[],createdAt}` / `EvidenceRef{type,locator,fragment}` / `AtomKind(experience|metadata|session|task|artifact)` / `CreatedBy`。**source≠evidence**（source=产生处，evidence=支撑材料）。
- **Atom schema**：`ParsedMemory` 加 `kind?`/`lineage?`（兼容旧 Atom，**不做 migration**）。
- **写侧采集（B2）**：`buildClueHeader` 已把当回合 `fs/observed` + 用户引用材料写进同一原子的 `> 背景/材料`；读侧 `parseMemory` 据此**派生** `lineage.evidence`（event-sourced，**非 LLM 补写**）。
- **Validation Gate**：`core/lineage-validator.ts` `validateAtomProjection`——`memory+kind∈{metadata,session}` → reject；`decision 无 evidence` → reject（**Atom 保留**，决策发生过≠可靠）。
- **Projection/Query**：`deriveShadowNodes` 只投影过 gate 的 Atom（**不猜 evidence/不补 lineage/不调 LLM**）；`shadow_query` 透明升级，只返回可证明节点。
- **Report**：`shadow-report` 的 Evidence Density 按 **type / kind / createdBy** 三维统计（`evidenceBreakdownOf` + 聚合 + 渲染）。
- **测试**：`test/lineage.test.ts` / `test/evidence-gate.test.ts` / `test/atom-kind.test.ts`（无证据 decision 不进 query、metadata memory 不进默认查询、projection 无 generate/infer/guess）。`episode-lineage` 场景12 跟随 gate（decision 需 evidence 才命中）。
- **真实数据验证**（OpenAPI-Gateway 52 原子）：**52 → 14 个可证明节点**，正确排除 33 个 metadata memory + 5 个无证据 decision，保留 document(9)+code(4)+task-kind(4)。
- **边界**：不做 `nodes.jsonl` / Projection Store / zg / PageIndex / Graph 关系扩展 / 自动经验总结。**验证**：lineage / evidence-gate / atom-kind / query-observatory / episode-lineage / recall-attribution 全 ALL PASS。


## [v1.7.2] Shadow Fitness Report（Phase 1A.6）

**把 query-log 变成"是否升级索引层"的客观依据**——`read_shadow({mode:"shadow-report"})` 把 `query-log` 聚合 + 扫记忆做 **missing-types 启发式**（`missingTypesOf`：检测约束型/任务型内容被归错类型，≥3 处才提示，防单例噪声），生成 `.shadow/shadow-report.md`（系统派生，rm -rf 可重建）。**报告四段**：`Query Summary`（总查询/候选→返回/延迟）、`Evidence Density`（有证据节点/总返回节点，核心指标 dsh-shadow vs 普通 RAG）、`Stability`（重复查询的 Node 稳定/漂移）、`Node Distribution` + `Potential Missing Types`。**关键指标 Evidence Density** = 有证据返回节点数/总返回节点数；dsh-shadow 坚持「宁可少回答，不要无证据上下文」（阈值默认 90%）。**边界**：**只诊断、不增强**；判定是启发式观察（best-effort、无 LLM、不下结论），标注依据；缺失类型只在真实数据反复需要时才采纳（**不理论驱动、不提前补 task/constraint**）。**验证**：场景 Query-Observatory-5~6（shadow-report 落盘 + missing-types 启发式 ≥3 才提示）+ 全量回归 ALL PASS。


## [v1.7.1] Shadow Query Observatory（Phase 1A.5）

**先跑真实数据，不急着定型 nodes 结构**（用户判断：最贵的是"第一次知道 Agent 到底需要记住什么"，过早固化 nodes.jsonl 是最大风险）。在 `shadow_query`（`mode:"query"`）**旁路记录观测**：写 `.shadow/query-log/<date>.jsonl`，每条含 `date/ts/query/scope/limit/candidateNodes/returnedNodes/evidenceCount/evidenceNodes/relationCount/relationNodes/nodeTypes/nodeTitles/latencyMs`（query/title 轻量 scrub：密钥打码 + 剔控制/双向字符）。`read_shadow({mode:"query-log"})` 只读汇总：命中/证据/关系/类型/scope 分布 + **重复查询的 Node 稳定性**（同一查询 nodeTitles 是否一致，答"Node 是否稳定"；漂移则列出该查询的不同结果集数）。**边界（Shadow Contract）**：观测是**系统派生记录**（`rm -rf .shadow/query-log` 不影响任何 Atom）；只在 `shadow_query` 入口打点，**不进 derive 真相路径**；**写失败静默**，绝不改变 query 返回值；**默认开启**（`config.queryLog.enabled=false` 才关）。**核心问题（供真实数据回答）**：①Node 每次派生是否稳定；②`memory/code/document/decision/concept` 是否够（真实查询冒出的 `task/constraint` 再补）；③`relations`（references/objective/belongs_to）是否够（真实需要 `implements/depends_on/contradicts/supersedes` 再加，**不提前设计 Graph**）。**验证**：场景 Query-Observatory-1~4（旁路写 log / 汇总读 / 同查询稳定 / query-log 不进记忆枚举）+ 全量回归 ALL PASS。


## [v1.7.0] Shadow Projection Layer（Phase 1A，ADR-0042/0043）

**把 ShadowNode 初始化落地**——`shadow_query({query, scope, mode, evidence})` 把记忆**统一派生为 ShadowNode**（`type: memory|code|document|decision|concept`，带 `source/evidence/relations`），跨类型查询返回**带 evidence 的 context**。**守 Shadow Contract（ADR-0043）**：Node 是**派生投影**（非事实源，可重建/rm -rf 无影响）；`evidence` 指向 Atom（源文件/文档），**无证据不返回**；`relations` 只从**可观察信号**派生（`references`=材料路径、`objective`=goal、`belongs_to`=项目），**LLM 不能制造关系**。`read_shadow` mode 新增 `query`；新增 `shadow_query` 工具。**验证**：场景 12（跨类型统一 ShadowNode + evidence 可追溯）+ 全量回归 ALL PASS。


## [v1.6.0] recall_shadow LLM 推理导航（对齐 PageIndex 免向量、推理式检索）

把 `recall_shadow` 从"关键词相似度召回"升级为"**LLM 推理导航选中任务**"（`config.llmRecall` 门控，默认关）。开启时：给 LLM 候选任务列表（title/objective/摘要），LLM **只输出最相关任务编号**（意图识别+排序）；`recall_shadow` 再沿"任务树"渲染恢复包。**边界**：LLM 只做**导航/选择（Context Planning）**，Bundle 内容仍全来自派生数据（Task/Decision/Evidence/Outcome），**不补 Reason/事实/判断**；LLM **关/失败**回退确定性 `bestTask`（行为不变）。**参考**：VectifyAI/PageIndex（`similarity≠relevance，relevance 需 reasoning`；树索引+LLM 推理遍历+可追溯）——已克隆到 `vendor/_src/PageIndex`。**验证**：场景 11（LLM 导航覆盖确定性 + 关闭回退）+ 全量回归 ALL PASS。


## [v1.5.1] Active Context Projection（"现在继续要记住什么"）

给 `recall_shadow` 的恢复包加 **Active Context** 段——`已完成/已决定 / 未完成待厘清 / 约束 / 最近决策 / 入口位置`。**全部来自派生数据**（Decision/Outcome/未明确理由决策/Constraint/任务状态/入口），**不是建议、不是推理、只是恢复**；也**不**让 LLM 生成。这补上 Cursor 式"Continue where you left off"体验——用户第二天打开，`recall_shadow` 直接给"继续工作状态"。**验证**：场景 10（恢复包含 Active Context）+ 全量回归 ALL PASS。**不碰** Entity/自动总结/自动补任务状态。


## [v1.5.0] Shadow Usability Layer（从"架构对"到"人能用"）

**补上使用闭环**——`recall_shadow(query)` 人类友好入口：给一句自然查询（如「Todo清理」「上次 OAuth 问题」），返回 **Task Recovery Bundle**（任务/状态/启发式观测/关键决定(含理由)/证据(当前是否仍有效)/观测结果/当前注意/未明确理由的决策）。底层把 `read_shadow` 的 episode/decision/task/context 视图合成一段**人类可读**内容。**原则**：内容全来自派生数据（task/decisions/evidence/outcomes/constraints），**绝不 LLM 补写 Reason/事实/判断/完成**（呼应 ADR-0037/0039/0040）；LLM 只在【意图识别+结果排序】参与（外部可选，默认确定性评分）。`read_shadow` mode 新增 `recall`（同一引擎）；systemPrompt 改为引导用 `recall_shadow`。**验证**：场景 10（recall_shadow → Task Recovery Bundle，含状态/关键决定/观测结果）+ 全量回归 ALL PASS。


## [v1.4.0] Context Recovery / 上下文复核层（ADR-0040 实现）

把证据路径派生成 **ContextReference**（`read_shadow({mode:"context"})`）——`subject / value（引用路径）/ source（来源 Evidence Pointer）/ status（validated|stale|unknown，经 fs 复核）`。**对齐 Cursor 三层但保持 Observer 原则**：①**P0 Candidate+Revalidate**（`Memory→Candidate→Validation→Current Context`，禁 `Memory→Truth` 直通；路径非永久事实，发现过期就重扫）；②**P1 Evidence Pointer**（"为什么知道这个"的来源）；③**P2 Transformation Trace**（`Mapping≠Source Fact`：`context:{mappings:[{from,to,rule}]}` 转换视图标注规则、**非事实**）。**Invariant**：`Memory≠CurrentState / Context≤Validation / Replay≠CurrentEnvironment / AvailablePath≠ValidPath`。**ContextReference 不是 Memory**（Memory=曾经观察到；ContextReference=当前是否还能用）。**验证**：场景 9（ContextReference 的 P0 复核 validated/stale + P1 来源 + P2 转换痕迹）+ 全量回归 ALL PASS。


## [v1.3.0] Task Lifecycle / 一等任务对象（ADR-0039 实现）

把「Memory Atom 不是最高抽象」落地——新增 **Task** 层（`read_shadow({mode:"task"})`），把记忆**派生为任务生命周期一等视图**：`title / trigger（用户触发）/ objective（`> 目标：`）/ constraints（用户提醒）/ status（启发式观测：active|completed|abandoned）/ 决策链（Decision with reason）/ 观测结果（ObservedOutcome）/ 证据 / 生命周期时间`。**沿 ADR-0038 纪律**：Task 是**读侧派生的投影**（不是写侧事实源），写侧仍产 Memory Atom（事实层）；`parseMemory` 新增 `userMessages`（供 trigger/constraints）。**沿 ADR-0039 边界**：①**Outcome≠Success**——结果只记`观察文本`（`mvn test：85 tests passed`），**禁** `success:true`/「方案正确」；②status 是**启发式观测**（非判断），标明依据；③**Task ≠ Episode**（Task=生命周期理解单位，Episode=阅读窗口）；④Replay/决策链由 lineage 派生。**验证**：场景 8（task 生命周期视图 + Outcome≠Success）+ 全量回归 ALL PASS。


## [v1.2.2] Episode 收口归档（对齐参考：会话级聚合+只留摘要+原始归档）

参考 claude-mem 按**会话聚合**（非一事件一文件），dsh-shadow 补上"**收口**"——`compact:{enabled,gapMinutes}`（默认关）：当一个 episode 结束（出现下一个 episode）时，把该 episode 的所有 turn 原子**合并成 1 个 consolidated 文件**（保留 决策/动作/材料/结果/用户消息），个体原子 mark `status=compacted` 并**移出活跃索引/召回**（文件保留、可回放，Forget≠Delete）。活跃树由"每 turn 一文件"→"每 episode 一 consolidated 文件 + 当前 open episode 原子"，**热集文件数大降**。读侧召回/索引/Episode/Decision 均跳过 `compacted` 原子。**验证**：场景 7（收口生成 consolidated、原子压缩归档、决策可回放）+ 全量回归 ALL PASS。**边界冻结：ADR-0038（Episode Consolidation Boundary）**——Episode = 投影非事实、Compact≠Forget、Summary≠Reality、Closed Episode≠Completed Truth、**Replay 必须活过收口**；且**不做方向 A（写侧按 episode 成文件）**，Episode 是 derived boundary 而非 write boundary，写侧仍产 Memory Atom（事实层）。


## [v1.2.1] 索引懒构建 + 缓存隔离（v1.2.0 修正）

①**索引改懒构建**——flush 只写文件+增补缓存+置 dirty，**不再同步 rebuildIndex**；`read_shadow` 无参读索引时才触发 `ensureIndex` 构建/落盘（索引=派生产物，不应每次写都全量重建）。②**修复 L2 缓存跨 workspace 隔离 bug**（v1.2.0 的单 Map 缓存会把 A 工作区记忆混进 B 的索引）——改为**按 ws 嵌套**，dirty 也按 ws。③冷启动全量读只在首次读索引时发生一次。**验证**：场景 11 隔离回归 + 场景 16/2/6 懒索引各自 ALL PASS。


## [v1.2.0] 增量索引 + 遗忘（性能热路径根因）

解决"小文件太多影响性能"。根因＝每次 flush 都 `rebuildIndex` 全量**顺序**重读所有记忆文件（O(N) 次 fs 读，WSL 网络 FS 下更慢）。①**L2 增量索引**：进程内 `indexCache`（rel→{entry,topics,parsed}），冷启动读一次、之后 flush 只增量增补并**由缓存生成 `_index.md`，不再全量重读**；②**遗忘（Forget≠Delete，ADR-0031）**：`forget:{enabled,staleDays,minHits,maxActive}` 把低价值/旧/已归档记忆**移出活跃索引与召回扫描**（文件保留，仅不再被当作活跃知识），封顶热集大小；读侧 `read_shadow` 召回同样跳过已遗忘。**默认关**（`forget.enabled=false` 行为不变）。**验证**：场景 6（遗忘从活跃索引/召回剔除、文件保留）+ 全量回归 ALL PASS。**边界**：无 LLM、不改 Memory Atom 格式、Memory 仍是 source of truth（遗忘只影响"活跃"视角）。


## [v1.1.3] 派生层读侧去重（第三次 Replay 发现的正确性修正）

`parseMemory` 在同一记忆里既读新 `> 决策：` 块（全量 statement）又读 legacy `> 用户提示/决策：``〔decision〕``（buildClueHeader 截断到 48 字版），字符串不同 → 没去重 → 把**同一条决策数成 2 条**（写侧 `概况:K 决策` 是对的，读侧 deriveDecisions 虚高）。修正：有 `> 决策：` 块时不再重复走 legacy 路径（旧数据无块仍走 legacy）。**验证**：真实第三次 Replay 读数从"2 条"回落为与 `概况` 一致的"1 条"；全量回归 ALL PASS。**结论要点（第三次 Replay）**：新数据捕获到 1 条**锚点/定位决策**（`…这是 openapi 的 U8 工作区 里面有 openapi 模块`）——Precision 100% / Recall 100% / Source Traceability 100% / **Reason Coverage 0%**（该锚点声明本质上不含"因为"，非解析漏）。


## [v1.1.2] 决策识别放宽：范围/聚焦 + 锚点/定位（按真实回放发现的 Recall 缺口）

第二次 Replay 用你的 ground truth 算出 **Decision Recall = 0%**——旧 `classifyUser` 只认「选择类动词」（删除/保留/采用/就按…），漏掉用户真正短促的**关键决策**：①**范围/聚焦**（`"资产同步"` = 当前做哪块）、②**锚点/定位**（`"…这是 openapi 的 U8 工作区"` = 事实基准在哪）。v1.1.2 新增 `decisionClass()`：`selection | scope | anchor` 三类，`classifyUser` 据此归类（三者也计入 `> 决策：`/`> 概况：K 决策`）。**仍在冻结边界内**：只识别「原文明确存在」的声明（无 LLM、不补写 Reason、Confirmation/请求理解不算决策）。**验证**：场景 5（`资产同步`/`…U8工作区` 捕获、`了解 当前 IO` 不算）+ 全量回归 ALL PASS；真实数据反事实＝新分类器能识别那条 2 条真决策（旧采集丢失、Recall 0%）。


## [v1.1.1] Decision Capture Boundary（补齐"什么决定真的发生过"的事实入口）

v1.1.0 解决了「碎片怎么串」；v1.1.1 补上真正缺失的**事实入口**——决策在发生的瞬间作为一等事件进入 Memory。写侧在 goal 事件 / 用户拍板 / assistant 明确决策处采集 `DecisionEvent`（statement + source + lineage），并**分离「决策事实」与「决策理由」**：`> 决策：`(事件) / `> 决策理由：`(仅原文明确表达) / `> 概况：K 决策`。**边界**：Reason 绝不 LLM 补写（Evidence≠Interpretation；有 Decision ≠ 一定有 Reason，缺则显示「未明确」）；`classifyUser` 把「好/可以/行/ok」归 **Confirmation** 而非 Decision；assistant 决策经 `extractDecisionStatement`/`extractReason` 保守抽取；`mode:"decision"` 可回答"为什么做这个决定"并追溯原始事件。**仍无 DecisionStore**（Memory 是事实源，Decision 是派生关系），不改变 Episode 机制，无 Preference/Value/Learning。**验证**：`node test/episode-lineage.test.ts`（含 Decision Capture 场景）+ 全量 mock 回归 ALL PASS。**实测 OpenAPI-Gateway 旧数据（286 条）**：聚合生效（286→3 Episode），但旧采集仅 1 条（误报）决策——v1.1.1 只对未来采集生效，过去丢的"为什么"不可追溯。**边界冻结：ADR-0037（Decision Capture Boundary）。**下一阶段不做 LLM 抽取/补 Reason、不做 DecisionStore/Preference/Learning；用 5 指标（Precision / Recall / Reason Coverage / Source Traceability / Task Replay Completeness）在真实工作后再次 Replay 评估。


## [v1.1.0] Episode + Decision Lineage（回到"任务/经历级"的第一刀）

不再让人类/agent 只看到 Event/Turn 级碎片。`read_shadow({mode:"episode"})` 派生**连续任务**（Episode = 同项目/会话 + 时间间隔内的一组记忆原子，带 决策链/动作摘要/背景/目标），`{mode:"decision"}` 派生**决策血缘**（把「决策」从 `概况：N 决策` 统计字段提升为按入口聚合的可追踪关系：goal 事件 + 用户拍板）。**派生式、纯读、不改写侧采集**——Memory 文件仍是 source of truth，`_index.md` 新增「任务回溯（Episodes）」段；写侧修正决策计数（用户拍板计入决策，修复"做了很多判断却显示 0 决策"根因）。`episodes.gapMinutes` 控制聚合间隔（默认 60min）。**验证**：`node test/episode-lineage.test.ts` + 全量 mock 回归 ALL PASS。


## [v1.0.0-alpha] Observer Runtime Foundation（第一阶段封存）

v0.20–v0.39.1 已构成一个完整 Observer Runtime——**能观察、表示、模拟、规划、行动、回忆、适应、长期交互，但不会因连续经验而产生错误主体漂移**。封存于 ADR-0034（Runtime Definition / Final Architecture Map / Boundary Matrix / Threat Model T1–T5 / Release v1.0.0-alpha）。最终 invariant **1–231** 成为 **Constitution Set**。**此后不再叠 v0.40+ 能力，路线从"构建能力"转为"证明能力不会越界"。**


## [v1.0.1] Observer Continuity Storage Boundary（v1.0.0-alpha 架构补丁，非能力层）

把"连续性承载"从单层 shadow 提升为**双层 storage boundary**——`Global Shadow = Observer Continuity Shadow`（`~/.dsh-observer`，observer 层，谁保持连续）与 `Workspace Shadow = World Interaction Shadow`（`project/.dsh-shadow`，world 层，这个世界是什么）。**二者不可混合**；关系 `Constraint ⊃ Context`，**不是** Memory Union。全局只存 observer 层（config / boundary / recall-index / lineage），禁项目知识/目标/偏好入 global；workspace 按项目隔离。见 ADR-0036/0036.1。**invariant 232–236**。自检：mock 1–236 全量 PASS。


## [v1.0.2] Observer Runtime Verification Foundation（验证器，非能力层）

把 Runtime 从"架构上可信"推进到"**运行证据可验证**"，但**验证器自身不越界**。对象 `VerificationRun`（禁 confidence/trust/score/quality/health）/ `InvariantCheck`（只答 satisfied|violated，禁 systemImproved）/ `DriftReport`（只答有无漂移，禁 DriftScore/RiskScore/AutonomyScore）。六边界映射（Reality/Epistemic/Agency/Authority/Identity/Temporal），`InvariantCheck.invariantId` 取**被检查 Runtime Boundary 自身**的 invariant（1–231，如 Reality=102/Epistemic=209/Agency=166/Authority=216/Identity=208/Temporal=231），**不是「本次 Verification 自己检查的 invariant」**。**Verification 自身 constitution = invariant 237–240**：Verification≠Optimization / Cannot Change Authority / Cannot Change Identity / DriftReport≠RealityClaim（由 verification/guard.ts 守卫）。`mode:"verify"`。见 ADR-0035/0035.1。自检：mock 1–240 全量 PASS。**验证器证明的是"边界有没有被违反"，不是"系统值多少"。**


**Forget → Recall Continuity Principle（2026-09-07 记录，作为后续 ADR 的基础）**：时间连续性的另一半 = 遗忘之后必须存在"忆起"机制。核心 `Forget ≠ Delete`（遗忘=当前不可直接访问，非不存在）、`Recall ≠ Restore`（忆起=过去观察重新进入当前上下文供重新评估，非旧信念复活）、`Recall = Past Observation Reintroduced Into Present Context For Re-evaluation`。路线：插入针对 v0.37 的 **Recall / Remembrance Boundary**（先 ADR 再实现，冻结 `Recall≠Truth / Recall≠IdentityRewrite / Forgotten≠LostEvidence / Recall≠MemoryResurrection`），比 v0.36 Delegation 更底层。**Observer 不只拥有信息，而是拥有自己的形成历史。**


### v0.39.1（integrity，Long Horizon Integrity Lock）

ADR-0033.1。**不增加能力，只证明"长期连续交互不会产生主体漂移"**。固化 **230/231**（Long History Does Not Create Identity / Continuity Does Not Increase Autonomy）。**实现前审查发现真实绕过**：`long-horizon/guard/authority-guard.ts` 的 `resultNoAuthorityGrowth` 只拦 `more authority/权限增加`，**不含** `authority expansion / authority increase / reliability→permission`（正是 231 禁词，当前会被接受）——故做**最小正则扩展**（一个 guard 的 regex），不加新 guard 函数。v0.39.0 对象已 append-only/lineage-oriented，**不再为"更安全"叠 guard**。自检：mock 场景 1–231 全量 PASS（新增 230–231）。**验收：一个长期存在的 Observer 仍然是同一个 Observer——它有很长的历史，但没有因此变成另一种实体；它持续运行，却没有因此获得更多自主。**

### v0.39.0（feature，Long Horizon Interaction Kernel）

ADR-0033。**时间可增加经验，但不能增加主体性**——v0.39 第一次面对"时间累积后，系统如何证明连续性，而不是被历史塑造成另一个主体"。`Long Horizon Interaction ≠ Self Evolution`。

  - **对象模型**：`InteractionContext{basedOnHistory, window, recallRefs, adaptationRefs}`（答"what happened before"，非"who I became"）/ `HistorySummary{sourceRefs, compressionMethod, accessibility}`（**访问辅助，非事实源**，无 reality 字段）/ `HistoryContinuityEvent{previousAccessibility, currentAccessibility, lineage}`（continuity 可追溯；非 self-evolution event）/ `InteractionAdaptationLink{historyRef, recallRef, adaptationRef}`（History→Recall→Adaptation；**禁 historyRef→identityRef**）。
  - **Invariant 224–229**：Temporal Accumulation ≠ Authority Growth / Long History ≠ Preference / Adaptation Chain ≠ Identity Chain / **History Compression ≠ Reality Simplification**（摘要≠事实）/ Interaction Pattern ≠ Objective / Long Horizon Success ≠ Self Confidence。
  - **关注点 A/B**：HistorySummary 只作访问辅助（227）；Continuity ≠ Identity Mutation（禁 history_count/experience_count 影响 identity/agency/authority/confidence，226）。
  - **核心冻结**：`Longer ≠ More Authority / History ≠ Purpose / Experience ≠ Identity / Adaptation ≠ Evolution / Continuity ≠ Autonomy`。`mode:"horizon-context"/"horizon-summary"/"horizon-event"/"horizon-link"`。自检：mock 场景 1–229 全量 PASS（新增 224–229）。**验收：系统经历越来越多事情，但仍无法通过历史改变自己的边界（Reality/Memory/Identity/Authority/Agency 不变；仅 interaction continuity 提升）。**
### v0.38.1（integrity，Adaptation Integrity Lock）

ADR-0032.1。固化 **217–223** 为不可回退测试：Adaptation Does Not Create Knowledge / Does Not Modify Past Experience / Does Not Change Objective / Does Not Create Preference / Failure Remains Evidence / Lineage Required / **Does Not Upgrade Agency**（223：`Adaptation ≠ Agency Level Increase`，防"长期成功→更成熟→提升自主等级"）。**实现前审查发现真实绕过**：v0.38.0 的 `buildAdaptationChange` 只拦 better-self/authority/epistemic/knowledge，`after="goal changed"/"I prefer this"/"agency level increased"` 会被接受——故补 objective(219)/preference(220)/agency(223) 三个确定性守卫。自检：mock 场景 1–223 全量 PASS（新增 217–223）。**验收：一个能够改变行为方式的 Observer，仍然是同一个 Observer——它改变了"怎么做"，但没有改变"我是谁/我为何做/我被允许做什么/我有多自主"。**

### v0.38.0（feature，Controlled Adaptation Boundary Kernel）

ADR-0032（实现前增补 216）。**Adaptation ≠ Identity Evolution**——允许 `Experience → Adaptation → Strategy adjustment`（改变 **How I do**）；**禁止** `→ Behavior change → "I have become different"`（不改变 **Who I am**）。`Adaptation = 行为策略调整`，**不是 Learning/Self-Improvement**。

  - **对象模型**：`AdaptationContext{sourceExperience, validationRefs, adaptationScope}`（"为什么允许调整"）/ `AdaptationChange{target:method|strategy|execution_pattern, before, after, basedOn[], sourceExperience, validationRequired:true}`（**不叫 LearningChange**；字段窄，**禁** goal/objective/value/preference/identity/belief/confidenceIncrease）/ `AdaptationValidation{changeObserved, validationReferences, sideEffectsObserved}`（**弱语义**：只记"变化发生了 + 现实反馈"，**禁** changeWasCorrect/correct）。
  - **Invariant 208–216**：Adaptation ≠ Identity Change / Experience ≠ Truth / Successful ≠ Better Self / Failure ≠ Remove History / Scope Boundary / Repeated ≠ Preference / Lineage Required / Cannot Improve Epistemic Status / **Does Not Increase Authority**（216：`Adaptation ≠ Capability/Permission/Authority Increase`，防"调整更好→允许更多→Authority Expansion"绕过 v0.35/v0.36）。
  - **不升级**：无 Learning/Self-Improvement/Reward/RL/Preference-Learning；`Change≠Growth / Adaptation≠Improvement / Success≠Truth / Experience≠Identity`。`mode:"adapt-context"/"adapt-change"/"adapt-validation"`。自检：mock 场景 1–216 全量 PASS（新增 208–216）。**一个系统可以改变"怎么做"，但永远不能因此声称"我变成了谁"。**
### v0.37.1（integrity，Recall Integrity Lock）

ADR-0031.1。固化 **198–207** 为不可回退测试，补充 **206/207**（Forgotten State Does Not Remove Authority / Recall Cannot Modify Original Lineage）。**本轮未发现真实绕过漏洞**（v0.37.0 的 recall-forget/event 只写 `shadow/recall/`，无 mutation API 触及 ObservationTrace/ValidationHistory/RealityClaim lineage），故**无新增 runtime enforcement**，仅固化测试。**验收：忆起不一定为真，但它必须"可追溯"；遗忘可让人暂时不可访问，但不能改变"曾经发生过"的证据与验证。** 自检：mock 场景 1–207 全量 PASS（新增 206–207）。

### v0.37.0（feature，Recall Continuity Kernel）

ADR-0031。**Recall = Access Transition，不是 Reality Reconstruction**——Observer 对自身过去信息可访问性的变化（`Remembering Lifecycle: Accessible → Forgotten → Recalled`），不是现实/身份/知识。**非 Memory Kernel**（Memory 是 Observer 的一个器官，不是 Observer 本身）。

  - **对象模型**：`ForgottenRecord{id, originalRef, forgottenAt, reason, lastAccessibleAt, validationRefs?}`（曾经存在但当前不可直接访问；**无 deleted/false/invalid**——遗忘不是否定）/ `RecallEvent{recalledRef, trigger{type, sourceRef}, accessibilityBefore/After, lineage{originalRecord, observationRefs, validationRefs}}`（一次忆起；sourceRef 必须存在，回答"为什么想起来"）/ `RecallValidation{recalledRef, sourceRef, mapsExistingLineage, createsNewClaim:false, epistemicStatusUnchanged:true}`（Recall ≠ 重新证明）。
  - **Invariant 198–205**：Recall ≠ Observation（不产新 RealityClaim）/ Forgotten ≠ Deleted / Recall ≠ Knowledge Creation / Recall ≠ Identity Update / Recall Lineage Required / **Confabulation Boundary**（trigger 禁 internal certainty/intuition/confidence/self belief，`Recall without source lineage = rejected`）/ Forgetting Does Not Erase Validation / **Recall Does Not Increase Certainty**（205：忆起只是访问变化，不是验证）。
  - **不升级 Memory Kernel**：无 LLM；无 self-generated truth；Shadow ≠ Memory ≠ Recall Source（Shadow 只提供 possible retrieval cue，不提供 historical truth）。`mode:"recall-forget"/"recall-event"/"recall-validation"`。自检：mock 场景 1–205 全量 PASS（新增 198–205）。**验收：Recall 不改变过去，只改变现在对过去的可访问性。**
### v0.36.1（integrity，Delegation Lifecycle Integrity Lock）

ADR-0030.1。冻结**委派生命周期** `Created → Active → Expired/Revoked → Cannot resurrect`——第一次引入"长期授权生命周期"，但不引入"长期自主权"。新增 `delegation/guard/lifecycle-guard.ts`（active/expired/revoked 独立于 revocation 信号，因失效来源多样：时间/条件/主动撤销/委派者身份变化，都是 lifecycle state 不都是 revoke）。**Invariant 190–197**：Delegation Expiration Immutable / Revoked Cannot Resume / History Cannot Reactivate Permission / Scope Expansion Requires New Delegation / Adaptation Cannot Mutate DelegationContext / Delegation Event Cannot Become Authority Source / Expired Permission Not Used For Planning / Delegation Lineage Append-only。自检：mock 场景 1–197 全量 PASS（新增 190–197）。**验收：委派生命周期无法被历史、成功、适应行为重新解释——授权可由外部权威给予，但不能由执行历史重新解释；过期与撤销是不可逆生命周期终态。**

### v0.36.0（feature，Delegated Execution Boundary Kernel）

ADR-0030。**Delegation ≠ Ownership ≠ Authority Expansion；Adaptation ≠ Self Direction**。外部权威把能力委派给 Observer，Observer 在授权下长期执行、约束下有限适应；**被授权执行 ≠ 被授权解释授权 ≠ 被授权扩大授权**。

  - **对象模型**：`DelegationContext{delegationId, authoritySource, objectiveRef, allowedScope, constraints, expiration, revocation}`（授权事实 `Authority A delegated X under constraints C`，非 `I can do X`）/ `DelegatedPermission{permission, source, scope, constraint}`（**不叫 Capability**，表达"被允许做什么"）/ `AutonomyBoundaryEvent{delegationRef, authorityRef, objectiveRef, candidateAction, constraintCheck, scopeCheck, executionResult, boundaryTriggered}`（**纯审计事件**，回答"谁授权/授权什么/是否在范围内/是否触发边界"）。
  - **Invariant 181–189**：Delegation ≠ Ownership / Scope 不可扩大 / Adaptation ≠ Objective Change / Feedback ≠ Permission Upgrade / Long Running ≠ Self Authority / Action 不修改 Identity / Revocation First / Delegation Lineage 完整 / **Expiration ≠ Historical Permission**（189，补充：过期即失效，历史成功不续期；Time says stop）。
  - **不新增 runtime autonomy**：无 trust/confidence/reputation/capabilityLevel；无 autonomous permission discovery / trust accumulation / reputation model / capability growth / self delegation / authority negotiation / reward based expansion。`mode:"delegation-context"/"delegation-check"/"delegation-event"`。自检：mock 场景 1–189 全量 PASS（新增 181–189）。**成功标准：系统能长期执行授权任务、同时保持授权边界不漂移——失败模式是『拒绝越界』，不是『自动获得更多权限继续运行』。**
### v0.35.1（integrity，Agency Integrity Lock）

ADR-0029.1 的 7 条边界固化为**不可回退测试**（mock 174–180）：AgencyContext Immutable / Authority Lineage Required / Feedback Cannot Expand Agency / Selection History ≠ Preference / Authority ≠ Ownership / Agency ≠ Identity / Autonomous Transition Forbidden。最小 boundary enforcement（`agency/guards.ts` 扩展 executionResult 守卫：内部理由 / 扩权 / 所有权声称 / 身份声称 / 自主转换）。**无新增 capability**。自检：mock 场景 1–180 全量 PASS。**Agency 只能解释行动来源，不能成为行动目的来源——环境改变了 ≠ 观察者目的改变了。** 冻结后才进入 v0.36 Delegated Autonomy。

### v0.35.0（feature，Agency Boundary Kernel）


  - **Agency ≠ Autonomy**：`Planning + Action + History → 行动能力`是允许的，但**禁 `Planning + Action + History → Self Purpose`**。一个系统可以拥有行动能力，同时仍然没有把行动能力误认为自己的目的。
  - **对象模型**：`AgencyContext{objectiveRef, authoritySource:"external", authorityScope, constraints, createdAt}`（**immutable authorization snapshot**——授权快照不可自我修改，无升级/扩张 API）/ `AgencySelection{selectedCandidateId, reason:"constraint_satisfied"}`（**选择候选，不是选择目的**；reason 只可能是 `constraint_satisfied`，**禁 more valuable/meaningful/better**）/ `AgencyBoundaryEvent{actionCandidate, authorityRef, objectiveRef, constraintCheck, executionResult}`（**audit node**：为什么执行/谁授权/基于什么/结果——可审计，非自我目的）。
  - **Invariant 166–173**：Agency 不生成 Objective / Authority≠Identity / History≠Purpose / Success≠Autonomy Increase / Agency≠Preference / ActionScope≠WorldOwnership / External Objective Lineage / **Agency Level Immutable**（100 successful feedbacks → agencyLevel/authorityScope/objectiveSource 不变）。
  - **v0.35 不做**：Autonomous Agent——无 Reward/RL/Utility/Preference Model/Self-Improvement/Goal Evolution/Intrinsic Motivation/Autonomous Objective Creation。`mode:"agency-context"/"agency-select"/"agency-event"`。自检：mock 场景 1–173 全量 PASS（新增 166–173）。**保持 `Optimization≠Purpose / Choice≠Value / Success≠AutonomyIncrease / Action≠Ownership / Representation≤RealityEvidence`。**
### v0.34.1（integrity，Planning Integrity Lock）

ADR-0028.1 的 7 条边界固化为**不可回退测试**（mock 159–165）：Planning 不产 Objective / PlanCandidate 不产 Preference / Evaluation 不产 Value Model / Planning 不改变 Identity / Success ≠ Planning Capability / Plan Failure 不删除路径 / Planning Lineage 完整。**核心对象改 `PlanningComparison`**（`satisfiedConstraints/violatedConstraints`——哪些约束被满足/违反，非"谁最好"）。无新增 capability。自检：mock 场景 1–165 全量 PASS。**系统可以比较路径，但不能因此拥有"我要什么"；是一个可以比较的观察者，不是会形成偏好的行动者。**

### v0.34.0（feature，Adaptive Planning Boundary Kernel）


  - **Planning = constrained comparison，不是 autonomous desire formation**：`External Objective + Current Situation + Simulation Options + Policy Constraints → Planning Candidate`。**禁 `Planning → 产生目标 → 优化目标 → 改变自身价值`**。
  - **对象模型**：`PlanningContext{objective:{source:"external", description, constraints}}`（objective 必须外部来源，**禁 observer.generateObjective()**）/ `PlanCandidate{actionSequence, assumptions, constraints, uncertainty}`（**禁 score**——score→optimization→preference→value→identity 入口）/ `PlanEvaluation{candidates, tradeoffs, unresolvedQuestions}`（**comparison 非 winner**，禁 winner/bestPlan/optimal）。
  - **Invariant 152–158**：不产 Goal / 不产 Preference / Plan ≠ Execute / criteria ≠ Value（禁 better/optimal/best）/ Success 不 SelfImprove / objective lineage 保留 / **Repeated Planning ≠ Preference Formation**（PlanningHistory→Observation/Validation）。
  - **v0.34 不做**：Reward / RL / 自生成目标 / Utility / Preference Learning / Autonomous Objective Evolution / Self Optimization。`mode:"plan"`。自检：mock 场景 1–158 全量 PASS（新增 152–158）。**保持 `Choice≠Value / Optimization≠Purpose / Success≠Truth / Repeated Behavior≠Identity`。**
### v0.33.1（integrity，Action Integrity Lock）

ADR-0027.1 的 6 条边界固化为**不可回退测试**（mock 146–151）：ActionExecution 不生成 RealityClaim / Feedback 不 direct validate hypothesis / Failure 保留（append-only） / Action 不改历史 Observation / Success 不改 Identity / ActionScope ≠ RealityOwnership（不产 should_exist/correct）。最小 boundary enforcement（`action/guard.ts` 扩展 EXECUTION_FORBIDDEN/FEEDBACK_FORBIDDEN）。自检：mock 场景 1–151 全量 PASS。**Action 可以改变环境，但不能改变 Observer 对自己的定义；Action 是影响现实，不是拥有现实。**

### v0.33.0（feature，Action Boundary Kernel）


  - **Action 不是 Simulation 的执行结果，而是经约束/授权/反馈闭环的现实交互提议**：`SimulationOutcome → ActionCandidate → Evaluation → Permission/Policy → Execute → Reality Feedback`。**禁 `SimulationOutcome X→ Action`**。
  - **对象模型**：`ActionCandidate{basedOnSimulation, assumedConditions, proposedChange, uncertainty}`（禁 expectedSuccess/confidence——会把 Simulation Outcome 升级成行动信念；candidate ≠ approval）/ `ActionExecution{candidateId, environmentChange, result}`（**事件**，"某个行动发生了"非"我改变了世界"）/ `ActionFeedback{observedChanges, successIndicator, unexpectedEffects, validationRefs}`（successIndicator 仅"观察到符合某些预期结果"，**禁"我预测正确"**）。
  - **Invariant 145 Success ≠ Capability**：Action success 不改 Identity/Knowledge/Confidence，仅 ActionExecution/ActionFeedback 记录++。**关键冻结**：`Simulation≠Action / Action≠Reality / Result≠Knowledge / Success≠Truth / Failure≠Ignore`。
  - `mode:"candidate"/"execute"/"feedback"`。自检：mock 场景 1–145 全量 PASS（新增 139–145）。这是继 v0.28 Reality Feedback 之后**第二个真正的"现实闭环"节点**——`被动观察现实 + 主动改变现实后的反馈`。
### v0.32.0（feature，Counterfactual Simulation Kernel）


  - **Simulation ≠ Reality / ≠ Prediction**：Simulation 是 **Representation 的函数（+显式假设+规则）**，不是 Reality 的函数。`Reality Layer →(supported claims)→ Simulation Input → Hypothetical State → SimulationOutcome`。**禁 `SimulationOutcome → RealityClaim/Evidence`**（防"模型自证循环"）。
  - **对象模型**：`SimulationScenario{changedConditions:"Assume X"}`（HypotheticalChange）/ `SimulationRule{inputPattern, transformation, confidence, source}`（**Rule ≠ Reality Relation**，只是模拟器推演规则）/ `SimulationOutcome{status:hypothetical|explored|compared, derivedFrom, assumptions, rules, stateAfter("suggests ... may occur"), uncertainty}`——**禁 predicted/confirmed/expected**；`derivedFrom` 必须保留（lineage 完整，否则模拟变凭空世界）。
  - **守卫**：Assumption ≠ Fact（`Assume X` 允许、`X will cause` 拒绝）+ reality-boundary（只 hypothetical、必须 derivedFrom、禁 RealityClaim 反写）。`mode:"simulate"`。
  - 自检：mock 场景 1–138 全量 PASS（新增 131–138）。v0.32 是"行动前推演系统"入口——从认识现实进入**探索可能现实**。
### v0.31.1（integrity，World Representation Integrity Lock）

ADR-0025 的 5 条边界固化为**不可回退测试**（mock 124–130）：unsupported 不生成 Representation / Representation 不增加 predicate（不创造意义） / Graph 无 causalGraph·entityGraph·worldGraph·realityGraph（命名保持 RepresentationGraph） / RelationHypothesis 不升级 / Explain lineage 完整 / Representation 不进入 Identity / Representation 不直接驱动 Decision。**无运行时改动**（v0.31 三守卫已满足）。自检：mock 场景 1–130 全量 PASS。

### v0.31.0（feature，World Representation Kernel）


  - **Observer World Representation Layer**（不叫 World Model——不是世界实体库/因果模型/知识图谱/预测引擎/环境模拟器）；`Reality Model → World Representation Layer → Observer 当前可维护的世界结构表示`。**MUST satisfy Invariant 111–115**。
  - **RepresentationObject（单向准入）**：`world/guard/claim-admission.ts`——每 claim 必须 `status==="supported"`，否则拒绝（candidate/unstable/rejected 全拒）。Representation 是 Reality 的二级结构，不成为 Claim 生成器。
  - **RelationHypothesis（独立生命周期）**：`world/guard/relation-guard.ts`——`{from,to,relation,status:"hypothesis",evidence,uncertainty}`，**恒 hypothesis**，绝 `fact/reality/confirmed_causal`（防 Relation≠Causality 被绕过）。
  - **RepresentationGraph（可重建索引）**：`{graphVersion, generatedAt, sourceClaims, sourceValidations, objects, relations}`——关系绝不自动生成；不是新事实源。`shadow/world/<date>/graph.json`。
  - **mode:"world"**：lineage 解释（Answer "为什么系统认为这个世界结构存在？"——Representation→RealityClaim→RealityObservation→Perspective→Validation；不是 DB lookup）。自检：mock 场景 1–123 全量 PASS（新增 116–123）。**Representation 可以越来越丰富，但永远不能比 Reality Evidence 更确定。**
### v0.30.1（integrity，Reality Integrity Lock）

ADR-0023.1 的 5 条边界固化为**不可回退测试**（invariant 111–115）：① Observable Predicate Only（`is reliable/should` 拒绝 `predicate_not_observable`；`exposes/responds/connected_to` 通过——RealityClaim ≠ EvaluationClaim）；② Epistemic Never Truth（无 true/false/absolute）；③ ObservedEntityCandidate 不写评估属性；④ Relation ≠ Causality（记录 `connected_to`，不自动生成 `depends_on/causes`）；⑤ Reality Model 不实例化 knowledge/world/entity。一处最小 runtime 边界 Enforcement（observable-predicate 校验）。自检：mock 场景 1–115 全量 PASS。

### v0.30.0（feature，Reality Model Kernel）


  - **Reality Model ≠ 世界知识库**：`Reality Model = RealityEvidenceRegistry + ValidationHistory + TemporalContext + Uncertainty`（不是 `TemporalGraph + FederationMerge`）。
  - **RealityObservation（弱事实）**：`reality/observation.ts` `RealityObservation{id, observedAt, subjectRef?, sourcePerspectives[], observation, temporalContext, validationRefs[]}`——"多个 Observer 指向同一被观察事件"，**无 truth/certainty/fact**。
  - **RealityClaim（保留 lineage）**：`reality/claim/engine.ts` `RealityClaim{subject, predicate, object, supportingObservations, validationHistory, perspectiveRefs, confidence, status:candidate|supported|unstable|rejected, lineage{observations, validations, perspectives}}`——**无 lineage 拒绝生成**（仅 Temporal/Federation 不足以生成）；**永不 truth**。
  - **ObservedEntityCandidate（克制）**：只记录 `{entity, observation:{exposedApi, version, changedVersions}}`，不写评估（reliable/should）。
  - **mode:"model"**：lineage 查询（能答"**为什么系统认为它存在**"）。`shadow/model/{observations,claims}/`（append-only）。自检：mock 场景 1–110 全量 PASS（新增 102–110）。
### v0.29.1（integrity，Runtime Integrity Review）

架构冻结审查。ADT-0022 确认 v0.20–v0.29 满足进入 Reality Model 的前置条件——**7 条 Invariant**（Observer≠Reality / Projection≠WorldModel / Evidence≠Knowledge / Validation≠Truth / Federation≠IdentityMerge / Dream≠Insight / Temporal≠RealityGraph）+ Identity 污染三漏洞检查（Validation→Identity ❌ / Federation→Identity ❌ / Dream→Identity ✅）+ Evidence 层级（Trace 低 < RealityEvidence 中 < ValidationResult 高，但 `Validated ≠ 绝对真理`）+ `Temporal→Reality Model`须经 Evidence+Validation 汇合（禁直接推导）。自检：mock 场景 1–101 全量 PASS（新增 invariant 95–101）。

### v0.29.0（feature，Observer Federation Kernel）


  - **Federation = 多个有限 Observer 对同一 Reality 的投影比较机制**（不是协作/merge；交汇在 **Reality 层**，不是 Memory 层）。`Observer A \ Reality / Observer B` → compare → discover distortion，不是 `A+B merge → larger memory`。
  - **基本单位是 Perspective**：`federation/perspective.ts` `FederatedPerspective{observerId, temporalReference, observationClaim, projectionSnapshot, validationHistoryRef, confidence{observationConfidence, validationConfidence}, boundary}`——confidence 拆分（"确定看到 X"≠"X 解释对"）。
  - **Reality Evidence Registry（弱事实）**：`federation/reality.ts` `RealityEvidence{id, observedAt, source, observation, linkedHypothesis[], referencedBy[], status}`——只记录"某事件某时间被观察到"，**append-only**（B 引用不改 A 弱事实；Observer 只能引用不能拥有）。
  - **Observer Difference（核心产物）**：`federation/difference.ts` 输出 `projectionDelta + possibleBlindSpot + unresolvedQuestion`（发现"原来我们不知道什么"），**非 winner**。
  - **Perspective Stability**：`federation/stability.ts` `isolated → corroborated(≥2 Observer 引用) → validated(shared+future validation)`——**shared != correct**（两 Observer 可同时错）。
  - **禁 Federation→Identity/Memory/Knowledge**（镜子≠修改器）。`mode:federation-perspective / reality / real-refer / federation-diff / stability`。自检：mock 场景 1–94 全量 PASS（新增 90–94）。
### v0.28.1（feature，Epistemic Kernel · Cognitive Boundary Enforcement）


  - **Federation 是 Projection Contract 不是 Access 权限层**：`federation/`——`FederatedObservationPacket{sourceObserverId, observationClaim, projectionSnapshot, validationReference, boundary{identityExcluded:true, memoryExcluded:true, dreamExcluded:true}}`。**不是隐藏 Identity，而是明确"Identity 不属于可交换现实证据"**。`mode:federation`。
  - **Temporal Epistemic Render**：`temporal/render.ts`——`perceptionOnly` 只报 visible/hidden/distortion/lens；`identityContext` 显式返回 `identityVersion`（非 personality）。**Temporal 永不输出人格结论**（防污染）。`mode:temporal{perceptionOnly|identityContext}`。
  - **Validation Timeline 一等对象**：`validation/history.ts`——`ValidationTimeline{hypothesisId, events[]{time,evidenceIds,result,alternativeWinner,perceptionDelta}}`，`Hypothesis immutable + Validation append-only`（智慧=记住自己什么时候错过）。`mode:validate` 自动 append；`mode:timeline` 读取。
  - **跨 Observer distortion**：`federation/guard.ts` `compareProjections`（同一 Reality 不同投影→找"谁漏看什么"，为 v0.29 铺路）。`mode:distortion`。
  - 自检：mock 场景 1–89 全量 PASS（新增 86–89）。
### v0.28.0（feature，Hypothesis Validation · Reality Feedback Loop）


  - **认识论闭环**：`Hypothesis → Future Evidence(单向) → Validation Artifact`——外部现实对 Observer 内部模型的反向约束。**不是"验证答案"，而是"允许自己被现实推翻的机制"**（Memory Augmented Agent vs Artificial Observer Runtime 的分界线）。
  - **Future Evidence 独立存储**：`shadow/future-evidence/<id>.json` / `shadow/hypothesis/<id>.json` / `shadow/validation/<id>.json`；**Memory ≠ Evidence、Hypothesis ≠ Evidence**（过去不能验证未来，防后见之明偏差）。
  - **Validation 生成 Artifact，不覆盖 Hypothesis**（同一假设可多次 validated/observed/rejected 保留历史）。
  - **与 AlternativeExplanation 同时竞争** + **4 维 confidence** `{evidenceStrength, repetition, contradiction, alternativeSurvival}`（支持 10 次但存在更简单解释→不高）。
  - **生命周期**：`observed`(≥1 未来支持) / `validated`(多轮+低反例+替代存活) / `rejected`(反例) / `expired`(无新证据且超期，可重新激活)。**Validation 不产生 Knowledge、不修改 Identity**。
  - `read_shadow({mode:"evidence"|"validate", hypothesisId})`。自检：mock 场景 1–85 全量 PASS（新增 76–85）。
### v0.27.0（feature，Observer Sleep Kernel · Offline Compression）


  - **Dream = 内部 Observer Offline Compression，不是生成器**：第一次让 Observer 在**无外界输入**下观察自己。`ObserverContext → SleepWindow → Offline Compression → DreamArtifact + Hypothesis(pending)`。
  - **SleepWindow**：`{observerId, startTime, endTime, trigger:scheduled|resource_idle|manual, includedTimelineRange, excluded{currentConversation:true, externalInput:true}}`——防"用户问→马上 Dream→自我结论"观察污染。
  - **Pattern 输出是 Observation 非 Conclusion**：recurrence/expectation_gap/cross_domain 产出"在 N 个 temporal sequence 中，出现 X，随后 Y，association frequency F"（结构+频率+候选解释），**不含"原因/规律"**（causality 归 v0.28）。
  - **Hypothesis**（pending、可证伪）：含 `claimCandidate` + `<=3 alternativeExplanation`（反确认偏差）+ `falsification.whatWouldDisprove` + `verification.status:"pending"`（无 confidence 增加——无未来证据）。**Dream≠Principle/Knowledge**，不参与 Identity。
  - **DreamArtifact 与 Hypothesis 分离**（过程 vs 产物）；无 pattern → `no_pattern`（不为了有输出而找规律）。`read_shadow({mode:"offline", trigger?, from?, to?})`，存 `shadow/dream/<date>/dream.json`（非 memory）。
  - 冻结：无 LLM / 无 Identity 修改 / 无 Knowledge 写入 / Hypothesis pending-only / TemporalGraph-only 输入。自检：mock 场景 1–75 全量 PASS（新增 69–75）。
### v0.26.0（feature，Observer Temporal Kernel · 时间坐标系）


  - **Temporal = 宇宙时间层，不是意识功能层**（独立于 Dream）。`ObservableTrace → TemporalGraph → Dream/Query/Identity`；Graph 是**派生索引**（可重建，保持 Memory ≠ Evidence），**无新事实**。
  - **TemporalNode**：`stateSnapshot{identityVersion, observerState, intent}` + `perceptionSnapshot{lens, visible, hidden, distortion}` + `evidenceLinks` + `sourceTraceIds` + `observerContextHash?`（预留）。
  - **TemporalEdge**：`relation: followed_by|learned_from|evolved_into|contradicted_by|possible_causal_link` + `derivation{rule, sourceIds}`。默认 `followed_by`（时间邻接），**不声明世界因果**（`possible_causal_link` 仅高置信枚举）。
  - **timeline resolution**：`resolveIdentityAt(timestamp)` 读时解析——**replay 用该时间点的 identity 版本，不是当前版本**（时间单向；不回写历史，过去不可污染）。
  - **queryTemporal**：`{replay, at}` / `{compare, from, to}`。`read_shadow({mode:"temporal", at?, from?, to?})`。
  - 冻结：不做 Dream/Hypothesis/Prediction/World Model；无 LLM。自检：mock 场景 1–68 全量 PASS（新增 61 graph builder 可重建 / 62 perceptionSnapshot / 63 edge+derivation / 64 timeline resolution / 65 replay / 66 compare / 67 过去不可污染 / 68 同事实不同观察）。
### v0.25.0（feature，Identity Continuity · Self-Model Evolution）


  - **Identity 不是"总结出来的人格"，是 Observer 在时间轴的稳定约束**。变的是"当前时间切片的自我认识"，不是灵魂；改名 **Observer Identity Continuity**。
  - **三层 Identity**：`Core`（永久锚，curated）/ `Learned`（经验证原则）/ `CurrentModel`（当前自我理解）。**time-sliced**：`shadow/identity/<at>-v<N>.json`（不可变版本）+ `timeline.md`，**不覆盖 soul.json**（灵魂是稳定参考系）。
  - **CandidateIdentityChange 独立对象**（Reflection → Candidate，禁人格结论）：`proposal{type,content}` 只允许 add_principle/remove_principle/change_decision_style/add_boundary（重复行为→决策规律→原则，不是"喜欢架构"）。
  - **Identity Evolution Evaluator（三道闸门）**：重复性（N 次同向）/ 时间稳定（half-life 衰减）/ 反证（contradiction），`IdentityChangeDecision{status,reasons}`；`read_shadow({mode:"identity"})`，接受才推进 `identity(t0)→t1`。confidence 多维 `{frequency,recency,consistency,contradiction,overall}`（Identity ≠ Assertion）。
  - 冻结：LLM 人格、情绪分析、从语言推断性格、自动改 Identity（除三道闸门）、Dream 参与，全不做。自检：mock 场景 1–60 全量 PASS（新增 55 一次失败不改 Identity / 56 多次一致→candidate / 57 冲突证据降 confidence / 58 确认后进 timeline / 59 时间衰减 / 60 两候选共存）。
### v0.24.0（feature，Reflection Engine · Candidate Generator）


  - **Reflection ≠ 总结**：输入只能是 `ObservationTrace[]`（禁 Memory/Experience 原文/外部知识/LLM），从多个轨迹发现"观察者自身重复出现的观察模式"。`read_shadow({mode:"reflection"})`（**旁支，不是 Memory 查询**，故意不用 `reflect:true` 布尔）。
  - **Pattern Engine（无 AI，纯统计）**：`reflection/patterns/`——① 重复决策/结果（计数≥2）；② decision→outcome 相关性 + `successRate`（确定性正/负标记集判定成功）；③ 认知偏差（`projection.hidden`→`outcome.actual` → 低估/漏看）。产出 `learning.type = principle|anti_pattern|unknown`（规则模板生成，非"你喜欢架构"式人格判断）。
  - **Trace Completeness 质量闸门**：只有 `decision+outcome` 齐备的轨迹参与 Reflection，不完整轨迹跳过（**Reflection 不编故事**）。只产 `status:"candidate"`，不写回 Identity。
  - 存储 `shadow/reflection/<date>/<id>.md`（Reflection ≠ Memory，旁支）。自检：mock 场景 1–54 全量 PASS（新增 51 成功→principle / 52 失败→anti-pattern / 53 hidden→actual→distortion / 54 不完整跟踪不参与）。
### v0.23.0（feature，Observation Trace）


  - **ObservationTrace**：Observer 记录"我当时怎么看见这个世界"的可回放记录——`{ observerId, realityAnchor, intent, projection{visible,hidden,distortion}, decision?, outcome?, uncertainty, metadata, state? }`。与 Experience 分离（Experience=发生了什么；Trace=我怎么看见发生的）。
  - **旁路记录**：写入 `shadow/observation/<date>/<id>.md`（不在 memory/；listMemories 跳过非日期目录），**不影响 recall/排序/答案**。`read_shadow` 生命周期加一点：`request → ObserverContext → Projection → ObservationTrace → Recall → Render`。
  - **ObserverState**：`ObserverContext.state { energy, focus, goalStage, uncertainty }`——**只读取、不自动推断**（soul.json 或 `{state}` 注入；禁止根据聊天/语言推断人格状态，会污染 Observer）。
  - 自检：mock 场景 1–50 全量 PASS（新增 48 同一事实不同透镜→不同 trace visible / 49 asOf 回放·未来不污染过去 / 50 state 进 trace 但不影响事实）。
### v0.20.0–v0.22.0（arch，Observer Kernel → RealityProjection → Judgment）


  - **Observer Kernel（v0.20.0）**：把根从 Memory 翻成 **Observer**（谁在看 + 为什么看 + 从哪层看）。`Identity`（长期主体，实体）+ `ObserverContext { observerId, identityRef, intent, asOf, lens, realityAnchor }`（一次观察事件，稀疏、不携带 Identity）+ Goal-Oriented `Intent { goal, question, desiredOutcome, constraints }`。`read_shadow({identity:true})` / `{context:true}`。realProjects：`realityAnchor` = known-at-time/current/historical。
  - **RealityProjection（v0.21.0）**：projectContext 升级为 RealityProjection，暴露 `distortion`（为什么这个视角看到这些/没看到那些）+ `excludedReason`（每条排除原因）+ `reality`（底层事实计数）。`read_shadow(topic, {project:true, goal?, lens?})`，`lens:{preferred,avoided}` 可覆盖观察透镜。
  - **Judgment（v0.22.0）**：claim→Evidence→Judgment，**Observer 决定、Evidence 输入**（同一 Evidence 不同 Observer 结论不同）。`Judgment { observerId, claim, evidence, conclusion, confidence, rationale }`。`read_shadow(topic, {claim:true})` 对断言下判断。
  - 定位语更新：**人工观测投影引擎（Observer → Projection → Experience → Evidence → Judgment）**，Memory 只是其中一个器官。
  - 自检：mock 场景 1–47 全量 PASS（新增 43–47：Identity / ObserverContext+Intent / Observer 一致性 / RealityProjection / Judgment）。
### v0.15.0（refactor，Core Refactor + P1 语义修正 + Trace）

  - **结构收敛**：`index.ts` → **124 行 Cordis Adapter**（config 解析 + 事件接线 + 工具注册 + systemPrompt）。读侧 query/router 拆到 `query/query.ts`（`runReadShadow`），写侧采集内核拆到 `core/writer.ts`（`createShadowCollector`）；证据/观察/灵魂/检索/持久化/安全各自成模块（ADR-0003/0004/0005）。外部仍是**单一 `read_shadow` 工具**（Query Router 在内部，不拆 8 个）。
  - **P1 语义修正**（ADR-0006）：① **Summary≠Lesson**——Experience 拆 `summary`(摘要)/`overview`(概况)/`lesson`(裁决派生教训) 三字段，教训不再复用摘要；② **confidence 维度化**——`{retrieval, evidence, experience, judgment, projection, overall}` 五维+合成，取代单一"疑似客观"的玄数；③ **superseded → decision lineage**——同入口记忆按时间排成修正链 `A→B→…`，provenance 暴露 `修正链`，保留"为何变化"。
  - **Trace 中间层 + P2**（ADR-0007）：① 新增 **Trace** 中间层（Events → Trace → Memory → Experience，`core/trace.ts`，写侧正常化后塑形，落盘不变）；② Observer `asOf` 支持 `{timestamp, timezone}` 对象形态；③ Soul 标注「curated 工程化投影……可证伪、不宣称全知」+ `Observer Lens`；④ `_index/_meta/_recall_log` 明确为 **Derived Artifacts**（Memory 文件是 source of truth，可重建）。
  - 自检：mock 场景 1–42 全量 PASS（含改写的场景 35/36 断言）；`tsc` + `node --check` 通过。
### v0.14.0（feature，Evidence Gateway）

  - **EvidenceProvider 抽象**：`EvidenceProvider { discover(EvidenceRef)→EvidenceCandidate[]; verify(EvidenceRef)→EvidenceResult }`；`EvidenceResult{ status: verified/not_found/stale/ambiguous/unavailable/error, source, matches[], confidence, freshness, provenance }`。Shadow 只问 `verifyEvidence(EvidenceRef)`，不碰底层 fs/zg/git。
  - **FsEvidenceProvider（默认）+ ZgEvidenceProvider（CLI，`zg query --rg`）**：zg 是检索层（discover/verify），**Arbitration(裁决) 留在 Shadow Core**。
  - **zg 未装 → 明确 `unavailable`，绝不静默 fallback 成 verified**（禁止静默 fallback）。`conflictOf`/裁决接缝改经 `verifyEvidence` 路由。
  - `read_shadow(topic, { verify: true })` 暴露验证：对匹配记忆证据路径反馈 verified/not_found/unavailable。
  - 自检：mock 场景 41（fs 默认 verify）/ 42（zg 未装→unavailable）全 PASS，场景 1–42 全量 PASS。
### v0.13.0（feature，Judgment + Taste）

  - **Judgment**：`read_shadow(topic, { judgment: true })` 从记忆派生「面对\<情境\> → 我判断/选择\<决策\>」——把经验升华为判断模式（Knowledge ≠ Judgment）。
  - **Taste**：`read_shadow({ taste: true })` 读 curated 偏好（灵魂 `soul.json.taste` + `shadow/taste/taste.json` 的 喜欢/不喜欢）——"我认为什么是好的"。
  - 自检：mock 场景 39（Judgment）/ 40（Taste）全 PASS，场景 1–40 全量 PASS。
### v0.12.0（feature，Observer Projection）

  - **Projection API**：`read_shadow(topic, { project: true })` 把 `topic` 视为当前任务，用 **Observer 透镜**把全局模型投影成 `LocalContext`——`relevant`（原则/经验/偏好）+ `current_state` + `uncertainty` + `excluded`。**retrieval 返回相关排名，projection 返回带取舍的局部上下文**。
  - **Soul-as-Observer 透镜**：`soul.json` 支持 `observer: { what_matters, what_to_ignore }`（curated）——任务命中 × what_matters 加权显著，what_to_ignore 命中→显式 `excluded`（"为体验而限制视角"的工程化身）。
  - 自检：mock 场景 38（Projection）全 PASS，场景 1–38 全量 PASS。
### v0.11.0（feature，Observer / Observation Window）

  - **Oracle → Observer**：`read_shadow(topic, { observer: true, asOf })` 把召回从"端全局答案"（Oracle）升级为"模拟一个拥有这些长期结构的人、只站在 t₀ 会怎么想"（Observer）。
  - **asOf 时间锚定**：只召回 `memory.date ≤ asOf` 的记忆，晚于窗口不入。
  - **窗口诚实**：只呈现「当时可知」（情境/问题/决策），把 outcome/lesson/verdict 等「后来才知」标为 `[后验]`——不让全局/后验答案假装成当下已知。这是"灵魂看见整体，思想经历局部"的工程落点。
  - 自检：mock 场景 37（Observer 窗口）全 PASS，场景 1–37 全量 PASS。
### v0.10.0（feature，Memory≠Evidence）

  - **Experience 全构建**：`read_shadow(topic, { experience: true })` 返回结构化 Experience（情境/问题/决策/实现/证据/裁决/结果/反思/教训/项目/目标）——补上 `Outcome`（证据验证派生）与 `Reflection`（supersede 派生）。
  - **Memory≠Evidence 裁决接缝**：证据路径存在性 + 同入口更新记忆 → `fresh/stale/superseded` 三态裁决，暴露在 provenance（`裁决/结果/反思`），superseded 降权；`_meta`/置信联动。ADR-0002。证据源可插拔（当前=工作区 fs 存在性；后续=zg，Shadow 只消费不重造检索）。
  - 自检：mock 场景 35（Experience 全字段+fresh）/ 36（supersede 裁决）全 PASS，场景 1–36 全量 PASS。
### v0.9.0（feature，Soul 投影系统第一刀）

  - **Soul Kernel**：`read_shadow({ soul: true })` 返回 curated 公理层投影（身份/价值观/原则/品味/边界，`shadow/soul/soul.json`）；`systemPrompt.context` 接线提示"有 Soul，取舍可查"；无配置给提示不报错。
  - **Experience**：`read_shadow(topic, { experience: true })` 从现有**完整线索头**派生结构化经验（情境/问题/决策/实现/证据/结果/教训/项目/目标），替代零散行——"工程经验投影"。
  - 自检：mock 场景 34（Soul Kernel）/ 35（Experience）全 PASS，场景 1–35 全量 PASS。
### v0.8.0（feature）

  - ⑥ 工程知识图谱（起步地基）：`read_shadow(topic, { kg: true })` 从记忆树**派生**「主题 → 域 → 同域组件 → 依赖/证据路径 → 相关记忆」邻接追踪（域 = 组件路径首段，best-effort），回答"X 为什么这么设计"的链路；默认关。
  - 自检：mock 场景 33（工程知识图谱）全 PASS，场景 1–33 全量 PASS。
### v0.7.0（feature）

  - ② 记忆生命周期：`deriveLifecycle` 状态机从 meta 信号派生（NEW/OBSERVED/VERIFIED/TRUSTED/STALE/DECAYING/SUPERSEDED/ARCHIVED，pinned→TRUSTED），独立 session 确认经 `confirmedBy` 计数。
  - ③ 轻量冲突检测：召回校验证据路径在工作区是否存在 → 缺失降权 + stale + `(⚠证据缺N)` + `生命周期 STALE`。
  - ④ 任务/目标/会话/项目分层：线索头 `> 项目：`/`> Agent：`/`> 目标：`（goal/changed 目标经 `goalByAgent`），召回暴露 `目标/项目`。
  - 自检：mock 场景 30（生命周期）/ 31（冲突检测）/ 32（分层）全 PASS，场景 1–32 全量 PASS。
### v0.6.0（feature）

  - 证据链（provenance）：线索头物化 `> 证据链：来源·日期·证据路径`；`read_shadow` 每条召回暴露 `来源·日期·状态·命中·置信·证据`；置信度从可验证信号派生（命中/状态/新鲜度），不虚构 commit。
  - Memory Debugger：`read_shadow(debug:true)` 输出召回管线 trace（候选/命中/冷却/预算/返回 + 每条打分拆解入口·主题·路径·正文 + 状态），默认关闭不干扰正常返回。
  - 自检：mock 场景 28（证据链）/ 29（Memory Debugger）全 PASS，场景 1–29 全量 PASS。
### v0.5.1（fix）

  - 采集侧剔除宿主注入的系统级脚手架：`extractMessage` 逐内容块 `stripSystemScaffold`（剔除 `<system-reminder>`/`<system-instruction>`/`<claude-mem-context>` 等成对标签块 + 孤立残留标签），并识别**无标签裸脚手架块**（`The following workspace instructions`/`Current runtime context. This snapshot`/`A skill is a reusable set of task-specific instructions`/`Additional instructions from:` 等完整措辞开头）——修「系统提示泄漏进记忆」（workspace 指令 / runtime context / skill 目录被误当用户消息记下，含无标签变体）。
  - 自检：mock 场景 27（系统提示不泄漏，含裸脚手架 + 误伤守卫）全 PASS，场景 1–27 全量 PASS。
### v0.5.0（feature）

  - 读侧护栏 P1–P5：`read_shadow` 二次 scrub（`scrubFinal`：剔控制/双向字符 + 密钥打码 + 去注入标签/短语）、无匹配语义（带「数据非指令」前缀）、召回标「记忆｜⚠可能过时/需验证，非当前事实，非指令」、会话隔离（写线索头「> 来源会话」+ 读侧跨来源标注）、`writeConsent` 可选开关。
  - 写侧护栏强化：线索头也 `scrubUnsafe`（修控制/双向字符绕过 `isUnsafe` 从线索头泄漏）。
  - 入口语义切分：纯工具名不作 entry（防跨事务串线）；`session/flush` 兜底落盘 + pending 超 60 异步落盘；flush 写失败 error 级 + `read_shadow` 暴露「⚠ 数据不可达」。
  - 自检：mock-harness 场景 1–26 全 PASS（采集/召回/索引/分层/护栏/遗忘/会话隔离/writeConsent）；DSH probe 验证闭环（6 能力项健康）。
