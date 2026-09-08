// dsh-shadow —— query/planning.ts：Adaptive Planning seam（v0.34）。
// 从 query/query.ts 迁出：plan（constrained comparison，非 autonomous desire formation；
// objective 外部来源；无 score/winner）。只比较路径，不做系统价值判断。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runPlanning(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { assertObjectiveExternal, assertCandidateNoScore, assertEvaluationComparison, assertCriteriaNotValue } from "../planning/guard.js";
import { renderContext, renderEvaluation } from "../planning/render.js";
/** Returns the rendered body for the plan mode, or undefined if not this family. */
export async function runPlanning(deps, args, ctx) {
    if (String(args?.mode || "") !== "plan")
        return undefined;
    const { fs, ws, flushWarn } = ctx;
    const objective = { source: "external", description: String(args?.objective || ""), constraints: args?.constraints || [] };
    const g = assertObjectiveExternal(objective);
    if (!g.ok)
        return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + g.reason + flushWarn);
    if (String(args?.objectiveSource) === "observer")
        return scrubFinal(RECALL_PREFIX + "[Planning Rejected] objective 禁自生成（observer.generateObjective()）" + flushWarn);
    const criteria = String(args?.criteria || "");
    const gc = assertCriteriaNotValue(criteria);
    if (!gc.ok)
        return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + gc.reason + flushWarn);
    const candidates = args?.candidates || [];
    const planCandidates = candidates.map((c, i) => ({ id: `pc-${Date.now()}-${i}`, basedOnSimulation: c.basedOnSimulation || [], actionSequence: c.actionSequence || [], assumptions: c.assumptions || [], constraints: c.constraints || [], uncertainty: Number(c.uncertainty) || 0.5 }));
    let badScore = null;
    for (const c of planCandidates) {
        const g2 = assertCandidateNoScore(c);
        if (!g2.ok) {
            badScore = g2.reason;
            break;
        }
    }
    if (badScore)
        return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + badScore + flushWarn);
    const ctx2 = { id: `ctx-${Date.now()}`, realitySnapshot: [], representationSnapshot: [], simulationReferences: args?.simulationRefs || [], objective };
    const ev = { candidates: planCandidates, tradeoffs: String(criteria) ? [{ condition: criteria, consequence: "possible", uncertainty: 0.5 }] : [], unresolvedQuestions: ["只比较路径，非系统价值判断（需外部约束权衡）"] };
    const g3 = assertEvaluationComparison(ev);
    if (!g3.ok)
        return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + g3.reason + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderContext(ctx2) + "\n" + renderEvaluation(ev) + flushWarn);
}
