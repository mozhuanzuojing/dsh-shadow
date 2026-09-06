// dsh-shadow —— planning/render.ts：Planning 渲染（comparison 非 winner；无 score；objective lineage 保留）。
import type { PlanningContext, PlanEvaluation } from "./types.js";

export const renderContext = (ctx: PlanningContext) => {
  const lines = ["[Planning Context]"];
  lines.push(`objective(source:${ctx.objective.source}) ${ctx.objective.description} · constraints ${ctx.objective.constraints.join("、") || "—"}`);
  lines.push(`simulationReferences ${ctx.simulationReferences.join("、") || "—"}`);
  return lines.join("\n");
};

export const renderEvaluation = (ev: PlanEvaluation) => {
  const lines = ["[Planning Evaluation]（comparison）"];
  for (const c of ev.candidates) {
    const sat = (c as any).satisfiedConstraints || c.constraints.filter((x) => String(x).includes("under"));
    const vio = (c as any).violatedConstraints || [];
    lines.push(`  candidate ${c.id} · satisfiedConstraints: ${sat.join("、") || "—"} · violatedConstraints: ${vio.join("、") || "—"} · uncertainty ${c.uncertainty.toFixed(2)}`);
  }
  for (const t of ev.tradeoffs.slice(0, 4)) lines.push(`  tradeoff: if ${t.condition} → ${t.consequence} (uncertainty ${t.uncertainty.toFixed(2)})`);
  for (const q of ev.unresolvedQuestions.slice(0, 3)) lines.push(`  unresolved: ${q}`);
  lines.push("（是 comparison：比较哪些约束被满足/违反，非系统价值判断/谁最好）");
  return lines.join("\n");
};
