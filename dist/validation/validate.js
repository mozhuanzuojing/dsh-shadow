import { MAX_EVIDENCE_N } from "./types.js";
const POS = ["成功", "下降", "通过", "解决", "优化", "提升", "改进", "稳定", "improved", "fixed", "passed", "optimized", "stable", "success", "reduced"];
const NEG = ["失败", "瓶颈", "恶化", "故障", "回退", "出错", "复杂", "increased", "failed", "failure", "complexity", "issue", "bottleneck"];
const isPositive = (s) => { const t = String(s || "").toLowerCase(); return POS.some((p) => t.includes(p.toLowerCase())) && !NEG.some((n) => t.includes(n.toLowerCase())); };
export const validateHypothesis = (h, evidences) => {
    const support = evidences.filter((e) => isPositive(e.actualOutcome)).length;
    const contradiction = evidences.filter((e) => !isPositive(e.actualOutcome)).length;
    const applied = evidences.length;
    const supportRate = applied ? support / applied : 0;
    const contradictionRate = applied ? contradiction / applied : 0;
    // alternativeSurvival：反例越多，越有"更简单解释/随机"存活的余地 → 存活度越低
    const alternativeSurvival = Math.max(0, Math.min(1, 1 - contradictionRate * 1.5 - (support >= 1 ? 0 : 0.3)));
    const confidence = {
        evidenceStrength: supportRate,
        repetition: Math.min(1, applied / MAX_EVIDENCE_N),
        contradiction: contradictionRate,
        alternativeSurvival,
    };
    // 生命周期判定
    let outcome;
    let conclusion;
    if (applied === 0) {
        outcome = expiredByAge(h) ? "expired" : "observed"; // 无证据且已过期 → expired
        if (outcome === "expired") {
            conclusion = "当前生命周期结束（无新证据且超期），可重新激活";
        }
        else {
            conclusion = "观察到假设但暂无未来证据（未验证）";
            outcome = "observed";
        }
    }
    else if (applied >= 3 && supportRate >= 0.7 && contradiction <= 1 && alternativeSurvival >= 0.4) {
        outcome = "validated";
        conclusion = `多个独立 Future Evidence + 替代解释存活度高（${support}/${applied} 支持 · 反例 ${contradiction}）→ validated`;
    }
    else if (contradiction >= 2 || (applied >= 2 && supportRate < 0.5)) {
        outcome = "rejected";
        conclusion = `反例过多（support=${support} contradiction=${contradiction}），主假设被现实推翻`;
    }
    else if (support >= 1) {
        outcome = "observed";
        conclusion = `未来出现支持事件（support=${support}），但多重验证/替代解释竞争不足 → observed`;
    }
    else {
        outcome = "observed";
        conclusion = "观察到假设，暂无强支持/强反例";
    }
    // 竞争：替代解释在"主假设被反、或足够弱"时胜出
    const altBase = h.alternativeExplanation[0]?.alternatives || [];
    const alternativeEvaluation = altBase.slice(0, 3).map((a) => ({
        alternative: a.description,
        supported: contradiction >= 2 || supportRate < 0.5,
        weakened: contradiction === 0 && supportRate >= 0.7,
    }));
    return { hypothesisId: h.id, outcome, confidence, alternativeEvaluation, applied: { support, contradiction }, conclusion };
};
export const expiredByAge = (h) => {
    const days = Math.max(0, Math.round((Date.now() - Date.parse(h.createdAt || "")) / 86400000));
    return days >= 365; // 一年无新证据视为过期
};
export const toArtifact = (h, result, evidenceIds, evaluatedAt) => ({
    id: `va-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    hypothesisId: h.id,
    evaluatedAt,
    evidenceIds,
    alternativeResults: result.alternativeEvaluation,
    confidence: result.confidence,
    outcome: result.outcome,
    context: {
        hypothesisProjectionSnapshot: h,
        currentRealitySnapshot: { support: result.applied.support, contradiction: result.applied.contradiction, applied: result.applied.support + result.applied.contradiction },
        perceptionDelta: `当时视角(${h.claimCandidate.slice(0, 30)}) vs 现状(支持${result.applied.support}/反例${result.applied.contradiction})`,
    },
});
export const renderValidation = (result) => {
    const lines = ["[Validation]"];
    const c = result.confidence;
    lines.push(`hypothesis ${result.hypothesisId} · outcome ${result.outcome}`);
    lines.push(`applied support=${result.applied.support} contradiction=${result.applied.contradiction} · ${result.conclusion}`);
    lines.push(`confidence evidenceStrength=${c.evidenceStrength.toFixed(2)} repetition=${c.repetition.toFixed(2)} contradiction=${c.contradiction.toFixed(2)} alternativeSurvival=${c.alternativeSurvival.toFixed(2)}`);
    if (result.alternativeEvaluation.length)
        lines.push(`alternative ${result.alternativeEvaluation.map((a) => `${a.alternative}(${a.supported ? "supported" : "weakened"})`).join("；")}`);
    return lines.join("\n");
};
