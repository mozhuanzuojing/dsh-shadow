import type { ObservationTrace } from "../../core/types.js";
import type { ReflectionDecisionOutcome } from "../types.js";
export declare const isPositiveOutcome: (actual: string) => boolean;
export declare const decisionOutcomeCorrelation: (traces: Partial<ObservationTrace>[]) => ReflectionDecisionOutcome[];
