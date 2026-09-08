/**
 * dsh-shadow — agent「思维/上下文/灵魂」的投影，落成「一切皆文件」的记忆树。
 *
 * Cordis host plugin entry（Cordis Adapter，薄）：config 解析 + 事件接线 + 工具注册 + systemPrompt。
 * 领域内核已拆出：
 *   - 写侧采集 → core/writer.ts（createShadowCollector：事件 → pending → flush → 索引/摘要/meta）
 *   - 读侧查询 → query/query.ts（runReadShadow：多模式分派 + 召回管线）
 *   - 其余（evidence/observer/soul/retrieval/persistence/security）为独立模块。
 *
 * 哲学：一切皆文件，这只是思维/上下文/灵魂的投影。
 * 记忆以「入口点 + 时间」为纲、思维/决策为正文、动作为背景。
 *   - 每条记忆 = 一个文件：.shadow/<日期>/<时刻>-<入口slug>.md
 *   - .shadow/_index.md = 说明文档 + 近期记忆 + 主题索引 + 意识轨迹
 *   - read_shadow：无参读索引；带 topic/entry 穿透到具体记忆文件
 *
 * 采集来源（按可靠度）：
 *   - fs/observed   → 入口点（实际改/读的组件，客观锚）
 *   - goal/changed  → 决策/意向
 *   - tools/result  → 动作背景
 *   - session/event → 交互 + 思维落点（按 SessionEvent 契约抽 text 块，跳过 reasoning）
 *
 * 类型化迁移：源码 index.ts → tsc → dist/index.js（DSH/Cordis bundle 加载的是编译后 JS）。
 * resolver 契约（resolveShadowScope / resolveWorkspace）作为模块级导出，供测试直接引用。
 *
 * 零运行时依赖 @deepseek-ai/*：全部服务经 ctx.get / ctx.inject 读取。
 */
