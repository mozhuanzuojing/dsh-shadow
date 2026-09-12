// dsh-shadow —— dream/compress.ts：Offline Compression Cycle（读 TemporalGraph 的来源轨迹 → Pattern Engine + Alternative Engine → DreamResult）。
// Pattern 输出是 Observation（结构 + 频率 + 候选解释），不是 Conclusion/Principle；causality 归 v0.28。
import type { DreamPattern, Hypothesis, DreamResult, AlternativeExplanation } from "./types.js";
import { readObservationTraces } from "../observer/trace.js";
import { buildTemporalGraph } from "../temporal/builder.js";
import { today } from "../core/util.js";
// 「正/负结果」判据**收一处**（ADR-0063/0070）：词表与否决规则见 `core/polarity.ts`。
// 本文件原有的一份与 `validation/validate.ts` **逐字相同**，且与 `reflection/patterns/success-rate.ts` 答案不同（实测）。
import { isPositiveOutcome as isPositive } from "../core/polarity.js";

// A) Recuorrence + B) Expectation Gap + C) Cross Domain 的确定性聚合（Observation output）。
export const detectPatterns = (traces: any[]): DreamPattern[] => {
  const eligible = traces.filter((t) => t.decision?.action && t.outcome?.actual);
  const patterns: DreamPattern[] = [];
  // A) recurrence: 同 decision 重复 + association frequency
  const byDecision = new Map<string, { count: number; pos: number; outcome: string }>();
  for (const t of eligible) {
    const d = t.decision.action, o = t.outcome.actual;
    const rec = byDecision.get(d) || { count: 0, pos: 0, outcome: o };
    rec.count++; if (isPositive(o)) rec.pos++;
    if (rec.outcome === o || rec.count === 1) rec.outcome = o;
    byDecision.set(d, rec);
  }
  for (const [d, r] of byDecision) {
    if (r.count < 2) continue;
    const freq = (r.pos / r.count).toFixed(2);
    patterns.push({
      id: `p-rec-${d.slice(0, 16)}`, type: "recurrence",
      observation: `在 ${r.count} 个 temporal sequence 中，出现 ${d}，随后 ${r.outcome}，association frequency ${freq}`,
      frequency: r.count, nodes: [],
    });
  }
  // B) expectation gap: hidden 关键词出现在 actual（低估/漏看）
  for (const t of eligible) {
    const actual = String(t.outcome?.actual || "");
    const hidden = t.projection?.hidden || [];
    for (const h of hidden) {
      const kw = String(h).replace(/(风险|问题|隐患|瓶颈|成本|缺陷|压力)/g, "");
      if (kw && actual.toLowerCase().includes(kw.toLowerCase())) {
        patterns.push({ id: `p-gap-${kw.slice(0, 12)}`, type: "expectation_gap", observation: `Prediction Error：当时隐藏「${h}」，后续 actual 命中，疑似低估该因素`, frequency: 1, nodes: [] });
      }
    }
  }
  // C) cross domain: 不同 decision 共享同一 outcome → candidate abstraction
  const byOutcome = new Map<string, Set<string>>();
  for (const t of eligible) { const o = t.outcome.actual; if (!byOutcome.has(o)) byOutcome.set(o, new Set()); byOutcome.get(o)!.add(t.decision.action); }
  for (const [o, ds] of byOutcome) if (ds.size >= 2) patterns.push({ id: `p-xd-${o.slice(0, 12)}`, type: "cross_domain", observation: `在多个场景观察到「${o}」与不同决策（${[...ds].slice(0, 3).join("、")}）相关的候选模式`, frequency: ds.size, nodes: [] });
  return patterns;
};

const alternativeExplanationOf = (pid: string): AlternativeExplanation => ({
  hypothesisId: pid,
  alternatives: [
    { description: "随机共现（样本偶然）", supportingEvidence: [] },
    { description: "存在未观察变量在共同驱动", supportingEvidence: [] },
    { description: "样本偏差（计数不足）", supportingEvidence: [] },
  ].slice(0, 3),
});

export const hypothesize = (p: DreamPattern, observerId: string): Hypothesis => {
  const id = `h-${p.id}`;
  const whatWouldDisprove = `若出现「${p.observation.split("出现")[1]?.split("，随后")[0]?.trim() || p.observation}」的后续结果与其他样本不一致，或该结构未重复出现，则此候选被推翻`;
  return {
    id, observerId,
    claimCandidate: p.observation,
    supportingPatterns: [p.id],
    alternativeExplanation: [alternativeExplanationOf(id)],
    falsification: { whatWouldDisprove },
    verification: { required: true, status: "pending" }, // v0.27 只 pending
    createdAt: today(),
  };
};

// Offline Compression Cycle：SleepWindow → 读资料 → Pattern Engine → Hypothesis(pending) → DreamResult。
export const offlineCompression = async (fs: any, ws: string, window: { observerId: string; from?: string; to?: string }): Promise<DreamResult> => {
  const range = { from: window.from || "", to: window.to || "" };
  const traces = await readObservationTraces(fs, ws);
  const filtered = traces.filter((t) => {
    const d = String(t.createdAt || "").slice(0, 10);
    if (range.from && d && d < range.from) return false;
    if (range.to && d && d > range.to) return false;
    return true;
  });
  const patterns = detectPatterns(filtered);
  if (!patterns.length) return { status: "no_pattern", patterns: [], hypotheses: [] };
  const hypotheses = patterns.map((p) => hypothesize(p, window.observerId));
  return { status: "generated", patterns, hypotheses };
};

// DreamArtifact 组装（含 provenance，可回答"这个梦是怎么来的"）。
export const buildDreamArtifact = async (fs: any, ws: string, window: SleepWindowArg, result: DreamResult) => {
  const graph = await buildTemporalGraph(fs, ws, { from: window.from, to: window.to });
  return {
    id: `dream-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    observerId: window.observerId,
    sleepWindowId: window.id || "",
    sourceTemporalGraphVersion: graph.graphVersion,
    sourceNodeIds: graph.nodes.map((n) => n.id),
    sourceEdgeIds: graph.edges.map((e) => `${e.from}->${e.to}`),
    compressionMethod: "structured_recurrence+cross_domain+expectation_gap",
    patterns: result.patterns,
    generatedHypothesisIds: result.hypotheses.map((h) => h.id),
    createdAt: today(),
  };
};
interface SleepWindowArg { id?: string; observerId: string; from?: string; to?: string; }

export const renderDreamResult = (r: DreamResult) => {
  const lines = ["[Offline Compression]"];
  lines.push(`status ${r.status} · patterns ${r.patterns.length} · hypotheses ${r.hypotheses.length}`);
  for (const p of r.patterns.slice(0, 6)) lines.push(`  pattern(${p.type}) ${p.observation} (freq=${p.frequency})`);
  for (const h of r.hypotheses.slice(0, 6)) lines.push(`  hypothesis ${h.claimCandidate.slice(0, 80)} [${h.verification.status}] · falsification ${h.falsification.whatWouldDisprove.slice(0, 60)}`);
  return lines.join("\n");
};
