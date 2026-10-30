/**
 * v2 contract — 领域类型（只声明，无运行时依赖）。
 */

export type AtomKind = "memory" | "consolidated" | "metadata" | "unknown";

export interface AtomAxes {
  locus: string;
  when: string;
  soul: string;
  role: string;
  intent: string;
}

export interface DecisionEvent {
  statement: string;
  source: string;
  reason?: string;
}

/** 一条记忆 = 一个 atoms/*.md 的解析结果。 */
export interface ParsedAtom {
  /** workspace 相对路径（POSIX 分隔符），如 `.shadow/atoms/2026-10-01--120000-src--ab12cd.md`。 */
  rel: string;
  /** 文件名（不含目录）。 */
  name: string;
  date: string;
  time: string;
  slug: string;
  /** v2 唯一后缀；v1 旧文件为 undefined。 */
  uid?: string;
  entry: string;
  project: string;
  agent: string;
  goal: string;
  summary: string;
  axes: AtomAxes;
  materials: string[];
  decisions: string[];
  decisionEvents: DecisionEvent[];
  userMessages: string[];
  actions: string[];
  thinkLines: string[];
  /** 原文（用于打分 / 片段 / 重建）。 */
  body: string;
  kind: AtomKind;
}

/** 冷/热/取代/归档等生命周期标签由派生索引给出；source 文件本身不存状态。 */
export type LifecycleStatus = "active" | "stale" | "superseded" | "archived" | "compacted";

export interface AtomMeta {
  rel: string;
  hits: number;
  status: LifecycleStatus;
  firstAt?: string;
  lastAt?: string;
  /** 用户 pin 后不参与遗忘。 */
  pinned?: boolean;
}

export interface EpisodeDecision {
  text: string;
  rel: string;
  at: string;
}

export interface EpisodeAction {
  text: string;
  rel: string;
  at: string;
}

export interface Episode {
  id: string;
  startedAt: string;
  endedAt: string;
  project: string;
  agent: string;
  title: string;
  objective: string;
  memoryCount: number;
  memoryRefs: string[];
  entries: string[];
  decisions: EpisodeDecision[];
  actions: EpisodeAction[];
  materials: string[];
}

export interface DecisionEntry {
  text: string;
  statement: string;
  reason: string;
  source: string;
  rel: string;
  at: string;
}

export interface DecisionLineage {
  byEntry: Record<string, DecisionEntry[]>;
  count: number;
}

export interface TaskView {
  id: string;
  title: string;
  trigger: string;
  objective: string;
  constraints: string[];
  status: "active" | "completed" | "abandoned";
  statusNote?: string;
  startedAt?: string;
  endedAt?: string;
  decisions: { text: string; source: string; reason: string; rel: string; at: string }[];
  outcomes: string[];
  evidence: string[];
  memoryRefs: string[];
}

export type ContextStatus = "validated" | "stale" | "unknown";

export interface ContextRef {
  subject: string;
  value: string;
  source: string;
  status: ContextStatus;
  transformed?: string;
  rule?: string;
}

/** 可见降级信号；active 才渲染，成功时 clear。 */
export interface Signal {
  capability: string;
  code: string;
  message: string;
  effect: string;
  firstAt: number;
  lastAt: number;
  count: number;
  active: boolean;
}

export interface WorkspaceScope {
  kind: "explicit" | "session" | "fallback";
  ws: string;
  notice?: string;
}

export const CORE_MODES = [
  "recovery",
  "query",
  "episode",
  "decision",
  "task",
  "context",
  "knowledge",
  "query-log",
  "shadow-report",
  "shadow-manifest",
] as const;

export type CoreMode = (typeof CORE_MODES)[number];

export interface ShadowConfig {
  shadowRoot?: string;
  projectRoot?: string;
  capture?: {
    echo?: "audit" | "memory";
    consent?: boolean;
    summary?: "auto" | "off" | "deterministic";
  };
  recall?: {
    budget?: number;
    limit?: number;
    cooldownTurns?: number;
    deprioritize?: string[];
    lossDisclosure?: boolean;
  };
  retention?: { halfLifeDays?: number; staleDays?: number };
  forget?: { staleDays?: number; minHits?: number; maxActive?: number };
  compact?: { gapMinutes?: number };
  index?: { provider?: "sqlite" | "fs"; verify?: "token" | "full" };
  telemetry?: { queryLog?: boolean; hits?: boolean };
  autoRecall?: { limit?: number };
  codeSearch?: {
    exclude?: string[];
    useGitignore?: boolean;
    index?: { maxChunks?: number; maxBytes?: number };
    embedding?: { provider?: "auto" | "local" | "http"; baseURL?: string; apiKeyEnv?: string; model?: string; maxChunks?: number };
  };
}
