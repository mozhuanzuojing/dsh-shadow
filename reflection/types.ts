// dsh-shadow —— reflection/types.ts：v0.24 Reflection 领域类型 + 完整性闸门。
// Reflection 输入只能是 ObservationTrace[]（禁 Memory/Experience 原文/外部知识/LLM）。
import type { ObservationTrace } from "../core/types.js";

export type ReflectionStatus = "observed" | "candidate" | "confirmed";
export type ReflectionLearningType = "principle" | "anti_pattern" | "unknown";
export type ReflectionLearning = { statement: string; type: ReflectionLearningType; evidenceCount: number };
export type ReflectionDecisionOutcome = { decision: string; outcome: string; count: number; successRate: number };

export interface Reflection {
  id: string;
  observerId: string;
  sourceTraces: string[];
  period: { from: string; to: string };
  observation: { repeatedDecisions: string[]; repeatedOutcomes: string[]; deviationPatterns: string[] };
  pattern: { decisionOutcomeCorrelation: ReflectionDecisionOutcome[] };
  learning: ReflectionLearning;
  confidence: { score: number; reasons: string[] };
  status: ReflectionStatus;
}

// Trace 质量闸门：只有同时有 decision + outcome 的轨迹才参与 Reflection（否则大量 "unknown" 污染候选）。
// Reflection 不编故事——不完整轨迹直接跳过。
export interface TraceCompleteness {
  hasProjection: boolean;
  hasDecision: boolean;
  hasOutcome: boolean;
  reflectionEligible: boolean;
}

export const completenessOf = (t: Partial<ObservationTrace>): TraceCompleteness => {
  const hasProjection = !!(t.projection && (t.projection.visible?.length || t.projection.hidden?.length));
  const hasDecision = !!t.decision?.action;
  const hasOutcome = !!t.outcome?.actual;
  return { hasProjection, hasDecision, hasOutcome, reflectionEligible: hasDecision && hasOutcome };
};
