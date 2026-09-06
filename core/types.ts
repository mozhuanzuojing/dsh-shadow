// dsh-shadow —— core/types.ts：领域 DTO / 接口（v0.14 拆内核，类型仅声明、无运行时依赖）。
// 从 index.ts 迁移；scope 解析函数见 core/scope.ts。

export type ShadowScopeKind = "explicit" | "implicit" | "none";
export interface ShadowScope {
  scope: ShadowScopeKind;
  ws: string;
}

export interface ShadowConfig {
  shadowRoot?: string;
  projectRoot?: string;
  summary?: { enabled?: boolean; provider?: string; model?: string; maxTokens?: number; timeoutMs?: number };
  recall?: { enabled?: boolean; provider?: string; model?: string; maxTokens?: number; timeoutMs?: number; cooldownTurns?: number; debug?: boolean };
  retention?: { enabled?: boolean; halfLifeDays?: number; staleDays?: number };
  /** P5 默认回写显式同意：true=仅当用户显式要求记忆时才落盘，否则只累积；默认 false 保持现有采集流。 */
  writeConsent?: boolean;
  /** 证据网关（v0.14）：选择证据 Provider（fs | zg | ...）。默认 "fs"。zg 是检索层，不是裁决层。 */
  evidenceProvider?: string;
  /** 额外注入的证据 Provider（测试/扩展用）：name -> EvidenceProvider。与内置 fs 合并。 */
  evidenceProviders?: Record<string, EvidenceProvider>;
}

// ── Evidence Gateway（v0.14）：Shadow 只问 verify(EvidenceRef)，不关心底层是 fs/zg/git/... ──
// zg 是「眼睛/Evidence Sensor」：discover(找证据)/verify(验证证据)；Arbitration(它意味着什么)留在 Shadow Core。
export interface EvidenceRef {
  path: string;
  query?: string;                    // semantic/exact 查询串
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
  status: EvidenceStatus;            // unavailable/zg未装 → 明确报错；绝不静默 fallback 成 verified
  source: string;                    // "fs" | "zg" | provider name
  matches: EvidenceMatch[];
  confidence: number;
  freshness: EvidenceFreshness;
  provenance: { provider: string; at?: string };
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
  session?: { header?: { cwd?: string }; cwd?: string };
}
