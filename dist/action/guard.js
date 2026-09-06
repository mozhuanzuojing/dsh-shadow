// 139/140：Simulation 不直接执行 Action；Candidate ≠ Approval（禁 expectedSuccess/confidence）。
export const candidateIsClean = (c) => c?.expectedSuccess === undefined && c?.confidence === undefined;
export const assertCandidateClean = (c) => ({ ok: candidateIsClean(c), reason: candidateIsClean(c) ? undefined : "candidate 禁 expectedSuccess/confidence（Simulation Outcome 不得升级为行动信念）" });
// ActionExecution 是事件非 RealityClaim；Action Scope ≠ Reality Ownership（禁 should_exist/correct/proves）。
const EXECUTION_FORBIDDEN = /RealityClaim|RealityEvidence|confirmed causal|should_exist|is correct|proves|architectural direction correct/i;
export const executionIsEvent = (e) => !EXECUTION_FORBIDDEN.test(String(e?.result || ""));
export const assertExecutionEvent = (e) => ({ ok: executionIsEvent(e), reason: executionIsEvent(e) ? undefined : "ActionExecution.result 是事件，不得声称 RealityClaim/RealityEvidence/should_exist/is correct" });
// ActionFeedback 只记录"观察到符合某些预期结果"，Success ≠ Capability / ≠ Identity / ≠ Model Validation。
const FEEDBACK_FORBIDDEN = /^i am better$|我预测正确|identity change|confidence increase|validated|proves|confirm|方向正确|架构方向/i;
export const feedbackIsNeutral = (f) => !FEEDBACK_FORBIDDEN.test(String(f?.successIndicator || ""));
export const renderCandidate = (c) => ["[Action Candidate]"].concat([
    `basedOnSimulation ${c.basedOnSimulation.join("、") || "—"}`,
    `assumedConditions ${c.assumedConditions.join("、") || "—"}`,
    `proposedChange ${c.proposedChange} · uncertainty ${c.uncertainty.toFixed(2)}`,
    `（候选：生成行动建议 ≠ 执行动作；需 approval/policy 才 execute）`,
]).join("\n");
export const renderExecution = (e) => ["[Action Execution]"].concat([
    `candidate ${e.candidateId} · at ${e.executedAt}`,
    `environmentChange ${e.environmentChange}（某个行动发生了，非"我改变了世界"）`,
    `result ${e.result}`,
]).join("\n");
export const renderFeedback = (f) => ["[Action Feedback]"].concat([
    `execution ${f.executionId} · observed ${f.observedChanges.join("、") || "—"}`,
    `successIndicator ${f.successIndicator}（观察结果，非"我预测正确"）`,
    `unexpected ${f.unexpectedEffects.join("、") || "—"} · validationRefs ${f.validationRefs.join("、") || "—"}`,
]).join("\n");
