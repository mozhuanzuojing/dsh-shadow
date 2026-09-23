// dsh-shadow —— agency/render.ts：Agency 渲染（immutable snapshot / selection / boundary event audit）。
import type { AgencyContext, AgencySelection, AgencyBoundaryEvent } from "./types.js";

export const renderContext = (ctx: AgencyContext) => {
  const lines = ["[Agency Context]（immutable authorization snapshot）"];
  lines.push(`objectiveRef ${ctx.objectiveRef} · authoritySource ${ctx.authoritySource} · authorityScope "${ctx.authorityScope}"`);
  lines.push(`constraints ${ctx.constraints.join("、") || "—"}`);
  lines.push("（授权快照：不可自我修改，无升级/扩张 API）");
  return lines.join("\n");
};

export const renderSelection = (sel: AgencySelection) => {
  const lines = ["[Agency Selection]"];
  lines.push(`selectedCandidate ${sel.selectedCandidateId} · reason ${sel.reason}`);
  lines.push("（选择候选 ≠ 选择目的；理由只可能是约束满足）");
  return lines.join("\n");
};

export const renderEvent = (e: AgencyBoundaryEvent) => {
  const lines = ["[Agency Boundary Event]（audit node）"];
  lines.push(`actionCandidate ${e.actionCandidate} · authorityRef ${e.authorityRef}`);
  lines.push(`objectiveRef ${e.objectiveRef}（外部来源：Action→Candidate→Plan→Objective→Authority）`);
  lines.push(`constraintCheck ${e.constraintCheck.join("、") || "—"} · result ${e.executionResult}`);
  lines.push("（为什么执行/谁授权/基于什么/结果 —— 可审计，非自我目的）");
  return lines.join("\n");
};
