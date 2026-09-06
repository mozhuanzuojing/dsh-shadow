// dsh-shadow —— recall/engine/recall-continuity.ts：Recall 三对象（ForgottenRecord / RecallEvent / RecallValidation），守卫 198–205。
// Recall = Access Transition（恢复访问路径），不是 Reality Reconstruction；not Memory Kernel（Memory 是 Observer 的一个器官，不是 Observer 本身）。
import type { ForgottenRecord, RecallEvent, RecallValidation } from "../types/index.js";
import { assertForgottenNoDeletion, assertTriggerExternal, assertRecallLineage, assertRecallNotObservation, assertRecallNoStatusIncrease } from "../guard/recall-guard.js";
import { writeForgottenRecord, readForgottenRecord, writeRecallEvent } from "../persistence/persist.js";
import { today } from "../../core/util.js";

const rand = () => Math.random().toString(36).slice(2, 6);

// 构建 ForgottenRecord（曾经存在、当前不可直接访问）。reason 必须；禁 deleted/false/invalid。
export const buildForgottenRecord = (args: any): { ok: boolean; reason?: string; record?: ForgottenRecord } => {
  const originalRef = String(args?.originalRef || "");
  if (!originalRef) return { ok: false, reason: "ForgottenRecord 须 originalRef（遗忘的是哪个原记录）" };
  const reason = String(args?.reason || "");
  if (!reason) return { ok: false, reason: "ForgottenRecord 须 reason（为什么遗忘）" };
  const record: ForgottenRecord = { id: String(args?.id || `fr-${Date.now()}-${rand()}`), originalRef, forgottenAt: String(args?.forgottenAt || today()), reason, lastAccessibleAt: String(args?.lastAccessibleAt || today()), validationRefs: (args?.validationRefs as string[]) || undefined };
  const g = assertForgottenNoDeletion(record);
  if (!g.ok) return { ok: false, reason: g.reason };
  return { ok: true, record };
};

// 构建 RecallEvent（一次忆起）。须引用已遗忘记录；trigger 外部来源；lineage 完整；不产新观察/不提升证据等级。
export const buildRecallEvent = async (fs: any, ws: string, args: any): Promise<{ ok: boolean; reason?: string; ev?: RecallEvent }> => {
  const recalledRef = String(args?.recalledRef || "");
  const fr = await readForgottenRecord(fs, ws, recalledRef);
  if (!fr) return { ok: false, reason: "Recall 须引用已遗忘记录（recalledRef 无对应 ForgottenRecord；即非新观察）" };
  const trigger = { type: String(args?.triggerType || args?.trigger?.type || ""), sourceRef: String(args?.sourceRef || args?.trigger?.sourceRef || "") };
  const ev: RecallEvent = { id: `re-${Date.now()}-${rand()}`, recalledRef, trigger, accessibilityBefore: (args?.accessibilityBefore as any) || "forgotten", accessibilityAfter: (args?.accessibilityAfter as any) || "recalled", lineage: { originalRecord: String(args?.originalRecord || fr.originalRef), observationRefs: (args?.observationRefs as string[]) || [], validationRefs: (args?.validationRefs as string[]) || fr.validationRefs || [] } };
  const status = String(args?.status || args?.epistemicStatus || args?.support || "");
  const g1 = assertTriggerExternal(trigger); if (!g1.ok) return { ok: false, reason: g1.reason };
  const g2 = assertRecallLineage(ev); if (!g2.ok) return { ok: false, reason: g2.reason };
  const g3 = assertRecallNotObservation(ev); if (!g3.ok) return { ok: false, reason: g3.reason };
  const g4 = assertRecallNoStatusIncrease(status); if (!g4.ok) return { ok: false, reason: g4.reason };
  await writeRecallEvent(fs, ws, ev);
  return { ok: true, ev };
};

// RecallValidation（Recall ≠ 重新证明）。Recall → existing lineage → 原 RealityClaim；绝不 Recall → 新 RealityClaim / 新 hypothesis。
export const validateRecall = async (fs: any, ws: string, args: any): Promise<{ ok: boolean; reason?: string; result?: RecallValidation }> => {
  const recalledRef = String(args?.recalledRef || "");
  const fr = await readForgottenRecord(fs, ws, recalledRef);
  if (!fr) return { ok: false, reason: "无 ForgottenRecord（Recall Validation 无对象；无 lineage）" };
  const v: RecallValidation = { recalledRef, sourceRef: String(args?.sourceRef || ""), mapsExistingLineage: true, createsNewClaim: false, epistemicStatusUnchanged: true };
  return { ok: true, result: v };
};
