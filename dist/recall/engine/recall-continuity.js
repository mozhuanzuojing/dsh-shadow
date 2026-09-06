import { assertForgottenNoDeletion, assertTriggerExternal, assertRecallLineage, assertRecallNotObservation, assertRecallNoStatusIncrease } from "../guard/recall-guard.js";
import { readForgottenRecord, writeRecallEvent } from "../persistence/persist.js";
import { today } from "../../core/util.js";
const rand = () => Math.random().toString(36).slice(2, 6);
// 构建 ForgottenRecord（曾经存在、当前不可直接访问）。reason 必须；禁 deleted/false/invalid。
export const buildForgottenRecord = (args) => {
    const originalRef = String(args?.originalRef || "");
    if (!originalRef)
        return { ok: false, reason: "ForgottenRecord 须 originalRef（遗忘的是哪个原记录）" };
    const reason = String(args?.reason || "");
    if (!reason)
        return { ok: false, reason: "ForgottenRecord 须 reason（为什么遗忘）" };
    const record = { id: String(args?.id || `fr-${Date.now()}-${rand()}`), originalRef, forgottenAt: String(args?.forgottenAt || today()), reason, lastAccessibleAt: String(args?.lastAccessibleAt || today()), validationRefs: args?.validationRefs || undefined };
    const g = assertForgottenNoDeletion(record);
    if (!g.ok)
        return { ok: false, reason: g.reason };
    return { ok: true, record };
};
// 构建 RecallEvent（一次忆起）。须引用已遗忘记录；trigger 外部来源；lineage 完整；不产新观察/不提升证据等级。
export const buildRecallEvent = async (fs, ws, args) => {
    const recalledRef = String(args?.recalledRef || "");
    const fr = await readForgottenRecord(fs, ws, recalledRef);
    if (!fr)
        return { ok: false, reason: "Recall 须引用已遗忘记录（recalledRef 无对应 ForgottenRecord；即非新观察）" };
    const trigger = { type: String(args?.triggerType || args?.trigger?.type || ""), sourceRef: String(args?.sourceRef || args?.trigger?.sourceRef || "") };
    const ev = { id: `re-${Date.now()}-${rand()}`, recalledRef, trigger, accessibilityBefore: args?.accessibilityBefore || "forgotten", accessibilityAfter: args?.accessibilityAfter || "recalled", lineage: { originalRecord: String(args?.originalRecord || fr.originalRef), observationRefs: args?.observationRefs || [], validationRefs: args?.validationRefs || fr.validationRefs || [] } };
    const status = String(args?.status || args?.epistemicStatus || args?.support || "");
    const g1 = assertTriggerExternal(trigger);
    if (!g1.ok)
        return { ok: false, reason: g1.reason };
    const g2 = assertRecallLineage(ev);
    if (!g2.ok)
        return { ok: false, reason: g2.reason };
    const g3 = assertRecallNotObservation(ev);
    if (!g3.ok)
        return { ok: false, reason: g3.reason };
    const g4 = assertRecallNoStatusIncrease(status);
    if (!g4.ok)
        return { ok: false, reason: g4.reason };
    await writeRecallEvent(fs, ws, ev);
    return { ok: true, ev };
};
// RecallValidation（Recall ≠ 重新证明）。Recall → existing lineage → 原 RealityClaim；绝不 Recall → 新 RealityClaim / 新 hypothesis。
export const validateRecall = async (fs, ws, args) => {
    const recalledRef = String(args?.recalledRef || "");
    const fr = await readForgottenRecord(fs, ws, recalledRef);
    if (!fr)
        return { ok: false, reason: "无 ForgottenRecord（Recall Validation 无对象；无 lineage）" };
    const v = { recalledRef, sourceRef: String(args?.sourceRef || ""), mapsExistingLineage: true, createsNewClaim: false, epistemicStatusUnchanged: true };
    return { ok: true, result: v };
};
