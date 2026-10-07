// dsh-shadow —— selfhood/identity/evaluator.ts：Identity Evolution Evaluator（三道闸门 → IdentityChangeDecision）。
// 不是权限 Gate，而是 Evaluator：Candidate → evaluator → accepted|candidate|rejected。
// 三道闸门：重复性（N 次同向）/ 时间稳定（half-life 衰减）/ 反证（contradiction 上限）。全部确定性，无 LLM。
//
// B17（v1.22.x）两处「命令-查询混合 / 隐藏耦合」：
//   ① `evaluateCandidate` 旧版**就地把 `c.confidence` 改掉**（`c.confidence.recency = …`）——
//      名字与注释都说自己是「评估」，实际是**修改入参**；`advanceIdentity` 还顺手把调用方传进来的
//      `gates` 对象也改了（`gates.lastSeen = r.period.to`）⇒ 调用方复用同一个 `gates` 时，
//      上一轮的 `lastSeen` 会漏进下一轮。现在：返回**新对象**，两个入参都不被改。
//   ② `lastSeen` 旧版取循环里**最后一条**反思的 `period.to`，而 `readReflections` 的顺序由目录/文件名
//      决定、**不是时间序** ⇒ recency 的基准随文件顺序漂移，`minRecency` 闸门的结论因此不稳定。
//      现在取 `max()`（日期串 `YYYY-MM-DD` 的字典序 = 时间序）。
//
// B2（v1.22.x）：本文件把两处写侧失败带出来 —— `readReflections` 的 `skipped/readFailure`
//（静默削掉身份演化输入样本）与 `writeIdentityVersion` 的 `{ok,reason}`（推进没落盘却报 version vN）。
// 两者都交给 `query/observer-kernel.ts` 在**同一段输出**里说明（ADR-0049）。
import type { CandidateIdentityChange, EvaluatorStatus, IdentityChangeDecision, IdentityModel } from "./types.js";
import { nextVersion, writeIdentityVersion } from "./timeline.js";
import { readReflections } from "../../reflection/engine.js";
import { candidateOf } from "./candidate.js";
import { today } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";
import { scrubUnsafe } from "../../security/scrub.js";

export interface EvalGates {
  minCount?: number;       // 重复性：同向轨迹最小次数
  minRecency?: number;     // 时间稳定：recency 下限
  maxContradiction?: number; // 反证：contradiction 上限
  halfLifeDays?: number;   // 时间衰减半衰期
  lastSeen?: string;       // 最近一次观察日期（recency 基准）
}

/**
 * 评估一个候选（**纯函数**：不改 `c`、不改 `gates`）。
 *
 * 返回值里的 `chosen` 是**带更新后 confidence 的新对象**（不是入参 `c`）—— 调用方要拿它去推进，
 * 不要再读原 `c`（那上面的 `recency/overall` 是 evaluator 之前的默认值）。
 */
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
  // 重算 overall（置信 = frequency×recency×consistency 的加权合成，保留维度可解释）；
  // **写成新对象**，`c` 原样不动（B17①）。
  const overall = Math.max(0.05, Math.min(0.98, c.confidence.frequency * 0.35 + recency * 0.25 + c.confidence.consistency * 0.3 + (1 - c.confidence.contradiction) * 0.1));
  const chosen: CandidateIdentityChange = { ...c, confidence: { ...c.confidence, recency, overall } };
  const recenyOk = recency >= minRecency;
  if (!recenyOk) reasons.push(`时间稳定不足（recency ${recency.toFixed(2)} < ${minRecency}）`);
  const contraOk = c.confidence.contradiction <= maxContradiction;
  if (!contraOk) reasons.push(`反证过多（${c.confidence.contradiction.toFixed(2)} > ${maxContradiction}）`);
  const status: EvaluatorStatus = reasons.length === 0 ? "accepted" : countOk ? "candidate" : "rejected";
  return { status, reasons, chosen };
};

/** 一次身份推进的完整结果（含**两处写/读降级**的形状，见文件头 B2）。 */
export interface IdentityAdvanceResult {
  model: IdentityModel;
  decisions: IdentityChangeDecision[];
  applied: CandidateIdentityChange[];
  /** 反思输入的削样本事实：`skipped > 0` / 有 `readFailure` ⇒ 本次闸门结论基于**不完整**样本。 */
  reflections: { skipped: number; readFailure?: string };
  /** 时间切片落盘结果（`ok:false` ⇒ 输出里的 `version vN` 并没有写进 `.shadow/identity/`）。 */
  write: PersistOutcome;
}

// 读反思 → 生成候选 → 三道闸门 → 接受者推进 identity(t0)->t1 ->timeline。
// 不自动改 soul.json（只推进派生切片；核心写须 H3gate，见 subject/soul/write.ts / ADR-0106）。
export const advanceIdentity = async (fs: any, ws: string, current: IdentityModel, gates: EvalGates = {}): Promise<IdentityAdvanceResult> => {
  const { reflections, skipped, readFailure } = await readReflections(fs, ws);
  const decisions: IdentityChangeDecision[] = [];
  const applied: CandidateIdentityChange[] = [];
  // B17②：recency 基准 = **最大**的 `period.to`（不是「最后一条」—— 返回顺序不是时间序）。
  // 日期串是 `YYYY-MM-DD`（字典序 = 时间序），故直接比字符串即可。
  const lastSeen = reflections.reduce((m: string, r) => (r.period?.to && r.period.to > m ? r.period.to : m), String(gates.lastSeen || ""));
  // **不改调用方的 `gates`**：拷一份（B17①）。
  const g: EvalGates = { ...gates, lastSeen: lastSeen || undefined };
  for (const r of reflections) {
    const c = candidateOf(r, current.version);
    if (!c) continue;
    const d = evaluateCandidate(c, g);
    decisions.push(d);
    // 推进用 `d.chosen`（带 evaluator 更新后的 confidence），不是原 `c`。
    if (d.status === "accepted" && d.chosen) applied.push(d.chosen);
  }
  let model = current;
  let write: PersistOutcome = { ok: true };
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
    write = await writeIdentityVersion(fs, ws, model);
  }
  return { model, decisions, applied, reflections: { skipped, readFailure }, write };
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
