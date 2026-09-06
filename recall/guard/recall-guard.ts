// dsh-shadow —— recall/guard/recall-guard.ts：Recall 边界守卫（198–205）。
// 核心命题：Recall = Access Transition，不是 Reality Reconstruction；忆起不提升证据等级、不生成新观察/知识/身份。
import type { ForgottenRecord, RecallEvent } from "../types/index.js";

// 199: Forgotten ≠ Deleted。遗忘只是访问状态变化，不是删除/否定（禁 deleted/false/invalid/失效）。
const DELETED = /deleted|invalid|不存在|已删除|已失效|false|失效/i;
export const forgottenHasNoDeletion = (r: ForgottenRecord) => !DELETED.test(r.reason || "");
export const assertForgottenNoDeletion = (r: ForgottenRecord) => ({ ok: forgottenHasNoDeletion(r), reason: forgottenHasNoDeletion(r) ? undefined : "遗忘不是删除/否定：ForgottenRecord 禁 deleted/false/invalid；只标记访问状态（Forget ≠ Delete）" });

// 203: Confabulation Boundary。Trigger 禁 internal certainty/intuition/confidence/self belief（self-generated truth）。
const SELF_TRIGGER = /certainty|intuition|confidence|self belief|internal belief|self-generated|internal|我确定|我应该记得|直觉|自信|填补空白/i;
export const triggerIsExternal = (t: { type?: string; sourceRef?: string }) =>
  /external|conversation|explicit|association|cue|request/i.test(String(t?.type || "")) && !SELF_TRIGGER.test(`${String(t?.type || "")} ${String(t?.sourceRef || "")}`);
export const assertTriggerExternal = (t: { type?: string; sourceRef?: string }) => ({ ok: triggerIsExternal(t), reason: triggerIsExternal(t) ? undefined : "Recall Trigger 禁 internal certainty/intuition/confidence/self belief（self-generated truth → Confabulation；允许 external cue/conversation/explicit request/existing association）" });

// 202: Recall Lineage Required。Recall → Original Memory Trace → Observation/Experience；trigger.sourceRef 必须存在。
export const recallLineageComplete = (ev: RecallEvent) => !!(ev?.trigger?.sourceRef && ev?.lineage?.originalRecord && (ev.lineage.observationRefs || []).length >= 0);
export const assertRecallLineage = (ev: RecallEvent) => ({ ok: recallLineageComplete(ev), reason: recallLineageComplete(ev) ? undefined : "Recall Lineage Required：Recall→Original Memory Trace→Observation/Experience；trigger.sourceRef 必须存在" });

// 198: Recall ≠ Observation。忆起不产生新观察/新 RealityClaim。
const NEW_OBS = /new observation|new RealityClaim|new hypothesis|新观察|新的观察|new claim/i;
export const recallNotObservation = (ev: RecallEvent) => !NEW_OBS.test(JSON.stringify({ trigger: ev?.trigger, lineage: ev?.lineage }));
export const assertRecallNotObservation = (ev: RecallEvent) => ({ ok: recallNotObservation(ev), reason: recallNotObservation(ev) ? undefined : "Recall ≠ Observation：忆起不产生新观察/新 RealityClaim（Recall = Access Transition，非 Reality Reconstruction）" });

// 205: Recall Does Not Increase Epistemic Status。忆起只是访问变化，不是验证。
const CERTAINTY = /supported|validated|stable|high confidence|更确定|比之前.*确定|certainty increase|increase.*certainty|升级为/i;
export const recallDoesNotIncreaseCertainty = (status: string) => !CERTAINTY.test(status || "");
export const assertRecallNoStatusIncrease = (status: string) => ({ ok: recallDoesNotIncreaseCertainty(status), reason: recallDoesNotIncreaseCertainty(status) ? undefined : "Recall 不提升证据等级/epistemic status（忆起只是访问变化，不是验证；Recall Does Not Increase Certainty）" });
