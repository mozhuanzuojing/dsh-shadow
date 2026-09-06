export type ShadowScopeKind = "explicit" | "implicit" | "none";
export interface ShadowScope {
    scope: ShadowScopeKind;
    ws: string;
}
export interface ShadowConfig {
    shadowRoot?: string;
    projectRoot?: string;
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
