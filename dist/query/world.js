// dsh-shadow —— query/world.ts：World Representation Kernel seam（v0.31）。
// 从 query/query.ts 迁出：world-represent（RepresentationObject 只接受 supported）、world-relation（RelationHypothesis 恒 hypothesis）、
// world（Graph 可重建 + explain）。只读 claim/观察派生，graph 可 rm -rf 重建，不覆盖事实。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runWorld(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { createRepresentationFromClaims, renderAdmission, isAdmissibleClaim } from "../world/guard/claim-admission.js";
import { relationHypothesisOf, isRelationHypothesis, renderRelation } from "../world/guard/relation-guard.js";
import { buildRepresentationGraph } from "../world/builder/representation-builder.js";
import { writeGraph } from "../world/persistence/persist.js";
import { explain } from "../world/explain/explain.js";
import { readClaims } from "../reality/claim/persist.js";
import { readObservations } from "../reality/registry.js";
const MODES = new Set(["world-represent", "world-relation", "world"]);
/** Returns the rendered body for a world mode, or undefined if not one of this family. */
export async function runWorld(deps, args, ctx) {
    const mode = String(args?.mode || "");
    if (!MODES.has(mode))
        return undefined;
    const { fs, ws, flushWarn } = ctx;
    if (mode === "world-represent") {
        const claims = await readClaims(fs, ws);
        const subject = String(args?.subject || "");
        const target = claims.filter((c) => !subject || c.subjectRef === subject || c.subject === subject);
        const r = createRepresentationFromClaims(target);
        return scrubFinal(RECALL_PREFIX + renderAdmission(r) + flushWarn);
    }
    if (mode === "world-relation") {
        const rh = relationHypothesisOf({ from: String(args?.from || ""), to: String(args?.to || ""), relation: String(args?.relation || ""), evidence: args?.evidence || [] });
        return scrubFinal(RECALL_PREFIX + renderRelation(rh) + (isRelationHypothesis(rh) ? "" : "\n（relation guard FAIL）") + flushWarn);
    }
    // world
    const claims = await readClaims(fs, ws);
    const validations = claims.flatMap((c) => c.validationHistory.map((id) => ({ id })));
    const graph = buildRepresentationGraph(claims, validations);
    await writeGraph(fs, ws, graph);
    const subject = String(args?.subject || "");
    // 用**唯一判据源** `isAdmissibleClaim`，不再手写 `c.status === "supported"`
    // （v1.15.32 / ADR-0070 T5 第 4 次复核：真漂移，同 ADR-0063/D5 一族）。
    const supportedSubject = claims.find((c) => isAdmissibleClaim(c) && (!subject || c.subjectRef === subject || c.subject === subject));
    const obss = await readObservations(fs, ws, supportedSubject ? (supportedSubject.subjectRef || supportedSubject.subject) : subject);
    return scrubFinal(RECALL_PREFIX + explain(graph, subject, obss, claims) + flushWarn);
}
