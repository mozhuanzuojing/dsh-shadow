import type { ObservationTrace } from "../../core/types.js";
import type { ReflectionDecisionOutcome } from "../types.js";
import { isPositiveOutcome } from "../../core/polarity.js";
/** 兼容性再导出：判据的**唯一来源**是 `core/polarity.ts`（本文件不再自带词表）。 */
export { isPositiveOutcome };
export declare const decisionOutcomeCorrelation: (traces: Partial<ObservationTrace>[]) => ReflectionDecisionOutcome[];
