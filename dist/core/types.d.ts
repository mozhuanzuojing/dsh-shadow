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
        debug?: boolean;
    };
    retention?: {
        enabled?: boolean;
        halfLifeDays?: number;
        staleDays?: number;
    };
    /** P5 默认回写显式同意：true=仅当用户显式要求记忆时才落盘，否则只累积；默认 false 保持现有采集流。 */
    writeConsent?: boolean;
    /** 证据网关（v0.14）：选择证据 Provider（fs | zg | ...）。默认 "fs"。zg 是检索层，不是裁决层。 */
    evidenceProvider?: string;
    /** 额外注入的证据 Provider（测试/扩展用）：name -> EvidenceProvider。与内置 fs 合并。 */
    evidenceProviders?: Record<string, EvidenceProvider>;
}
export interface EvidenceRef {
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
    };
}
export interface EvidenceProvider {
    /** 找证据：可能相关的候选。 */
    discover(request: EvidenceRef, ctx: any): Promise<EvidenceMatch[]>;
    /** 验证证据：给出 EvidenceResult。 */
    verify(request: EvidenceRef, ctx: any): Promise<EvidenceResult>;
}
/** 兼容 DSH Agent / Session 的最小形状（只读 id 与 cwd 相关字段）。 */
export interface AgentLike {
    id?: string;
    session?: {
        header?: {
            cwd?: string;
        };
        cwd?: string;
    };
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
