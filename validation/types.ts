// dsh-shadow —— validation/types.ts：v0.28 Hypothesis Validation 类型。
// Reality Feedback Loop：Future Evidence（未来事实）→ Validation Artifact（不覆盖 Hypothesis）。
// Memory ≠ Evidence；Hypothesis ≠ Evidence。Validation 生成 Artifact，保留历史（同一假设可 observed 再 rejected）。
import type { Hypothesis } from "../dream/types.js";

export interface FutureEvidence {
  id: string;
  hypothesisId: string;
  observedAt: string;
  sourceTraceIds: string[];
  observationType: string;
  actualOutcome: string;
  createdAt: string;
}

export interface ValidationConfidence {
  evidenceStrength: number;   // support / applied
  repetition: number;         // applied / maxN
  contradiction: number;      // contradiction / applied
  alternativeSurvival: number;// 1 - 反例削弱（竞争解释存活度）
}

export type ValidationOutcome = "validated" | "observed" | "rejected" | "expired";

export interface AlternativeEvaluation { alternative: string; supported: boolean; weakened: boolean; }

export interface ValidationArtifact {
  id: string;
  hypothesisId: string;
  evaluatedAt: string;
  evidenceIds: string[];
  alternativeResults: AlternativeEvaluation[];
  confidence: ValidationConfidence;
  outcome: ValidationOutcome;
  context: {
    hypothesisProjectionSnapshot: Hypothesis | null;
    currentRealitySnapshot: { support: number; contradiction: number; applied: number } | null;
    perceptionDelta: string;
  };
}

export interface ValidationResult {
  hypothesisId: string;
  outcome: ValidationOutcome;
  confidence: ValidationConfidence;
  alternativeEvaluation: AlternativeEvaluation[];
  applied: { support: number; contradiction: number };
  conclusion: string;
}

export const MAX_EVIDENCE_N = 10;
