// dsh-shadow —— reflection/patterns/success-rate.ts：Pattern 2 成功率（decision → outcome 相关性，纯统计）。
// 成功 = outcome 命中"正"标记且无"负"标记（确定性标记集，非 ML/LLM）。
import type { ObservationTrace } from "../../core/types.js";
import type { ReflectionDecisionOutcome } from "../types.js";

const POS = ["成功", "通过", "解决", "优化", "提升", "改进", "稳定", "成本下降", "维护成本下降", "验收通过", "依赖降低",
  "improved", "fixed", "passed", "optimized", "stable", "success", "reduced", "solved"];
const NEG = ["失败", "瓶颈", "恶化", "故障", "回退", "出错", "超时", "阻塞", "超标", "污染", "积压", "缺陷", "上升",
  "复杂性增加", "复杂度增加", "复杂", "increased", "increase", "failed", "failure", "complexity", "degraded", "regression", "issue", "breaking", "unstable"];

export const isPositiveOutcome = (actual: string) => {
  const s = String(actual || "").toLowerCase();
  return POS.some((p) => s.includes(p.toLowerCase())) && !NEG.some((n) => s.includes(n.toLowerCase()));
};

export const decisionOutcomeCorrelation = (traces: Partial<ObservationTrace>[]): ReflectionDecisionOutcome[] => {
  const m = new Map<string, { decision: string; outcome: string; positive: number; count: number }>();
  for (const t of traces) {
    const d = t.decision?.action, o = t.outcome?.actual;
    if (!d || !o) continue;
    const k = `${d}||${o}`;
    const rec = m.get(k) || { decision: d, outcome: o, positive: 0, count: 0 };
    rec.count++;
    if (isPositiveOutcome(o)) rec.positive++;
    m.set(k, rec);
  }
  return [...m.values()]
    .sort((a, b) => b.count - a.count)
    .map((r) => ({ decision: r.decision, outcome: r.outcome, count: r.count, successRate: r.count ? +(r.positive / r.count).toFixed(2) : 0 }));
};
