// dsh-shadow —— temporal/types.ts：v0.26 Observer Temporal Kernel 类型。
// Temporal = 宇宙时间层（不是意识功能层）；独立于 Dream。Graph 是派生索引（可重建，保持 Memory ≠ Evidence）。
import type { Intent, ObserverState } from "../core/types.js";

export type TemporalRelation = "followed_by" | "learned_from" | "evolved_into" | "contradicted_by" | "possible_causal_link";

export interface TemporalStateSnapshot {
  identityVersion: string;      // 读取时经 timeline resolution 解析（不回写历史）
  observerState?: ObserverState;
  intent: Intent;
}
export interface TemporalPerceptionSnapshot {
  lens?: string;
  visible: string[];
  hidden: string[];
  distortion: string[];
}
export interface TemporalNode {
  id: string;
  observerId: string;
  timestamp: string;
  stateSnapshot: TemporalStateSnapshot;
  perceptionSnapshot: TemporalPerceptionSnapshot;
  evidenceLinks: string[];
  sourceTraceIds: string[];
  observerContextHash?: string; // 预留：同上下文判断（当前不计算）
}
export interface TemporalEdge {
  from: string;
  to: string;
  relation: TemporalRelation;
  confidence: number;
  derivation: { rule: string; sourceIds: string[] };
}
export interface TemporalGraph {
  graphVersion: string;
  generatedAt: string;
  sourceRange: { from: string; to: string };
  sourceTraceIds: string[];
  nodes: TemporalNode[];
  edges: TemporalEdge[];
}

export type TemporalQuery =
  | { type: "replay"; at: string }
  | { type: "compare"; from: string; to: string };

export const GRAPH_VERSION = "0.26";
