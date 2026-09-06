// dsh-shadow —— world/builder/representation-builder.ts：RepresentationGraph 构建（可重建索引，非新事实源）。
import type { RealityClaim } from "../../reality/types.js";
import type { RepresentationGraph } from "../types.js";
import { GRAPH_VERSION } from "../types.js";
import { createRepresentationFromClaims } from "../guard/claim-admission.js";
import { today } from "../../core/util.js";

export const buildRepresentationGraph = (claims: RealityClaim[], validations: { id: string }[]): RepresentationGraph => {
  const supported = claims.filter((c) => c.status === "supported");
  const objects: any[] = [];
  const seen = new Set<string>();
  for (const c of supported) {
    const key = c.subjectRef || c.subject;
    if (seen.has(key)) continue;
    seen.add(key);
    const r = createRepresentationFromClaims([c]);
    if (r.ok && r.object) objects.push(r.object);
  }
  return {
    graphVersion: GRAPH_VERSION,
    generatedAt: today(),
    sourceClaims: supported.map((c) => c.id),
    sourceValidations: validations.map((v) => v.id),
    objects,
    relations: [],   // 关系绝不自动生成（需显式 RelationHypothesis）
  };
};
