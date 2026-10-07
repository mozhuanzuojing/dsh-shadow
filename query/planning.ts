// dsh-shadow —— query/planning.ts：Adaptive Planning seam（v0.34）。
// 从 query/query.ts 迁出：plan（constrained comparison，非 autonomous desire formation；
// objective 外部来源；无 score/winner）。只比较路径，不做系统价值判断。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runPlanning(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { assertObjectiveExternal, assertCandidateNoScore, assertEvaluationComparison, assertCriteriaNotValue } from "../stance/planning/guard.js";
import { renderContext, renderEvaluation } from "../stance/planning/render.js";
import type { PlanningComparison } from "../stance/planning/types.js";
import type { ShadowQueryDeps } from "./types.js";

export interface PlanningCtx { fs: any; ws: string; flushWarn: string }

/** Returns the rendered body for the plan mode, or undefined if not this family. */
export async function runPlanning(deps: ShadowQueryDeps, args: any, ctx: PlanningCtx): Promise<string | undefined> {
  if (String(args?.mode || "") !== "plan") return undefined;
  const { fs, ws, flushWarn } = ctx;
  const objective = { source: "external" as const, description: String(args?.objective || ""), constraints: args?.constraints || [] };
  const g = assertObjectiveExternal(objective);
  if (!g.ok) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + g.reason + flushWarn);
  if (String(args?.objectiveSource) === "observer") return scrubFinal(RECALL_PREFIX + "[Planning Rejected] objective 禁自生成（observer.generateObjective()）" + flushWarn);
  const criteria = String(args?.criteria || "");
  const gc = assertCriteriaNotValue(criteria);
  if (!gc.ok) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + gc.reason + flushWarn);
  const candidates = (args?.candidates as any[]) || [];
  // **B5（Lead 授权本文件改动）**：把调用方**声明**的「约束满足/违反」透传下来 —— 原先这份 whitelist
  // 映射把它们丢掉，于是渲染器只能 `(c as any)` + 「文本含 `under` 子串」嗅探，`violatedConstraints`
  // 恒空 ⇒ 输出里 `violatedConstraints: —` 是**永远为真的假读数**。保持本文件「不校验、直接取」的风格。
  const planCandidates = candidates.map((c: any, i: number) => ({ id: `pc-${Date.now()}-${i}`, basedOnSimulation: c.basedOnSimulation || [], actionSequence: c.actionSequence || [], assumptions: c.assumptions || [], constraints: c.constraints || [], satisfiedConstraints: c.satisfiedConstraints || [], violatedConstraints: c.violatedConstraints || [], uncertainty: Number(c.uncertainty) || 0.5 }));
  let badScore: string | null = null;
  for (const c of planCandidates) { const g2 = assertCandidateNoScore(c as any); if (!g2.ok) { badScore = g2.reason; break; } }
  if (badScore) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + badScore + flushWarn);
  // A7（`noImplicitAny: true`）：空数组字面量在无上下文类型处需显式标注（`PlanningContext` 要 `string[]`）。
  const ctx2 = { id: `ctx-${Date.now()}`, realitySnapshot: [] as string[], representationSnapshot: [] as string[], simulationReferences: args?.simulationRefs || [], objective };
  const ev: any = { candidates: planCandidates, tradeoffs: String(criteria) ? [{ condition: criteria, consequence: "possible", uncertainty: 0.5 }] : [], unresolvedQuestions: ["只比较路径，非系统价值判断（需外部约束权衡）"] };
  const g3 = assertEvaluationComparison(ev); if (!g3.ok) return scrubFinal(RECALL_PREFIX + "[Planning Rejected] " + g3.reason + flushWarn);
  // B5：**真的构造** `PlanningComparison`（`types.ts` 的那个类型此前全仓零消费者）并交给渲染 ——
  // 渲染器只报这里真的传下去的值（空数组 ⇒ 该段省略），不再有子串嗅探与恒空的 `violatedConstraints: —`。
  const comparison: PlanningComparison = { candidates: planCandidates.map((c) => ({ id: c.id, satisfiedConstraints: c.satisfiedConstraints, violatedConstraints: c.violatedConstraints, uncertainty: c.uncertainty })) };
  return scrubFinal(RECALL_PREFIX + renderContext(ctx2) + "\n" + renderEvaluation(ev, comparison) + flushWarn);
}
