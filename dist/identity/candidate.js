import { proposalTypeOfLearning } from "./types.js";
import { today } from "../core/util.js";
import { scrubUnsafe } from "../security/scrub.js";
const clamp = (x) => Math.max(0.05, Math.min(0.98, x));
// 多维 confidence（Identity ≠ Assertion：保留 frequency/recency/consistency/contradiction/overall 以解释成因）。
export const identityConfidenceOf = (opts) => {
    const frequency = clamp(opts.traceCount ? Math.min(1, opts.traceCount / 20) : 0);
    const recency = clamp(opts.recency);
    const consistency = clamp(opts.successRate);
    const contradiction = clamp(Math.min(1, opts.contradiction));
    const overall = clamp(frequency * 0.35 + recency * 0.25 + consistency * 0.3 + (1 - contradiction) * 0.1);
    return { frequency, recency, consistency, contradiction, overall };
};
// 由一条 Reflection 生成 Candidate（learning.type 为 principle/anti_pattern 时）。
export const candidateOf = (r, fromVersion) => {
    const proposalType = proposalTypeOfLearning(r.learning.type);
    if (!proposalType)
        return null; // unknown → 不成候选
    const content = (r.learning.statement || "").slice(0, 120);
    if (!content)
        return null;
    const top = r.pattern.decisionOutcomeCorrelation.find((c) => c.count >= 3);
    const consistency = top ? top.successRate : 0;
    // 反证 = 反思里出现认知偏差（deviationPatterns = 当时没看到但后来发生的）——每条偏差即一份反证。
    const contradiction = Math.min(0.9, (r.observation.deviationPatterns?.length || 0) * 0.1);
    const recency = 0.8; // 由 evaluator 依据时距重算（此处默认，evaluator 覆盖）
    const confidence = identityConfidenceOf({ traceCount: r.learning.evidenceCount, successRate: consistency, contradiction, recency });
    return {
        id: `cic-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        observerId: r.observerId || "unknown",
        fromVersion,
        proposal: { type: proposalType, content: scrubUnsafe(content) },
        evidence: { reflections: r.id ? [r.id] : [], traceCount: r.learning.evidenceCount },
        confidence,
        status: "candidate",
        createdAt: today(),
    };
};
export const renderCandidate = (c) => {
    const lines = [`[Candidate ${c.status}]`];
    lines.push(`proposal ${c.proposal.type} · ${c.proposal.content}`);
    lines.push(`evidence traces=${c.evidence.traceCount} · reflections=${c.evidence.reflections.length}`);
    lines.push(`confidence freq=${c.confidence.frequency.toFixed(2)} recency=${c.confidence.recency.toFixed(2)} consistency=${c.confidence.consistency.toFixed(2)} contradiction=${c.confidence.contradiction.toFixed(2)} overall=${c.confidence.overall.toFixed(2)}`);
    return lines.join("\n");
};
