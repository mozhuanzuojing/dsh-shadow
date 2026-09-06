// dsh-shadow —— reflection/engine.ts：v0.24 Reflection Engine（Candidate Generator）。
// 输入 ObservationTrace[] → Pattern Extraction → Candidate Reflection（status:"candidate"），等确认；不写回 Identity。
// 旁支不是主干：Reflection ≠ Memory 查询。v0.24 只产 candidate，confirmed 留 v0.25；不生成 Candidate Identity Change。
import type { ObservationTrace } from "../core/types.js";
import { completenessOf, type Reflection, type ReflectionLearningType, type ReflectionStatus } from "./types.js";
import { repeatedDecisions, repeatedOutcomes } from "./patterns/decision-outcome.js";
import { decisionOutcomeCorrelation } from "./patterns/success-rate.js";
import { distortionPatterns } from "./patterns/distortion.js";
import { readObservationTraces } from "../observer/trace.js";
import { today } from "../core/util.js";
import { scrubUnsafe } from "../security/scrub.js";

export interface ReflectOpts {
  id?: string;
  observerId: string;
  period: { from: string; to: string };
}

// 纯计算：eligible traces → Reflection。完整性闸门（decision+outcome 齐备）before 计算。
export const reflectTraces = (traces: Partial<ObservationTrace>[], opts: ReflectOpts): Reflection => {
  const eligible = traces.filter((t) => completenessOf(t).reflectionEligible);
  const reDecisions = repeatedDecisions(eligible);
  const reOutcomes = repeatedOutcomes(eligible);
  const corr = decisionOutcomeCorrelation(eligible);
  const devs = distortionPatterns(eligible);
  const top = corr.find((c) => c.count >= 3);
  const rate = top ? top.successRate : 0;
  let type: ReflectionLearningType = "unknown";
  let statement = "";
  if (top) {
    type = rate >= 0.6 ? "principle" : rate < 0.4 ? "anti_pattern" : "unknown";
    statement = type === "principle"
      ? `该观察者在「${scrubUnsafe(top.decision)}」场景多次产生「${scrubUnsafe(top.outcome)}」（成功 ${Math.round(rate * top.count)}/${top.count}）`
      : type === "anti_pattern"
        ? `该观察者在「${scrubUnsafe(top.decision)}」场景常导致「${scrubUnsafe(top.outcome)}」`
        : `「${scrubUnsafe(top.decision)}」→「${scrubUnsafe(top.outcome)}」出现 ${top.count} 次`;
  }
  const score = top ? Math.min(0.95, 0.4 + rate * 0.4) : 0.2;
  const sourceTraces = eligible.slice(0, 20).map((t) => t.id || "").filter(Boolean);
  return {
    id: opts.id || `${today()}--${Math.random().toString(36).slice(2, 8)}`,
    observerId: opts.observerId,
    sourceTraces,
    period: opts.period,
    observation: { repeatedDecisions: reDecisions, repeatedOutcomes: reOutcomes, deviationPatterns: devs },
    pattern: { decisionOutcomeCorrelation: corr },
    learning: { statement: statement || "（无足够模式：尚无 ≥3 次的 decision→outcome 轨迹）", type, evidenceCount: eligible.length },
    confidence: { score, reasons: [`${eligible.length} 条可参与轨迹`, top ? `${top.count} 次观察` : "不足"] },
    status: "candidate" as ReflectionStatus,
  };
};

// 读轨迹 → 反思 → 写 shadow/reflection/<date>/<id>.md（Reflection ≠ Memory，旁支）。
export const reflectOf = async (fs: any, ws: string, opts: ReflectOpts): Promise<Reflection> => {
  const traces = await readObservationTraces(fs, ws);
  const r = reflectTraces(traces, opts);
  try {
    const rel = `shadow/reflection/${today()}/${r.id}.md`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, renderReflection(r));
  } catch { /* 旁支降级 */ }
  return r;
};

export const renderReflection = (r: Reflection) => {
  const lines = ["# Reflection"];
  lines.push(`> observer: ${scrubUnsafe(r.observerId)}`);
  lines.push(`> status: ${r.status}`);
  lines.push(`> period: ${r.period.from || "…"} → ${r.period.to || "…"}`);
  lines.push(`> confidence: ${r.confidence.score.toFixed(2)} (${r.confidence.reasons.join("、")})`);
  lines.push("");
  lines.push(`learning: ${r.learning.type} · ${r.learning.statement}`);
  lines.push(`observation: repeatedDecisions=${r.observation.repeatedDecisions.join("、") || "—"} · repeatedOutcomes=${r.observation.repeatedOutcomes.join("、") || "—"}`);
  if (r.observation.deviationPatterns.length) lines.push(`deviationPatterns: ${r.observation.deviationPatterns.join("、")}`);
  if (r.pattern.decisionOutcomeCorrelation.length) {
    lines.push("decisionOutcomeCorrelation:");
    for (const c of r.pattern.decisionOutcomeCorrelation.slice(0, 6)) lines.push(`  ${c.decision} → ${c.outcome} (×${c.count} · 成功率 ${(c.successRate * 100).toFixed(0)}%)`);
  }
  return lines.join("\n");
};
