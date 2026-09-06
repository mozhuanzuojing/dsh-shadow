import { GRAPH_VERSION } from "../types.js";
import { createRepresentationFromClaims } from "../guard/claim-admission.js";
import { today } from "../../core/util.js";
export const buildRepresentationGraph = (claims, validations) => {
    const supported = claims.filter((c) => c.status === "supported");
    const objects = [];
    const seen = new Set();
    for (const c of supported) {
        const key = c.subjectRef || c.subject;
        if (seen.has(key))
            continue;
        seen.add(key);
        const r = createRepresentationFromClaims([c]);
        if (r.ok && r.object)
            objects.push(r.object);
    }
    return {
        graphVersion: GRAPH_VERSION,
        generatedAt: today(),
        sourceClaims: supported.map((c) => c.id),
        sourceValidations: validations.map((v) => v.id),
        objects,
        relations: [], // 关系绝不自动生成（需显式 RelationHypothesis）
    };
};
