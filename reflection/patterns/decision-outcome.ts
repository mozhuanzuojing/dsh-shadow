// dsh-shadow —— reflection/patterns/decision-outcome.ts：Pattern 1 重复决策 + 重复结果（纯统计，无 AI）。
// 统计同一 observer 轨迹里 decision.action / outcome.actual 出现次数 ≥2 的项。
import type { ObservationTrace } from "../../core/types.js";

const tally = (traces: Partial<ObservationTrace>[], pick: (t: Partial<ObservationTrace>) => string | undefined) => {
  const m = new Map<string, number>();
  for (const t of traces) {
    const v = pick(t);
    if (!v) continue;
    m.set(v, (m.get(v) || 0) + 1);
  }
  return [...m.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).map(([k]) => k);
};

export const repeatedDecisions = (traces: Partial<ObservationTrace>[]) => tally(traces, (t) => t.decision?.action);
export const repeatedOutcomes = (traces: Partial<ObservationTrace>[]) => tally(traces, (t) => t.outcome?.actual);
