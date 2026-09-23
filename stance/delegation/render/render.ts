// dsh-shadow —— delegation/render/render.ts：委派渲染（context / check / boundary event audit）。
import type { DelegationContext, AutonomyBoundaryEvent } from "../types/index.js";

export interface DelegationCheckResult {
  delegationId: string;
  action: string;
  allowed: boolean;
  scopeCheck: { inScope: boolean; scope: string[]; action: string };
  constraintCheck: { passed: string[]; violated: string[] };
  boundaryTriggered: boolean;
  reason?: string;
}

export const renderContext = (ctx: DelegationContext) => {
  const lines = ["[Delegation Context]"];
  lines.push(`delegation ${ctx.delegationId} · authority ${ctx.authoritySource}`);
  lines.push(`objectiveRef ${ctx.objectiveRef}（外部目标：Authority A delegated X under constraints C）`);
  lines.push(`allowedScope ${ctx.allowedScope.join("、") || "—"} · constraints ${ctx.constraints.join("、") || "—"}`);
  lines.push(`expiration ${ctx.expiration || "∞"} · revocation ${ctx.revocation ? "revoked" : "active"}`);
  lines.push("（授权事实，非『我拥有能力』；无 trust/confidence/reputation/capabilityLevel）");
  return lines.join("\n");
};

export const renderCheck = (c: DelegationCheckResult) => {
  const lines = ["[Delegation Check]"];
  lines.push(`delegation ${c.delegationId} · action ${c.action} · ${c.allowed ? "ALLOWED" : "REJECTED"}`);
  if (c.reason) lines.push(`reason ${c.reason}`);
  lines.push(`scope ${c.scopeCheck.inScope ? "in-scope" : "out-of-scope"} (${c.scopeCheck.scope.join("、") || "—"})`);
  lines.push(`constraints passed ${c.constraintCheck.passed.join("、") || "—"} · violated ${c.constraintCheck.violated.join("、") || "—"}`);
  lines.push(c.boundaryTriggered ? "（boundary triggered：revocation/expiry/scope-exceed）" : "（no boundary triggered）");
  return lines.join("\n");
};

export const renderEvent = (e: AutonomyBoundaryEvent) => {
  const lines = ["[Delegation Boundary Event]（audit）"];
  lines.push(`delegation ${e.delegationRef} · authority ${e.authorityRef}`);
  lines.push(`objectiveRef ${e.objectiveRef}（lineage Action→Plan→Objective→Delegation→Authority）`);
  lines.push(`candidate ${e.candidateAction} · scope ${e.scopeCheck ? "in-scope" : "out-of-scope"}`);
  lines.push(`constraints passed ${e.constraintCheck.passed.join("、") || "—"} · violated ${e.constraintCheck.violated.join("、") || "—"}`);
  lines.push(`result ${e.executionResult} · boundary ${e.boundaryTriggered ? "triggered" : "none"}`);
  return lines.join("\n");
};
