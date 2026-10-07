// dsh-shadow —— selfhood/dream/types.ts：v0.27 Observer Sleep Kernel 类型。
// Dream = 内部 Observer Offline Compression（外部 alias Dream），不是生成器。只产候选结构，不产 Knowledge/Principle。
export type DreamTrigger = "scheduled" | "resource_idle" | "manual";
export type HypothesisStatus = "pending" | "observed" | "validated" | "rejected";
export type DreamResultStatus = "generated" | "no_pattern";

export interface SleepWindow {
  id: string;
  observerId: string;
  startTime: string;
  endTime: string;
  trigger: DreamTrigger;
  includedTimelineRange: { from: string; to: string };
  excluded: { currentConversation: true; externalInput: true }; // 恒 true，防观察污染
}

export interface AlternativeExplanation {
  hypothesisId: string;
  alternatives: { description: string; supportingEvidence: string[] }[];
}

export interface Hypothesis {
  id: string;
  observerId: string;
  claimCandidate: string;         // 结构性观察（非断言）
  supportingPatterns: string[];
  alternativeExplanation: AlternativeExplanation[];  // ≤3
  falsification: { whatWouldDisprove: string };
  verification: { required: true; status: HypothesisStatus };  // v0.27 只 pending
  createdAt: string;
}

export interface DreamPattern {
  id: string;
  type: "recurrence" | "expectation_gap" | "cross_domain";
  observation: string;            // 结构 + 频率 + 候选解释（Observation，非 Conclusion）
  frequency: number;
  nodes: string[];
}

export interface DreamArtifact {
  id: string;
  observerId: string;
  sleepWindowId: string;
  sourceTemporalGraphVersion: string;
  sourceNodeIds: string[];
  sourceEdgeIds: string[];
  compressionMethod: string;
  patterns: DreamPattern[];
  generatedHypothesisIds: string[];
  createdAt: string;
}

export interface DreamResult {
  status: DreamResultStatus;
  patterns: DreamPattern[];
  hypotheses: Hypothesis[];
  /**
   * **输入样本不全**（B4，v1.22.x）：算这次 dream 时，读 `.shadow/observation/<date>/*.md`
   * 被**跳过/坏件**而没进 pattern 的条数。`> 0` ⇒ 尤其 `no_pattern` 必须按「样本被削」读，
   * **不能**读成「真的没有模式」（ADR-0049：两者处置不同）。**缺席 = 0**（健康路径不写这个字段）。
   */
  sourceSkipped?: number;
  /** **目录级读不出来**的真实原因（「还没有 observation 目录」**不算**）。 */
  sourceReadFailure?: string;
}

export const GRAPH_VERSION_HINT = "0.26";
