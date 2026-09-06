// dsh-shadow —— action/guard.ts：Action Boundary 守卫（候选禁升级/执行是事件/反馈不改 Identity/Knowledge）。
import type { ActionCandidate, ActionExecution, ActionFeedback } from "./types.js";

// 139/140：Simulation 不直接执行 Action；Candidate ≠ Approval（禁 expectedSuccess/confidence）。
export const candidateIsClean = (c: ActionCandidate) => (c as any)?.expectedSuccess === undefined && (c as any)?.confidence === undefined;
export const assertCandidateClean = (c: ActionCandidate) => ({ ok: candidateIsClean(c), reason: candidateIsClean(c) ? undefined : "candidate 禁 expectedSuccess/confidence（Simulation Outcome 不得升级为行动信念）" });

// ActionExecution 是事件非 RealityClaim。
export const executionIsEvent = (e: ActionExecution) => !/RealityClaim|RealityEvidence|confirmed causal/.test(String(e?.result || ""));
export const assertExecutionEvent = (e: ActionExecution) => ({ ok: executionIsEvent(e), reason: executionIsEvent(e) ? undefined : "ActionExecution.result 是事件，不得声称 RealityClaim/RealityEvidence" });

// ActionFeedback 只记录"观察到符合某些预期结果"，Success ≠ Capability / ≠ Identity / ≠ Knowledge。
export const feedbackIsNeutral = (f: ActionFeedback) => !/^i am better$|我预测正确|identity change|confidence increase/i.test(String(f?.successIndicator || ""));

export const renderCandidate = (c: ActionCandidate) =>
  ["[Action Candidate]"].concat([
    `basedOnSimulation ${c.basedOnSimulation.join("、") || "—"}`,
    `assumedConditions ${c.assumedConditions.join("、") || "—"}`,
    `proposedChange ${c.proposedChange} · uncertainty ${c.uncertainty.toFixed(2)}`,
    `（候选：生成行动建议 ≠ 执行动作；需 approval/policy 才 execute）`,
  ]).join("\n");

export const renderExecution = (e: ActionExecution) =>
  ["[Action Execution]"].concat([
    `candidate ${e.candidateId} · at ${e.executedAt}`,
    `environmentChange ${e.environmentChange}（某个行动发生了，非"我改变了世界"）`,
    `result ${e.result}`,
  ]).join("\n");

export const renderFeedback = (f: ActionFeedback) =>
  ["[Action Feedback]"].concat([
    `execution ${f.executionId} · observed ${f.observedChanges.join("、") || "—"}`,
    `successIndicator ${f.successIndicator}（观察结果，非"我预测正确"）`,
    `unexpected ${f.unexpectedEffects.join("、") || "—"} · validationRefs ${f.validationRefs.join("、") || "—"}`,
  ]).join("\n");
