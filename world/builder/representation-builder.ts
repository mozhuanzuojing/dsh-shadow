// dsh-shadow —— world/builder/representation-builder.ts：RepresentationGraph 构建（可重建索引，非新事实源）。
import type { RealityClaim } from "../../reality/types.js";
import type { RepresentationGraph } from "../types.js";
import { GRAPH_VERSION } from "../types.js";
import { createRepresentationFromClaims, isAdmissibleClaim } from "../guard/claim-admission.js";
import { today } from "../../core/util.js";

export const buildRepresentationGraph = (claims: RealityClaim[], validations: { id: string }[]): RepresentationGraph => {
  // 「可准入」的判据**只有一处**：`isAdmissibleClaim`（`world/guard/claim-admission.ts:6`）。
  // 本行原为手写 `c.status === "supported"` —— 与 `query/world.ts` 各写一遍，而**唯一判据源就在
  // 本文件已 import 的那个模块里**（v1.15.32 / ADR-0070 T5 第 4 次复核：真漂移，同 ADR-0063/D5 一族）。
  const supported = claims.filter(isAdmissibleClaim);
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
