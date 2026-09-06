// dsh-shadow —— federation/types.ts：v0.28.1 Epistemic Kernel。Federation 交换的不是数据，是"一个观察对另一个现实的投影"。
import type { ValidationOutcome } from "../validation/types.js";

export interface FederatedObservationPacket {
  sourceObserverId: string;
  observationClaim: string;   // 我看到什么（可交换）
  projectionSnapshot: { lens?: string; visible: string[]; hidden: string[]; distortion: string[] };
  validationReference: { hypothesisId?: string; validationId?: string; outcome?: ValidationOutcome };
  boundary: { identityExcluded: true; memoryExcluded: true; dreamExcluded: true };  // Identity 不属于可交换现实证据
}

export type ExchangeableKind = "ObservationClaim" | "ValidationResult" | "AlternativePerspective";
export const EXCHANGEABLE_KINDS: ExchangeableKind[] = ["ObservationClaim", "ValidationResult", "AlternativePerspective"];

// v0.29 Federation Kernel：基本单位是 Perspective，不是 Observer；Federation 在 Reality 层交汇。
export interface FederatedPerspectiveConfidence { observationConfidence: number; validationConfidence: number; }
export interface FederatedPerspective {
  observerId: string;
  temporalReference: string;
  observationClaim: string;
  projectionSnapshot: { lens?: string; visible: string[]; hidden: string[]; distortion: string[] };
  validationHistoryRef: string[];
  confidence: FederatedPerspectiveConfidence;  // 观测确信 ≠ 对现实解释的确信（拆开）
  boundary: { identityExcluded: true; memoryExcluded: true; dreamExcluded: true };
}

// RealityEvidenceRegistry：弱事实（只记录"某事件在某时间被观察到"，不解释世界规律）。
export interface RealityEvidence {
  id: string;
  observedAt: string;
  source: string;
  observation: string;       // "某事件在某时间被观察到"（弱事实）
  linkedHypothesis: string[];
  referencedBy: string[];    // 引用者（只能引用不能拥有；append-only）
  status: string;
}

export type PerspectiveState = "isolated" | "corroborated" | "validated";
export interface ObserverDifference {
  realityEvidenceRef: string;
  observerA: string;
  observerB: string;
  projectionDelta: { visibleDifference: string[]; hiddenDifference: string[]; lensDifference: string[] };
  possibleBlindSpot: string[];
  unresolvedQuestion: string[];  // 科学过程：发现"原来我们不知道什么"
}
