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
