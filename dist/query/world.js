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
import { readClaims, readClaimsDetailed } from "../reality/claim/persist.js";
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
    const { claims, corrupt } = await readClaimsDetailed(fs, ws);
    const validations = claims.flatMap((c) => c.validationHistory.map((id) => ({ id })));
    const graph = buildRepresentationGraph(claims, validations);
    // **坏件时不覆盖落盘图**（v1.15.61）：由残缺 claims 建出的图**更小**，写回 `graph.json` 是**不可逆**的
    // 「用残缺覆盖完整」——与前面几轮修的「坏件不写回」是同一条纪律（ADR-0049 / adr/0083 §2）。
    let corruptNote = "";
    if (corrupt > 0) {
        corruptNote = `\n> ⚠ 有 **${corrupt}** 个 claim 坏件被跳过：下面的图**不完整**，且**本次未覆盖落盘图**（请人工修复后重跑）。`;
        console.log(`[dsh-shadow] world graph 未覆盖：${corrupt} 个 claim 坏件`);
    }
    else {
        await writeGraph(fs, ws, graph);
    }
    const subject = String(args?.subject || "");
    // 用**唯一判据源** `isAdmissibleClaim`，不再手写 `c.status === "supported"`
    // （v1.15.32 / ADR-0070 T5 第 4 次复核：真漂移，同 ADR-0063/D5 一族）。
    const supportedSubject = claims.find((c) => isAdmissibleClaim(c) && (!subject || c.subjectRef === subject || c.subject === subject));
    const obss = await readObservations(fs, ws, supportedSubject ? (supportedSubject.subjectRef || supportedSubject.subject) : subject);
    return scrubFinal(RECALL_PREFIX + explain(graph, subject, obss, claims) + corruptNote + flushWarn);
}
