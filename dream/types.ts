// dsh-shadow —— dream/types.ts：v0.27 Observer Sleep Kernel 类型。
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
}

export const GRAPH_VERSION_HINT = "0.26";
