// dsh-shadow —— planning/render.ts：Planning 渲染（comparison 非 winner；无 score；objective lineage 保留）。
import type { PlanningContext, PlanEvaluation, PlanningComparison } from "./types.js";

export const renderContext = (ctx: PlanningContext) => {
  const lines = ["[Planning Context]"];
  lines.push(`objective(source:${ctx.objective.source}) ${ctx.objective.description} · constraints ${ctx.objective.constraints.join("、") || "—"}`);
  lines.push(`simulationReferences ${ctx.simulationReferences.join("、") || "—"}`);
  return lines.join("\n");
};

/**
 * Planning 评估渲染（comparison，**非** winner）。
 *
 * **B5 修复**：旧实现是
 *   `const sat = (c as any).satisfiedConstraints || c.constraints.filter((x) => String(x).includes("under"));`
 *   `const vio = (c as any).violatedConstraints || [];`
 * 两个问题：① `satisfiedConstraints` 退化成「约束文本里含 `under` 子串」—— 一个**判据**被写死进渲染函数
 *（`guard.ts` 的 `criteriaNotValue` 恰好把 `under constraint X` 当作合法措辞的**例子**，被这里当成了实现）；
 * ② `PlanCandidate` 上**根本没有**这两个字段（它们只声明在 `PlanningComparison`）⇒ `vio` 恒空，
 * 于是每次打印 `violatedConstraints: —`，读者读成「**没有任何约束被违反**」—— 一个**永远为真的假读数**。
 *
 * 现在：真实比较结果由调用方（`query/planning.ts`）构造 `PlanningComparison` 传入；渲染器**只报调用方
 * 真的声明了的**约束 —— 空数组 ⇒ **整段省略**（既不打 `—`，也不反过来说「没有违反」）。
 * ⚠ 一处**口径边界**（有意保守）：透传侧写的是 `c.satisfiedConstraints || []` ⇒ 「未声明」与「声明了空数组」
 * 在渲染器里不可区分，两者都省略。要区分就得去掉那个 `|| []` 默认值（不在本轮口径内）。
 */
export const renderEvaluation = (ev: PlanEvaluation, comparison?: PlanningComparison) => {
  const lines = ["[Planning Evaluation]（comparison）"];
  for (const c of ev.candidates) {
    const cmp = comparison?.candidates.find((x) => x.id === c.id);
    const sat = cmp && cmp.satisfiedConstraints.length ? ` · satisfiedConstraints: ${cmp.satisfiedConstraints.join("、")}` : "";
    const vio = cmp && cmp.violatedConstraints.length ? ` · violatedConstraints: ${cmp.violatedConstraints.join("、")}` : "";
    lines.push(`  candidate ${c.id} · constraints: ${c.constraints.join("、") || "—"}${sat}${vio} · uncertainty ${c.uncertainty.toFixed(2)}`);
  }
  for (const t of ev.tradeoffs.slice(0, 4)) lines.push(`  tradeoff: if ${t.condition} → ${t.consequence} (uncertainty ${t.uncertainty.toFixed(2)})`);
  for (const q of ev.unresolvedQuestions.slice(0, 3)) lines.push(`  unresolved: ${q}`);
  lines.push("（是 comparison：列出每条路径**声明**的约束与调用方声明「已满足/被违反」的约束；非系统价值判断，也不回答谁最好）");
  return lines.join("\n");
};
