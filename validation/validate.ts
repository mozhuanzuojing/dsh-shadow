// dsh-shadow —— validation/validate.ts：validateHypothesis（与 AlternativeExplanation 竞争 → ValidationArtifact）。
// Future Evidence 单向（过去不能验证未来）；不覆盖 Hypothesis（生成 Artifact，保留历史）；不产生 Knowledge/修改 Identity。
import type { FutureEvidence, ValidationArtifact, ValidationResult, ValidationConfidence, AlternativeEvaluation } from "./types.js";
import { MAX_EVIDENCE_N } from "./types.js";
import type { Hypothesis } from "../dream/types.js";
import { today } from "../core/util.js";
// 「正/负结果」的判据**收一处**（ADR-0063/0070）：词表与否决规则见 `core/polarity.ts`。
// 本文件原有一份**与 `dream/compress.ts` 逐字相同**的 `POS`/`NEG`/`isPositive`，且与
// `reflection/patterns/success-rate.ts` 的 `isPositiveOutcome` **给出不同答案**（实测，见该文件注释）。
import { isPositiveOutcome as isPositive } from "../core/polarity.js";

export const validateHypothesis = (h: Hypothesis, evidences: FutureEvidence[]): ValidationResult => {
  const support = evidences.filter((e) => isPositive(e.actualOutcome)).length;
  const contradiction = evidences.filter((e) => !isPositive(e.actualOutcome)).length;
  const applied = evidences.length;
  const supportRate = applied ? support / applied : 0;
  const contradictionRate = applied ? contradiction / applied : 0;
  // alternativeSurvival：反例越多，越有"更简单解释/随机"存活的余地 → 存活度越低
  const alternativeSurvival = Math.max(0, Math.min(1, 1 - contradictionRate * 1.5 - (support >= 1 ? 0 : 0.3)));
  const confidence: ValidationConfidence = {
    evidenceStrength: supportRate,
    repetition: Math.min(1, applied / MAX_EVIDENCE_N),
    contradiction: contradictionRate,
    alternativeSurvival,
  };
  // 生命周期判定
  let outcome: ValidationResult["outcome"];
  let conclusion: string;
  if (applied === 0) {
    outcome = expiredByAge(h) ? "expired" : "observed"; // 无证据且已过期 → expired
    if (outcome === "expired") { conclusion = "当前生命周期结束（无新证据且超期），可重新激活"; }
    else { conclusion = "观察到假设但暂无未来证据（未验证）"; outcome = "observed"; }
  } else if (applied >= 3 && supportRate >= 0.7 && contradiction <= 1 && alternativeSurvival >= 0.4) {
    outcome = "validated"; conclusion = `多个独立 Future Evidence + 替代解释存活度高（${support}/${applied} 支持 · 反例 ${contradiction}）→ validated`;
  } else if (contradiction >= 2 || (applied >= 2 && supportRate < 0.5)) {
    outcome = "rejected"; conclusion = `反例过多（support=${support} contradiction=${contradiction}），主假设被现实推翻`;
  } else if (support >= 1) {
    outcome = "observed"; conclusion = `未来出现支持事件（support=${support}），但多重验证/替代解释竞争不足 → observed`;
  } else {
    outcome = "observed"; conclusion = "观察到假设，暂无强支持/强反例";
  }
  // 竞争：替代解释在"主假设被反、或足够弱"时胜出
  const altBase = h.alternativeExplanation[0]?.alternatives || [];
  const alternativeEvaluation: AlternativeEvaluation[] = altBase.slice(0, 3).map((a) => ({
    alternative: a.description,
    supported: contradiction >= 2 || supportRate < 0.5,
    weakened: contradiction === 0 && supportRate >= 0.7,
  }));
  return { hypothesisId: h.id, outcome, confidence, alternativeEvaluation, applied: { support, contradiction }, conclusion };
};

export const expiredByAge = (h: Hypothesis) => {
  const days = Math.max(0, Math.round((Date.now() - Date.parse(h.createdAt || "")) / 86400000));
  return days >= 365; // 一年无新证据视为过期
};

export const toArtifact = (h: Hypothesis, result: ValidationResult, evidenceIds: string[], evaluatedAt: string): ValidationArtifact => ({
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

export const renderValidation = (result: ValidationResult) => {
  const lines = ["[Validation]"];
  const c = result.confidence;
  lines.push(`hypothesis ${result.hypothesisId} · outcome ${result.outcome}`);
  lines.push(`applied support=${result.applied.support} contradiction=${result.applied.contradiction} · ${result.conclusion}`);
  lines.push(`confidence evidenceStrength=${c.evidenceStrength.toFixed(2)} repetition=${c.repetition.toFixed(2)} contradiction=${c.contradiction.toFixed(2)} alternativeSurvival=${c.alternativeSurvival.toFixed(2)}`);
  if (result.alternativeEvaluation.length) lines.push(`alternative ${result.alternativeEvaluation.map((a) => `${a.alternative}(${a.supported ? "supported" : "weakened"})`).join("；")}`);
  return lines.join("\n");
};
