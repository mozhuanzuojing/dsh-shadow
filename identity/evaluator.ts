// dsh-shadow —— identity/evaluator.ts：Identity Evolution Evaluator（三道闸门 → IdentityChangeDecision）。
// 不是权限 Gate，而是 Evaluator：Candidate → evaluator → accepted|candidate|rejected。
// 三道闸门：重复性（N 次同向）/ 时间稳定（half-life 衰减）/ 反证（contradiction 上限）。全部确定性，无 LLM。
import type { CandidateIdentityChange, EvaluatorStatus, IdentityChangeDecision, IdentityModel } from "./types.js";
import { nextVersion, writeIdentityVersion } from "./timeline.js";
import { readReflections } from "../reflection/engine.js";
import { candidateOf } from "./candidate.js";
import { today } from "../core/util.js";
import { scrubUnsafe } from "../security/scrub.js";

export interface EvalGates {
  minCount?: number;       // 重复性：同向轨迹最小次数
  minRecency?: number;     // 时间稳定：recency 下限
  maxContradiction?: number; // 反证：contradiction 上限
  halfLifeDays?: number;   // 时间衰减半衰期
  lastSeen?: string;       // 最近一次观察日期（recency 基准）
}

export const evaluateCandidate = (c: CandidateIdentityChange, gates: EvalGates): IdentityChangeDecision => {
  const minCount = gates.minCount ?? 5;
  const minRecency = gates.minRecency ?? 0.4;
  const maxContradiction = gates.maxContradiction ?? 0.3;
  const reasons: string[] = [];
  const countOk = c.evidence.traceCount >= minCount;
  if (!countOk) reasons.push(`重复性不足（${c.evidence.traceCount} < ${minCount}）`);
  const days = gates.lastSeen ? Math.max(0, Math.round((Date.parse(today()) - Date.parse(gates.lastSeen)) / 86400000)) : 0;
  const hl = Math.max(1, gates.halfLifeDays ?? 90);
  const recency = Math.exp((-Math.LN2 * days) / hl);
  c.confidence.recency = recency;
  // 重算 overall（置信 = frequency×recency×consistency 的加权合成，保留维度可解释）
  c.confidence.overall = Math.max(0.05, Math.min(0.98, c.confidence.frequency * 0.35 + recency * 0.25 + c.confidence.consistency * 0.3 + (1 - c.confidence.contradiction) * 0.1));
  const recenyOk = recency >= minRecency;
  if (!recenyOk) reasons.push(`时间稳定不足（recency ${recency.toFixed(2)} < ${minRecency}）`);
  const contraOk = c.confidence.contradiction <= maxContradiction;
  if (!contraOk) reasons.push(`反证过多（${c.confidence.contradiction.toFixed(2)} > ${maxContradiction}）`);
  const status: EvaluatorStatus = reasons.length === 0 ? "accepted" : countOk ? "candidate" : "rejected";
  return { status, reasons, chosen: c };
};

// 读反思 → 生成候选 → 三道闸门 → 接受者推进 identity(t0)->t1 ->timeline。不自动改 soul.json（只推进派生切片）。
export const advanceIdentity = async (fs: any, ws: string, current: IdentityModel, gates: EvalGates = {}) => {
  const reflections = await readReflections(fs, ws);
  const decisions: IdentityChangeDecision[] = [];
  const applied: CandidateIdentityChange[] = [];
  for (const r of reflections) {
    const c = candidateOf(r, current.version);
    if (!c) continue;
    if (r.period.to) gates.lastSeen = r.period.to; // recency 基准 = 反思周期终点
    const d = evaluateCandidate(c, gates);
    decisions.push(d);
    if (d.status === "accepted") applied.push(c);
  }
  let model = current;
  if (applied.length) {
    const learned = current.learned.slice();
    const decisionStyle = current.currentModel.decisionStyle.slice();
    const antiPatterns = current.currentModel.antiPatterns.slice();
    for (const c of applied) {
      if (c.proposal.type === "add_principle") learned.push({ text: c.proposal.content, confidence: c.confidence.overall, source: c.evidence.reflections[0] || "reflection" });
      else if (c.proposal.type === "add_boundary") antiPatterns.push(c.proposal.content.slice(0, 40));
      else if (c.proposal.type === "change_decision_style") decisionStyle.push(c.proposal.content.slice(0, 40));
    }
    model = { ...current, version: nextVersion(current.version), at: today(), learned, currentModel: { decisionStyle, antiPatterns } };
    await writeIdentityVersion(fs, ws, model);
  }
  return { model, decisions, applied };
};

export const renderEvaluator = (decisions: IdentityChangeDecision[], model: IdentityModel) => {
  const lines = [`[Identity Evolution] version ${model.version} · at ${model.at}`];
  lines.push(`learned ${model.learned.length} · decisionStyle ${model.currentModel.decisionStyle.length} · antiPatterns ${model.currentModel.antiPatterns.length}`);
  if (!decisions.length) lines.push("（无可评估候选：需已校验的 reflection）");
  for (const d of decisions.slice(0, 6)) {
    const c = d.chosen!;
    lines.push(`- ${d.status} · ${c.proposal.type} · ${scrubUnsafe(c.proposal.content)}`);
    lines.push(`    confidence freq=${c.confidence.frequency.toFixed(2)} recency=${c.confidence.recency.toFixed(2)} consistency=${c.confidence.consistency.toFixed(2)} contradiction=${c.confidence.contradiction.toFixed(2)} overall=${c.confidence.overall.toFixed(2)}`);
    if (d.reasons.length) lines.push(`    reason: ${d.reasons.join("；")}`);
  }
  return lines.join("\n");
};
