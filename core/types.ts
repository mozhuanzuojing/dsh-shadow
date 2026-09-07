// dsh-shadow —— core/types.ts：领域 DTO / 接口（v0.14 拆内核，类型仅声明、无运行时依赖）。
// 从 index.ts 迁移；scope 解析函数见 core/scope.ts。

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
  summary?: { enabled?: boolean; provider?: string; model?: string; maxTokens?: number; timeoutMs?: number };
  recall?: { enabled?: boolean; provider?: string; model?: string; maxTokens?: number; timeoutMs?: number; cooldownTurns?: number; debug?: boolean };
  retention?: { enabled?: boolean; halfLifeDays?: number; staleDays?: number };
  /** Episode/Decision Lineage（派生关系层）：控制聚合时间间隔；纯派生不改写侧采集。 */
  episodes?: { gapMinutes?: number; showInIndex?: number };
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

// ── Trace（ADR-0003 §3-5）：World/DSH Events → Trace → Memory → Experience 的中间层。 ──
// 每一条 Trace = 归一化后的单个事件（归一化采集源，Memory 从其塑形）。无副作用、纯数据。
export type TraceKind = "action" | "user" | "assistant" | "decision";
export interface Trace {
  seq: number;          // 回合内序号
  at: string;           // stamp()，写侧时间戳
  kind: TraceKind;      // 事件类别
  actor: string;        // agent id（归属）
  comp: string;         // 语义组件 / 工具名（入口候选）
  text: string;         // 已清洗正文（sanitizeText 前原始文本交由 flush 处理）
  sub?: string;         // 用户消息分类（classifyUser）
  source: string;       // 采集源（fs/tool/goal/session/user）
}

// ── v0.20 Observer Kernel：Observer 是根（主体），Memory 只是其中一个器官。 ──
// Identity = 长期存在的主体（实体，不嵌入 ObserverContext）；ObserverContext = 一次观察事件（稀疏、轻）。
// 读取时用 identityRef 指向 Identity，经 resolveObserver 加载；避免"每次观察都打包一份灵魂"污染历史。

/** Identity：主体锚（你是谁、看重什么、怎么决策）。长期实体。 */
export interface Identity {
  id: string;
  name?: string;
  role?: string;
  principles: string[];
  antiPatterns?: string[];
  decisionStyle?: string[];
  observerLens?: { preferred?: string[]; avoided?: string[] };
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

// ── v0.23 Observation Trace：Observer 记录"我当时是怎么看见这个世界"的可回放记录。 ──
// 与 Experience 分离（Experience=发生了什么；ObservationTrace=我怎么看见发生的）。旁路记录：不影响 recall/排序/答案。
export type TraceSource = "read_shadow" | "projection" | "manual";
export interface ObservationTrace {
  id: string;
  observerId: string;
  createdAt: string;
  realityAnchor: RealityAnchor;
  intent: Intent;
  projection: { visible: string[]; hidden: string[]; distortion: string[] };
  decision?: { action: string; rationale?: string };
  outcome?: { expected?: string; actual?: string };
  uncertainty: { level: number; reasons: string[] };
  metadata: { source: TraceSource };
  /** 观察事件携带的观察者状态（v0.23 只读取、不自动推断），供回看时还原"当时处于什么状态"。 */
  state?: ObserverState;
}

// ── v0.22 Judgment：Observer 决定，Evidence 是输入。Claim → Evidence → Judgment。 ──
// 同一 Evidence 在不同 Observer 下结论不同（架构师→重构、老板→延投）；Judgment 挂在 Observer 下。
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
