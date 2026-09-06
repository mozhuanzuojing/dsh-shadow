import { parseTriple } from "../types.js";
import { scrubUnsafe } from "../../security/scrub.js";
export const claimOf = (opts) => {
    const obs = opts.observations || [];
    if (!obs.length)
        return null; // 无 observation 不产 claim（Temporal/Federation alone 不行）
    const first = obs[0];
    const triple = parseTriple(first.observation);
    const perspectives = Array.from(new Set(obs.flatMap((o) => o.sourcePerspectives)));
    const validationOutcomes = (opts.validations || []).map((v) => v.outcome);
    const supported = obs.length >= 2 && validationOutcomes.includes("validated");
    const unstable = validationOutcomes.some((o) => o === "rejected");
    const status = unstable ? "unstable" : supported ? "supported" : "candidate";
    const evidenceStrength = Math.min(1, obs.length / 8);
    const repetition = Math.min(1, obs.length / 6);
    const temporalConsistency = obs.length >= 2 ? 0.8 : 0.4;
    const alternativeSurvival = validationOutcomes.includes("validated") ? 0.7 : 0.4;
    const id = opts.id || `rc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    return {
        id,
        subjectRef: first.subjectRef,
        subject: triple.subject,
        predicate: triple.predicate,
        object: triple.object,
        supportingObservations: obs.map((o) => o.id),
        validationHistory: (opts.validations || []).map((v) => v.id),
        perspectiveRefs: perspectives,
        temporalContext: first.temporalContext,
        confidence: { evidenceStrength, repetition, temporalConsistency, alternativeSurvival },
        status,
        lineage: { observations: obs.map((o) => o.id), validations: (opts.validations || []).map((v) => v.id), perspectives },
    };
};
export const renderClaim = (c) => {
    const lines = ["[Reality Claim]"];
    lines.push(`id ${c.id} · status ${c.status}`);
    lines.push(`claim ${scrubUnsafe(c.subject)} ${c.predicate} ${scrubUnsafe(c.object)}`);
    const cf = c.confidence;
    lines.push(`confidence evidence=${cf.evidenceStrength.toFixed(2)} repetition=${cf.repetition.toFixed(2)} temporal=${cf.temporalConsistency.toFixed(2)} altSurvival=${cf.alternativeSurvival.toFixed(2)}`);
    lines.push(`lineage observations=${c.lineage.observations.length} validations=${c.lineage.validations.length} perspectives=${c.lineage.perspectives.join("、") || "—"}`);
    return lines.join("\n");
};
