// dsh-shadow —— selfhood/temporal/types.ts：v0.26 Observer Temporal Kernel 类型。
// Temporal = 宇宙时间层（不是意识功能层）；独立于 Dream。Graph 是派生索引（可重建，保持 Memory ≠ Evidence）。
import type { Intent, ObserverState } from "../../core/types.js";

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
  /**
   * **输入样本不全**（B4，v1.22.x）：构建这张图时，读 `.shadow/observation/<date>/*.md` 与
   * `.shadow/identity/*.json` 被**跳过/坏件**而**没进图**的条数（两个 reader 各自 `skipped` 之和）。
   * `> 0` ⇒ 这张图是**不完整输入**派生的（节点/边可能偏少），**不许**被读成「真的只有这些」。
   * **缺席 = 0**（健康路径不写这个字段 —— 免得被读成「削了 0 条」这种没信息量的读数）。
   */
  sourceSkipped?: number;
  /**
   * **目录级读不出来**的真实原因（「还没有目录」**不算**，B4 的判据）。有值时上面这张图不可当作全量。
   * 两者都是**可选**：健康路径上不出现 ⇒ 旧调用方与旧快照逐字节兼容。
   */
  sourceReadFailure?: string;
}

export type TemporalQuery =
  | { type: "replay"; at: string }
  | { type: "compare"; from: string; to: string };

export const GRAPH_VERSION = "0.26";
