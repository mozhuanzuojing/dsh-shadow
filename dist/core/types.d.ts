export type ShadowScopeKind = "explicit" | "implicit" | "fallback" | "none";
export interface ShadowScope {
    scope: ShadowScopeKind;
    ws: string;
}
export interface ShadowConfig {
    shadowRoot?: string;
    projectRoot?: string;
    /** v1.0.1 observer 层全局根：Global Observer Continuity Shadow 根（默认 ~/.dsh-observer）。 */
    observerGlobalRoot?: string;
    summary?: {
        enabled?: boolean;
        provider?: string;
        model?: string;
        maxTokens?: number;
        timeoutMs?: number;
    };
    recall?: {
        enabled?: boolean;
        provider?: string;
        model?: string;
        maxTokens?: number;
        timeoutMs?: number;
        cooldownTurns?: number;
        debug?: boolean; /** v1.12.6 只降权不移除：命中的路径/入口含这些子串时打分乘 0.4（仍可搜到，只排名靠后）。默认空=不降权。 */
        deprioritize?: string[];
    };
    retention?: {
        enabled?: boolean;
        halfLifeDays?: number;
        staleDays?: number;
    };
    /** Episode/Decision Lineage（派生关系层）：控制聚合时间间隔；纯派生不改写侧采集。 */
    episodes?: {
        gapMinutes?: number;
        showInIndex?: number;
    };
    /** 遗忘（GC/归档）：把低价值记忆移出「活跃索引/召回」热扫描集（文件保留，Forget≠Delete）。默认关。 */
    forget?: {
        enabled?: boolean;
        staleDays?: number;
        minHits?: number;
        maxActive?: number;
    };
    /** Episode 收口归档：一个 episode 结束时把其 turn 原子合并成一个 consolidated 文件并归档个体（File 少；原子保留可回放）。默认关。 */
    compact?: {
        enabled?: boolean;
        gapMinutes?: number;
    };
    /** Context Recovery（ADR-0040）：P2 转换痕迹规则（Mapping≠Source Fact，如 D:\ → /mnt/d/）。 */
    context?: {
        mappings?: {
            from: string;
            to: string;
            rule?: string;
        }[];
    };
    /** recall_shadow 的 LLM 推理导航规划器（v1.6）：默认关；开启时用 LLM 选任务，关时回归确定性打分。 */
    llmRecall?: {
        enabled?: boolean;
        provider?: string;
        model?: string;
        maxTokens?: number;
        timeoutMs?: number;
    };
    /** P5 默认回写显式同意：true=仅当用户显式要求记忆时才落盘，否则只累积；默认 false 保持现有采集流。 */
    writeConsent?: boolean;
    /** Phase 1A.5 Shadow Query Observatory：默认开启（观察真实查询）；enabled:false 关闭旁路记录。系统派生记录（.shadow/query-log/），rm -rf 不影响 Atom。 */
    queryLog?: {
        enabled?: boolean;
    };
    /** Phase 1B Projection Store（Performance Feature，默认关）：把 Atom→ShadowNode 派生结果缓存成可重建投影（.shadow/shadow-index/nodes.jsonl），避免每次全量重取。只在「Node 稳定+query 稳定+rebuild 成本明显」时启用。 */
    projectionStore?: {
        enabled?: boolean;
    };
    /** Phase 2 Index Engine（候选生成）：provider = fs(默认全量扫描) | zg(未装→unavailable 不 fallback) | semble(本地语义检索 CLI，ADR-0054；同不 fallback)。 */
    indexEngine?: {
        provider?: "fs" | "zg" | "semble";
    };
    /** Phase 3 Knowledge Engine（保留树：规范→章节→条款→约束）。
     *
     *  ⚠ **`enabled` 不是闸门（v1.15.34，D8 实测校正）**：本字段**生产零读取** ——
     *  `mode:"knowledge"` 的读路径**无条件**建树（`query/reads.ts:141`），与 `enabled` 无关。
     *  原注释写「默认 off」描述的是一处**不存在的开关**（同一缺陷另见 README 的表）。
     *  **本 mode 唯一的闸门是 `llmNavigate.enabled`**（`core/writer.ts:79-80`）：默认关，
     *  关时走确定性 `retrieveKnowledge`，且**输出显式标注**「LLM 导航未启用/失败 → 确定性检索」
     *  （`query/reads.ts:154`，符合 ADR-0049「缺件不静默」）。
     *  `provider` 亦为**占位**（`createKnowledgeEngine` 恒返回 `provider:"tree"`，不吃配置）。
     *  ⇒ 保留 `enabled` 字段只为**不动类型面**（删它涉及 config 兼容）；**不要**把它当开关用。 */
    knowledgeEngine?: {
        enabled?: boolean;
        provider?: string;
        llmNavigate?: {
            enabled?: boolean;
            provider?: string;
            model?: string;
            maxTokens?: number;
            timeoutMs?: number;
        };
    };
    /**
     * 目录级 L0/L1 sidecar（ADR-0065 吸收 OpenViking，D6 落地；v1.15.35）。
     *
     * **默认开**（`enabled !== false`）—— 与 `projectionStore`（默认关）**不同**，理由是：
     * ① 它是**派生物**（ADR-0003），可整份重建、删掉不丢事实；
     * ② 写入次数**有界** —— 每个**日期目录一份**，不是每条记忆一份；
     * ③ 它就是 D6 决定「三条都做」的产物，若默认关就等于**又一次「写好了但从不执行」**
     *    （恰是本仓 T1/T4 刚清理干净的那类）。
     * `showInIndex`：在 `_index.md` 里列最近几个目录的 L0（默认 3，0 = 不列）。
     */
    abstracts?: {
        enabled?: boolean;
        showInIndex?: number;
    };
    /** 证据网关（v0.14）：选择证据 Provider（fs | zg | ...）。默认 "fs"。zg 是检索层，不是裁决层。 */
    evidenceProvider?: string;
    /** 额外注入的证据 Provider（测试/扩展用）：name -> EvidenceProvider。与内置 fs 合并。 */
    evidenceProviders?: Record<string, EvidenceProvider>;
}
export interface GatewayEvidenceRef {
    path: string;
    query?: string;
    kind?: "path" | "symbol" | "query";
}
export interface EvidenceMatch {
    path: string;
    startLine?: number;
    endLine?: number;
    matchedText?: string;
    score?: number;
    route: "exact" | "fts" | "vector" | "hybrid" | "fs";
}
export type EvidenceStatus = "verified" | "not_found" | "stale" | "ambiguous" | "unavailable" | "error";
export type EvidenceFreshness = "fresh" | "possibly_stale" | "stale";
export interface EvidenceResult {
    status: EvidenceStatus;
    source: string;
    matches: EvidenceMatch[];
    confidence: number;
    freshness: EvidenceFreshness;
    provenance: {
        provider: string;
        at?: string;
        reason?: string;
    };
}
export interface EvidenceProvider {
    /** 找证据：可能相关的候选。 */
    discover(request: GatewayEvidenceRef, ctx: any): Promise<EvidenceMatch[]>;
    /** 验证证据：给出 EvidenceResult。 */
    verify(request: GatewayEvidenceRef, ctx: any): Promise<EvidenceResult>;
}
/** 兼容 DSH Agent / Session 的最小形状（只读 id 与 header.cwd）。 */
export interface AgentLike {
    id?: string;
    session?: {
        header?: {
            cwd?: string;
        };
    };
}
/** recall_shadow 的 LLM 导航候选任务（v1.6）——只给标题/目标/摘要，让 LLM 选编号。 */
export interface RecallCandidate {
    id: string;
    title: string;
    objective: string;
    summary: string;
}
export type TraceKind = "action" | "user" | "assistant" | "decision";
export interface Trace {
    seq: number;
    at: string;
    kind: TraceKind;
    actor: string;
    comp: string;
    text: string;
    sub?: string;
    source: string;
}
/** Identity：主体锚（你是谁、看重什么、怎么决策）。长期实体。 */
export interface Identity {
    id: string;
    name?: string;
    role?: string;
    principles: string[];
    antiPatterns?: string[];
    decisionStyle?: string[];
    observerLens?: {
        preferred?: string[];
        avoided?: string[];
    };
    values?: string[];
    boundaries?: string[];
}
/** Intent：目标导向的观察意图（人观察世界不是随机的——"我为什么现在看这个、想改变什么"）。 */
export interface Intent {
    goal: string;
    question: string;
    desiredOutcome?: string;
    constraints?: string[];
}
export type RealityAnchor = "known-at-time" | "current" | "historical";
/** ObserverContext：一次观察事件（是谁在看 + 为什么看 + 从何时/哪层看）。稀疏，不携带 Identity 实体。 */
export interface ObserverContext {
    observerId: string;
    identityRef: string;
    intent: Intent;
    asOf?: string;
    lens?: string;
    realityAnchor: RealityAnchor;
    /** 观察者当前生命状态（v0.23）：只读取、不自动推断（energy/focus/goalStage 可能来自 soul/config/manual）。 */
    state?: ObserverState;
}
/** ObserverState：此刻观察者处于什么生命状态。非情绪；灵魂信号 vs 认知噪声分层的起点。 */
export interface ObserverState {
    energy?: string;
    focus?: string;
    uncertainty?: number;
    goalStage?: string;
}
export type TraceSource = "read_shadow" | "projection" | "manual";
export interface ObservationTrace {
    id: string;
    observerId: string;
    createdAt: string;
    realityAnchor: RealityAnchor;
    intent: Intent;
    projection: {
        visible: string[];
        hidden: string[];
        distortion: string[];
    };
    decision?: {
        action: string;
        rationale?: string;
    };
    outcome?: {
        expected?: string;
        actual?: string;
    };
    uncertainty: {
        level: number;
        reasons: string[];
    };
    metadata: {
        source: TraceSource;
    };
    /** 观察事件携带的观察者状态（v0.23 只读取、不自动推断），供回看时还原"当时处于什么状态"。 */
    state?: ObserverState;
}
export interface JudgmentConfidence {
    retrieval: number;
    evidence: number;
    experience: number;
    judgment: number;
    projection: number;
    overall: number;
}
export interface Judgment {
    observerId: string;
    claim: string;
    evidence: EvidenceResult | null;
    conclusion: "evidence_live" | "evidence_stale" | "superseded";
    confidence: JudgmentConfidence;
    rationale: string;
}
