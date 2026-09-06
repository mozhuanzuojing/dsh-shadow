import { assertTargetNotIdentity, assertResultNoBetterSelf, assertResultNoAuthorityIncrease, assertResultNoAgencyUpgrade } from "../guard/identity-guard.js";
import { assertTargetInScope, assertResultNoObjectiveChange, assertResultNoPreference } from "../guard/scope-guard.js";
import { assertResultNoEpistemicIncrease, resultNotKnowledge, assertValidationNoCorrectness } from "../guard/epistemic-guard.js";
import { writeAdaptationChange, writeAdaptationValidation } from "../persistence/persist.js";
import { today } from "../../core/util.js";
const rand = () => Math.random().toString(36).slice(2, 6);
// AdaptationContext（为什么允许调整）。sourceExperience 必须；adaptationScope 在目标集（212）。
export const buildAdaptationContext = (args) => {
    const sourceExperience = String(args?.sourceExperience || "");
    if (!sourceExperience)
        return { ok: false, reason: "AdaptationContext 须 sourceExperience（调整依据是什么）" };
    const adaptationScope = String(args?.adaptationScope || "method");
    const g = assertTargetInScope(adaptationScope);
    if (!g.ok)
        return { ok: false, reason: g.reason };
    const ctx = { sourceExperience, validationRefs: args?.validationRefs || [], adaptationScope, createdAt: today() };
    return { ok: true, ctx };
};
// AdaptationChange（行为策略变化）。target 在 scope（212）+ non-identity（208）；basedOn/sourceExperience 必须（214/209）；结果禁 authority/better-self/epistemic。
export const buildAdaptationChange = async (fs, ws, args) => {
    const target = String(args?.target || "");
    const g1 = assertTargetInScope(target);
    if (!g1.ok)
        return { ok: false, reason: g1.reason };
    const g2 = assertTargetNotIdentity(target);
    if (!g2.ok)
        return { ok: false, reason: g2.reason };
    const basedOn = args?.basedOn || [];
    const sourceExperience = String(args?.sourceExperience || "");
    if (!basedOn.length || !sourceExperience)
        return { ok: false, reason: "Adaptation Lineage Required（Adaptation→Experience→Observation→Validation；basedOn/sourceExperience 必须）" };
    const after = String(args?.after || "");
    const g3 = assertResultNoBetterSelf(after);
    if (!g3.ok)
        return { ok: false, reason: g3.reason };
    const g4 = assertResultNoAuthorityIncrease(after);
    if (!g4.ok)
        return { ok: false, reason: g4.reason };
    const g5 = assertResultNoEpistemicIncrease(after);
    if (!g5.ok)
        return { ok: false, reason: g5.reason };
    if (!resultNotKnowledge(after))
        return { ok: false, reason: "Experience ≠ Truth（Adaptation 来源是 Observation/Experience，非 Knowledge；after 禁『这是知识』）" };
    const g6 = assertResultNoObjectiveChange(after);
    if (!g6.ok)
        return { ok: false, reason: g6.reason };
    const g7 = assertResultNoPreference(after);
    if (!g7.ok)
        return { ok: false, reason: g7.reason };
    const g8 = assertResultNoAgencyUpgrade(after);
    if (!g8.ok)
        return { ok: false, reason: g8.reason };
    const change = { id: `ad-${Date.now()}-${rand()}`, target: target, before: String(args?.before || ""), after, basedOn, sourceExperience, validationRequired: true };
    await writeAdaptationChange(fs, ws, change);
    return { ok: true, change };
};
// AdaptationValidation（弱语义）：change happened + 现实反馈；不是 change was correct。
export const validateAdaptation = async (fs, ws, args) => {
    const validation = { changeObserved: Boolean(args?.changeObserved), validationReferences: args?.validationReferences || [], sideEffectsObserved: args?.sideEffectsObserved || [] };
    const g = assertValidationNoCorrectness(validation);
    if (!g.ok)
        return { ok: false, reason: g.reason };
    await writeAdaptationValidation(fs, ws, validation);
    return { ok: true, validation };
};
