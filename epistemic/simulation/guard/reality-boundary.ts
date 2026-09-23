// dsh-shadow —— simulation/guard/reality-boundary.ts：Simulation ≠ Reality（Outcome 不产 RealityClaim/Evidence，不改 Identity）。
import type { SimulationOutcome } from "../types/outcome.js";

export const FORBIDDEN_OUTCOME_STATUS = new Set(["predicted", "confirmed", "expected"]);
export const outcomeIsHypothetical = (o: SimulationOutcome) => !FORBIDDEN_OUTCOME_STATUS.has(o?.status) && (o?.status === "hypothetical" || o?.status === "explored" || o?.status === "compared");
export const outcomeHasLineage = (o: SimulationOutcome) => !!(o && Array.isArray(o.derivedFrom) && o.derivedFrom.length > 0);
// Simulation 绝不反写 Reality：Outcome 不是 RealityClaim/RealityEvidence。
export const assertNoRealityFabrication = (o: SimulationOutcome): { ok: boolean; reason?: string } =>
  outcomeIsHypothetical(o) ? { ok: true } : { ok: false, reason: `outcome status ${o?.status} 疑似现实/预测（禁 predicted/confirmed/expected）` };