import { createShadowCollector } from "./core/writer.js";
import { routeVerify } from "./evidence/gateway.js";
import { runReadShadow } from "./query/query.js";
export { firstNonEmpty, resolveShadowScope, resolveWorkspace } from "./core/scope.js";
export { recordObservationTrace, renderObservationTrace } from "./observer/trace.js";
export { reflectOf, renderReflection } from "./reflection/engine.js";
export const name = "dsh-shadow";
export const inject = [];
export function apply(ctx, rawConfig = {}) {
    const context = ctx;
    // 配置读取：测试直接传 rawConfig；live 走 Cordis 的 ctx.config（插件行 config，经 cordis.patch.yml 注入）。
    const config = rawConfig && Object.keys(rawConfig).length
        ? rawConfig
        : (() => { try {
            return (ctx?.config ?? {});
        }
        catch {
            return {};
        } })() ?? {};
    const getAgentById = (id) => {
        if (!id)
            return undefined;
        try {
            return context.get("agents")?.get(id);
        }
        catch {
            return undefined;
        }
    };
    // 写侧采集内核：事件 → pending → flush 落盘（索引/摘要/meta 物化）。
    const collector = createShadowCollector({ context, config, getAgentById });
    context.on("fs/observed", collector.onFsObserved);
    context.on("tools/result", collector.onToolsResult);
    context.on("goal/changed", collector.onGoalChanged);
    context.on("session/event", collector.onSessionEvent);
    context.on("agent/turn-stopping", collector.onTurnStopping);
    context.on("session/flush", collector.onSessionFlush);
    // zg 是「眼睛/Evidence Sensor」；Arbitration(它意味着什么) 留在 Shadow Core。zg 未装 → 明确 unavailable，绝不静默 fallback。
    const verifyEvidence = (ref, ctx) => routeVerify(ref, ctx, config.evidenceProvider || "fs", config.evidenceProviders);
    // 读侧查询依赖注入（闭包型依赖在此构造；领域逻辑在 query/query.ts）。
    const queryDeps = {
        // 懒解析 fs：与写侧 collector（core/writer.ts:242）一致，在每次 runReadShadow 执行时才取。
        // 避免在 apply() 时急切快照得到 undefined 并永久固化进 queryDeps.fs，
        // 导致 read_shadow 恒命中 query/query.ts 的「（fs 服务不可用）」守卫（读写不对称 bug）。
        get fs() { return context.get("fs"); },
        config,
        cwdBySession: collector.cwdBySession,
        getFlushWarn: collector.getFlushWarn,
        verifyEvidence,
        expandTerms: collector.expandTerms,
        recallSelect: collector.recallSelect,
        knowledgeNavigate: collector.knowledgeNavigate,
        ensureIndex: (ws) => collector.ensureIndex(ws),
    };
    if (typeof context.inject === "function") {
        context.inject(["tools"], (toolsCtx) => {
            const toolsService = toolsCtx.get("tools");
            if (!toolsService)
                return;
            toolsService.register({
                name: "read_shadow",
                description: "读取 agent 的记忆树（shadow）。无参数返回目录与索引；带 topic/entry 按入口或主题穿透到具体记忆文件。穿透按分层召回（先精后深、预算内返回）：低分记忆只给摘要，高分记忆给摘要+命中片段+正文骨架。当判断上下文不足、需要回忆最近想过/决定过什么时调用。",
                parameters: {
                    type: "object",
                    properties: {
                        topic: { type: "string", description: "要穿透的入口/主题（如某路径片段、组件名、工具名、决策词）" },
                        limit: { type: "number", description: "最多返回的记忆文件数，默认 10" },
                        max_tokens: { type: "number", description: "召回内容预算（粗略 token 数），越大返回越深，默认 1600" },
                        debug: { type: "boolean", description: "开启召回管线调试：返回 候选/命中/冷却/预算/返回 计数 + 每条召回「为什么命中/为什么被降权」的拆解。默认关。" },
                        kg: { type: "boolean", description: "返回工程知识图谱（派生）追踪：主题 → 域 → 组件 → 依赖/相关记忆。默认关。" },
                        soul: { type: "boolean", description: "返回 Soul Kernel（身份/价值观/原则/品味/边界）投影。默认关。" },
                        experience: { type: "boolean", description: "返回结构化 Experience（情境/问题/决策/实现/证据/结果/教训），而非零散行。默认关。" },
                        asOf: { type: "string", description: "时间锚定（YYYY-MM-DD）：只召回该时间点『当时可知』的记忆；晚于此的记忆不入窗口。默认=现在。" },
                        observer: { type: "boolean", description: "Observer/Observation Window：以『当时可知』呈现（as-of），并把 outcome/lesson/verdict 等『后来才知』标为 [后验]，不让全局/后验知识假装成当下可知。默认关。" },
                        project: { type: "boolean", description: "Projection：把 topic 视为当前任务，返回 LocalContext（relevant 原则/经验/偏好 + current_state + uncertainty + excluded），用 Observer 透镜算显著、显式排除。默认关。" },
                        judgment: { type: "boolean", description: "返回 Judgment 模式：从记忆派生「面对<情境> → 我判断/选择<决策>」，让经验形成判断。默认关。" },
                        claim: { type: "boolean", description: "返回 claim→Evidence→Judgment：对每条匹配记忆的断言验证证据，由 Observer 决定结论/置信/理由（Evidence 是输入，Observer 下判断）。默认关。" },
                        taste: { type: "boolean", description: "返回 Taste 偏好（curated：灵魂 taste + .shadow/taste/taste.json），即「我认为什么是好的」。默认关。" },
                        verify: { type: "boolean", description: "返回 Evidence Result：经 Evidence Gateway 验证匹配记忆的证据路径，报告 verified/not_found/unavailable；zg 未装→unavailable，绝不静默 fallback。默认关。" },
                        identity: { type: "boolean", description: "返回 Identity 主体锚（id/价值观/原则/反模式/决策风格/边界/Observer Lens），长期实体。默认关。" },
                        context: { type: "boolean", description: "返回 ObserverContext（observerId/identityRef/intent/asOf/lens/realityAnchor）——一次观察事件。默认关。" },
                        goal: { type: "string", description: "观察意图 goal（我想改变什么），与 topic 合成 Intent。默认按模式推断。" },
                        realityAnchor: { type: "string", description: "观察现实层 known-at-time（当时可知）/current（当前）/historical（史观）。默认按 asOf/observer 推断。" },
                        lens: { type: "object", description: "覆盖 Observer 透镜 {preferred, avoided}（如 架构师/产品 视角），影响 Projection visible/hidden。默认关。" },
                        state: { type: "object", description: "ObserverState {energy, focus, goalStage, uncertainty}——只读取、不自动推断；可经 soul.json 或此处注入。默认关。" },
                        mode: { type: "string", description: "模式开关：reflection 时从历史 ObservationTrace 发现候选规律（旁支，非 Memory 查询）；配合从 from/to 限定周期。agency-context/agency-select/agency-event 时是 Agency Boundary Kernel（可解释行动能力，非 Autonomous Agent）。delegation-context/delegation-check/delegation-event 时是 Delegated Execution Boundary。recall-forget/recall-event/recall-validation 时是 Recall Continuity（Access Transition，非 Reality Reconstruction；非 Memory Kernel）。adapt-context/adapt-change/adapt-validation 时是 Controlled Adaptation（行为策略调整，非身份/目标演化；不提升 epistemic/authority）。horizon-context/horizon-summary/horizon-event/horizon-link 时是 Long Horizon Interaction（时间可增加经验，但不能增加主体性；Longer≠MoreAuthority/History≠Purpose/Experience≠Identity）。episode 时返回 Episode Lineage（把 Event/Turn 级记忆原子按「项目/会话+时间间隔」串成连续任务；派生式，不写回记忆文件）；decision 时返回 Decision Lineage（把「决策」提升为可追踪血缘：goal 事件+用户拍板，按入口聚合；派生式）。task 时返回 Task Lifecycle（ADR-0039：把记忆派生为任务生命周期一等视图——title/trigger/objective/constraints/status/决策链/观测结果；结果只记观察，不做成/败判断；派生式投影）。context 时返回 Context Recovery（ADR-0040：把证据路径派生成 ContextReference——subject/value/source(来源)/status(validated|stale|unknown 经 fs 复核)；P2 转换痕迹 Mapping≠Source Fact 标注规则；回答「以前知道的东西现在还能不能作为行动依据」）。recall 时是 Shadow Usability「记忆恢复」统一入口（Task Recovery Bundle——任务/状态/关键决定/证据/观测结果/当前注意，人类友好；内容全来自派生数据，不 LLM 补写理由/事实/判断）。query 时是 Shadow Projection / shadow.query（phase 1A：把记忆派生成统一 ShadowNode（memory/decision/code/document），跨类型查询并返回带 evidence 的 context——Node 是派生投影，非事实源，可追溯）。query-log 时是 Shadow Query Observatory（phase 1A.5：只读汇总 shadow_query 的旁路观测——命中/证据/关系/类型分布 + 重复查询的 Node 稳定性，帮判断 nodes 结构能否定型；观测记录在 .shadow/query-log/，rm -rf 不影响 Atom）。shadow-report 时是 Shadow Fitness Report（phase 1A.6：把 query-log 聚合 + 扫记忆做 missing-types 启发式，生成 .shadow/shadow-report.md——Evidence Density/稳定性/类型分布/潜在缺失类型，作为是否升级索引层的客观依据；只诊断、增强，判定是启发式观察非结论）。否则按布尔参数分派。" },
                        from: { type: "string", description: "Reflection 周期起点（YYYY-MM-DD），与 mode:reflection 配合。" },
                        to: { type: "string", description: "Reflection 周期终点（YYYY-MM-DD），与 mode:reflection 配合；默认今天。" },
                        minCount: { type: "number", description: "Identity 重复性闸门：同向轨迹最小次数（默认 5）。与 mode:identity 配合。" },
                        minRecency: { type: "number", description: "Identity 时间稳定闸门：recency 下限（默认 0.4）。与 mode:identity 配合。" },
                        maxContradiction: { type: "number", description: "Identity 反证闸门：contradiction 上限（默认 0.3）。与 mode:identity 配合。" },
                        halfLifeDays: { type: "number", description: "Identity 时间衰减半衰期（天，默认 90）。与 mode:identity 配合。" },
                        at: { type: "string", description: "Temporal replay 时间点（YYYY-MM-DD），与 mode:temporal 配合。" },
                        trigger: { type: "string", description: "SleepWindow 触发类型 scheduled|resource_idle|manual（默认 scheduled）。与 mode:offline 配合。" },
                        hypothesisId: { type: "string", description: "Hypothesis id：与 mode:validate（验证该假设）或 mode:evidence（为其注册未来证据）配合。" },
                        observedAt: { type: "string", description: "FutureEvidence 观察时间（YYYY-MM-DD），与 mode:evidence 配合。" },
                        actualOutcome: { type: "string", description: "FutureEvidence 实际结果（决定 support/contradiction），与 mode:evidence 配合。" },
                        observationType: { type: "string", description: "FutureEvidence 观察类型，与 mode:evidence 配合。" },
                        sourceObserverId: { type: "string", description: "Federation 源 Observer id（与 mode:federation 配合）。" },
                        obsClaim: { type: "string", description: "Federation observationClaim（可交换：我看到什么）。与 mode:federation 配合。" },
                        visibleA: { type: "array", items: { type: "string" }, description: "Observer A 的 visible（与 mode:distortion 配合）。" },
                        visibleB: { type: "array", items: { type: "string" }, description: "Observer B 的 visible（与 mode:distortion 配合）。" },
                        targetObserverId: { type: "string", description: "Federation 目标 Observer id（与 mode:distortion 配合）。" },
                        perceptionOnly: { type: "boolean", description: "Temporal 只报 perceptive（可见/隐藏/透镜），不报人格。与 mode:temporal 配合。" },
                        identityContext: { type: "boolean", description: "Temporal 显式返回 identityVersion（非 personality）。与 mode:temporal 配合。" },
                        temporalReference: { type: "string", description: "Federation perspective 的时间坐标（与 mode:federation-perspective 配合）。" },
                        obsConfidence: { type: "number", description: "Federation 观测确信（observationConfidence），与 mode:federation-perspective 配合。" },
                        valConfidence: { type: "number", description: "Federation 解释确信（validationConfidence），与 mode:federation-perspective 配合。" },
                        observation: { type: "string", description: "Reality Evidence 弱事实（某事件在某时间被观察到），与 mode:reality 配合。" },
                        realityId: { type: "string", description: "Reality Evidence id（与 mode:real-refer / mode:stability 配合）。" },
                        realityEvidenceRef: { type: "string", description: "Observer Difference 的 reality evidence 引用（与 mode:federation-diff 配合）。" },
                        lensA: { type: "string", description: "Observer A 的 lens（与 mode:federation-diff 配合）。" },
                        lensB: { type: "string", description: "Observer B 的 lens（与 mode:federation-diff 配合）。" },
                        obsClaimB: { type: "string", description: "Observer B 的 observationClaim（与 mode:federation-diff 配合）。" },
                        linkedHypothesis: { type: "array", items: { type: "string" }, description: "Reality Evidence 关联的 hypothesis（与 mode:reality 配合）。" },
                        hasValidation: { type: "boolean", description: "Perspective Stability 是否有 ValidationResult 支撑（与 mode:stability 配合）。" },
                        subject: { type: "string", description: "Reality 主体（subjectRef/subject），与 mode:reality-observation / mode:reality-claim / mode:reality 配合。" },
                        sourcePerspectives: { type: "array", items: { type: "string" }, description: "RealityObservation 的来源 perspectives（与 mode:reality-observation 配合）。" },
                        temporalContext: { type: "string", description: "RealityObservation 时间上下文（与 mode:reality-observation 配合）。" },
                        validationRefs: { type: "array", items: { type: "string" }, description: "RealityObservation 关联的 validation 引用（与 mode:reality-observation 配合）。" },
                        claimId: { type: "string", description: "RealityClaim id（与 mode:model 查询配合）。" },
                        relation: { type: "string", description: "RelationHypothesis 关系（如 depends_on；与 mode:world-relation 配合）。" },
                        evidence: { type: "array", items: { type: "string" }, description: "RelationHypothesis 证据（RealityClaim id，与 mode:world-relation 配合）。" },
                        condition: { type: "string", description: "Simulation 条件（须 'Assume X'，禁 'X will cause'；与 mode:simulate 配合）。" },
                        basedOn: { type: "array", items: { type: "string" }, description: "Simulation basedOn（Representation id，lineage 从属；与 mode:simulate 配合）。" },
                        proposal: { type: "string", description: "ActionCandidate proposedChange（与 mode:candidate 配合）。" },
                        proposedChange: { type: "string", description: "ActionCandidate proposedChange（与 mode:candidate 配合）。" },
                        basedOnSimulation: { type: "array", items: { type: "string" }, description: "ActionCandidate basedOnSimulation（SimulationOutcome id；与 mode:candidate 配合）。" },
                        candidateId: { type: "string", description: "ActionExecution candidateId（需先 mode:candidate 批准；与 mode:execute 配合）。" },
                        environmentChange: { type: "string", description: "ActionExecution 环境变化（事件，非'我改变了世界'；与 mode:execute 配合）。" },
                        executionId: { type: "string", description: "ActionFeedback executionId（与 mode:feedback 配合）。" },
                        objective: { type: "string", description: "Planning objective（须外部来源；与 mode:plan 配合）。" },
                        objectiveSource: { type: "string", description: "Planning objective 来源（external/observer；observer 拒绝；与 mode:plan 配合）。" },
                        criteria: { type: "string", description: "Planning evaluation criteria（禁 better/optimal/best；与 mode:plan 配合）。" },
                        constraints: { type: "array", items: { type: "string" }, description: "Planning objective/constraints（与 mode:plan 配合）。" },
                        candidates: { type: "array", items: { type: "object" }, description: "Planning 候选（actionSequence/assumptions/constraints；无 score；与 mode:plan 配合）。" },
                        simulationRefs: { type: "array", items: { type: "string" }, description: "Planning simulationReferences（与 mode:plan 配合）。" },
                        observedChanges: { type: "array", items: { type: "string" }, description: "ActionFeedback 观察到的变化（与 mode:feedback 配合）。" },
                        successIndicator: { type: "string", description: "ActionFeedback successIndicator（仅'观察到符合某些预期结果'；禁'我预测正确'；与 mode:feedback 配合）。" },
                        unexpectedEffects: { type: "array", items: { type: "string" }, description: "ActionFeedback 意外效应（与 mode:feedback 配合）。" },
                        objectiveRef: { type: "string", description: "Agency objectiveRef（外部目标引用，禁 observer/self 自指；与 mode:agency-context/agency-event 配合）。" },
                        authoritySource: { type: "string", description: "Agency authoritySource（external/human/system/user；禁 observer/self；与 mode:agency-context 配合）。" },
                        authorityScope: { type: "string", description: "Agency authorityScope 授权范围（与 mode:agency-context 配合）。" },
                        reason: { type: "string", description: "AgencySelection reason（只允许 constraint_satisfied；禁 valuable/meaningful/better；与 mode:agency-select 配合）。" },
                        selectedCandidateId: { type: "string", description: "AgencySelection 选中的候选 id（与 mode:agency-select 配合）。" },
                        actionCandidate: { type: "string", description: "AgencyBoundaryEvent actionCandidate（与 mode:agency-event 配合）。" },
                        identityRef: { type: "string", description: "Agent 身份引用（用于 Authority≠Identity 校验；与 mode:agency-event 配合）。" },
                        constraintCheck: { type: "array", items: { type: "string" }, description: "AgencyBoundaryEvent 已过约束（与 mode:agency-event 配合）。" },
                        executionResult: { type: "string", description: "AgencyBoundaryEvent 执行结果（事件，禁 Autonomy/所有权声称；与 mode:agency-event 配合）。" },
                        delegationId: { type: "string", description: "DelegationContext 委派 id（与 mode:delegation-context/check/event 配合）。" },
                        allowedScope: { type: "array", items: { type: "string" }, description: "DelegationContext allowedScope 允许做什么（禁所有权；与 mode:delegation-context 配合）。" },
                        expiration: { type: "string", description: "DelegationContext expiration（YYYY-MM-DD，时间说停止；与 mode:delegation-context 配合）。" },
                        revocation: { type: "boolean", description: "DelegationContext revocation（撤销信号，优先于执行历史；与 mode:delegation-context 配合）。" },
                        action: { type: "string", description: "DelegationCheck 待检动作路径（与 mode:delegation-check 配合）。" },
                        satisfiedConstraints: { type: "array", items: { type: "string" }, description: "Delegation 已满足约束（与 mode:delegation-check/event 配合）。" },
                        now: { type: "string", description: "DelegationCheck 当前时间（YYYY-MM-DD，用于过期判定；与 mode:delegation-check 配合）。" },
                        originalRef: { type: "string", description: "ForgottenRecord originalRef（原记录引用；与 mode:recall-forget 配合）。" },
                        forgottenAt: { type: "string", description: "ForgottenRecord forgottenAt（YYYY-MM-DD；与 mode:recall-forget 配合）。" },
                        recalledRef: { type: "string", description: "RecallEvent recalledRef（忆起的已遗忘记录 id；与 mode:recall-event/recall-validation 配合）。" },
                        triggerType: { type: "string", description: "Recall trigger 类型（须 external/cue/conversation/explicit/association；禁 internal certainty/intuition；与 mode:recall-event 配合）。" },
                        sourceRef: { type: "string", description: "Recall trigger sourceRef（为什么想起来，必须存在；与 mode:recall-event 配合）。" },
                        observationRefs: { type: "array", items: { type: "string" }, description: "Recall lineage observationRefs（与 mode:recall-event 配合）。" },
                        status: { type: "string", description: "Recall 不提升证据等级：status/epistemicStatus/support 禁 supported/validated/certain（与 mode:recall-event 配合）。" },
                        sourceExperience: { type: "string", description: "AdaptationContext/AdaptationChange sourceExperience（调整依据；与 mode:adapt-context/adapt-change 配合）。" },
                        adaptationScope: { type: "string", description: "AdaptationContext adaptationScope（method/strategy/execution_pattern；禁 objective/authority/identity；与 mode:adapt-context 配合）。" },
                        target: { type: "string", description: "AdaptationChange target（method/strategy/execution_pattern；禁 objective/authority/identity/value；与 mode:adapt-change 配合）。" },
                        changeObserved: { type: "boolean", description: "AdaptationValidation changeObserved（变化发生了；与 mode:adapt-validation 配合）。" },
                        validationReferences: { type: "array", items: { type: "string" }, description: "AdaptationValidation validationReferences（与 mode:adapt-validation 配合）。" },
                        sideEffectsObserved: { type: "array", items: { type: "string" }, description: "AdaptationValidation 现实反馈（与 mode:adapt-validation 配合）。" },
                        basedOnHistory: { type: "array", items: { type: "string" }, description: "InteractionContext basedOnHistory（当前长期交互基于什么历史；与 mode:horizon-context 配合）。" },
                        sourceRefs: { type: "array", items: { type: "string" }, description: "HistorySummary sourceRefs（ObservationRef[]，摘要是访问辅助；与 mode:horizon-summary 配合）。" },
                        compressionMethod: { type: "string", description: "HistorySummary compressionMethod（与 mode:horizon-summary 配合）。" },
                        accessibility: { type: "string", description: "HistorySummary accessibility（available/forgotten/recalled；与 mode:horizon-summary 配合）。" },
                        historyRef: { type: "string", description: "HistoryContinuityEvent/InteractionAdaptationLink historyRef（与 mode:horizon-event/horizon-link 配合）。" },
                        previousAccessibility: { type: "string", description: "HistoryContinuityEvent previousAccessibility（与 mode:horizon-event 配合）。" },
                        recallRef: { type: "string", description: "HistoryContinuityEvent/InteractionAdaptationLink recallRef（与 mode:horizon-event/horizon-link 配合）。" },
                        adaptationRef: { type: "string", description: "HistoryContinuityEvent/InteractionAdaptationLink adaptationRef（与 mode:horizon-event/horizon-link 配合）。" },
                        interactionStyle: { type: "string", description: "ObserverConfig interactionStyle（configuration，非 preference；与 mode:observer-config 配合）。" },
                        outputPreference: { type: "string", description: "ObserverConfig outputPreference（如 adr；与 mode:observer-config 配合）。" },
                        defaultProtocol: { type: "string", description: "ObserverConfig defaultProtocol（如 boundary-first；与 mode:observer-config 配合）。" },
                        planningCannotCreateObjective: { type: "boolean", description: "ObserverBoundary 政策开关（与 mode:observer-boundary 配合）。" },
                        records: { type: "array", items: { type: "object" }, description: "RecallIndex records（{id, location}，导航非内容；与 mode:recall-index 配合）。" },
                        observerId: { type: "string", description: "ContinuityRecord observerId（与 mode:observer-lineage 配合）。" },
                        continuityRef: { type: "string", description: "ContinuityRecord continuityRef（与 mode:observer-lineage 配合）。" },
                        kind: { type: "string", description: "WorkspaceRecord kind（observation/representation/simulation/planning/action/interaction；与 mode:workspace-record 配合）。" },
                        content: { type: "string", description: "WorkspaceRecord content（world 层项目内容；与 mode:workspace-record 配合）。" },
                        evidenceRefs: { type: "array", items: { type: "string" }, description: "Verification evidenceRefs（运行的观察事件；禁 adaptation/permission/identity 变化措辞；与 mode:verify 配合）。" },
                        runtimeVersion: { type: "string", description: "VerificationRun runtimeVersion（与 mode:verify 配合）。" },
                    },
                },
                output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
                execute: (args, exec) => runReadShadow(queryDeps, args, exec),
            });
            // v1.5 Shadow Usability Layer：人类友好入口。隐藏 episode/decision/task/context 等底层模式，
            // 只给一句自然查询，返回「记忆恢复包（Task Recovery Bundle）」。内部 = read_shadow({mode:'recall', topic})。
            toolsService.register({
                name: "recall_shadow",
                description: "人类友好的「记忆恢复」入口：给一句自然语言查询（如『Todo清理』『上次 OAuth 问题』），返回一份与历史任务相关的恢复包——任务/状态/关键决定(含理由)/证据(当前是否仍有效)/观测结果/当前注意。内部把 read_shadow 的 episode/decision/task/context 视图合成一段可读内容；内容全来自派生数据，不 LLM 补写理由/事实/判断。需要快速找回『上次在做什么/为什么/做到哪』时用。",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "自然语言查询（任务/主题/入口，如『Todo清理』『上次 U8 补丁』）" },
                        limit: { type: "number", description: "最多返回的任务数，默认 1（返回最相关任务的恢复包）" },
                    },
                },
                output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
                execute: (args, exec) => runReadShadow(queryDeps, { mode: "recall", topic: String((args && args.query) || "").trim(), limit: args && args.limit }, exec),
            });
            // Phase 1A Shadow Projection：跨类型统一查询（memory/decision/code/document），返回带 evidence 的 context。
            // 内部 = read_shadow({mode:'query', topic, scope, limit})；Node 是派生投影（非事实源），可追溯。
            toolsService.register({
                name: "shadow_query",
                description: "跨类型的统一记忆查询（shadow.query）：给定查询词与可选 scope（memory/decision/code/document/concept），返回各组上下文的 ShadowNode 视图——每条带 evidence（指向源文件/文档/Atom），可追溯。Node 是派生投影，不是事实源。需要跨「历史决策+代码+规范+关系」地找上下文时用。",
                parameters: {
                    type: "object",
                    properties: {
                        query: { type: "string", description: "查询词（如 'appid secret 认证'）" },
                        scope: { type: "array", items: { type: "string" }, description: "限定类型：memory/decision/code/document/concept（不填=全部）" },
                        limit: { type: "number", description: "最多返回 context 条数，默认 8" },
                    },
                },
                output: { schema: { type: "string" }, render: (_args, value) => [{ type: "text", text: value }] },
                execute: (args, exec) => runReadShadow(queryDeps, { mode: "query", topic: String((args && args.query) || "").trim(), scope: args && args.scope, limit: args && args.limit }, exec),
            });
        });
    }
    if (typeof context.inject === "function") {
        context.inject(["systemPrompt"], (promptCtx) => {
            const systemPrompt = promptCtx.get("systemPrompt");
            if (!systemPrompt)
                return;
            systemPrompt.context({
                name: "dsh-shadow",
                order: 40,
                text: () => "你的思维、上下文与决策沉淀在 shadow 记忆树中。快速回忆最近在做什么/为什么/做到哪时，用 `recall_shadow(query)`（一句自然查询即可，如「上次 Todo 清理」），返回一份任务恢复包；需要精细穿透时再用 `read_shadow`（mode:episode/decision/task/context）。缺上下文、需要回忆最近想过/决定过什么、或回顾用户最近在往哪个方向走时，先调用它们再补充回答。" +
                    "你还有 Soul 投影（身份/价值观/原则/品味/边界，见 .shadow/soul/soul.json）：遇到取舍可 read_shadow({soul:true}) 参考，回应工程经历问题可用 read_shadow(topic, {experience:true})。",
            });
        });
    }
    return collector.cleanup;
}
