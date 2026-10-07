// dsh-shadow —— recall/engine/recall-continuity.ts：Recall 三对象（ForgottenRecord / RecallEvent / RecallValidation），守卫 198–205。
// Recall = Access Transition（恢复访问路径），不是 Reality Reconstruction；not Memory Kernel（Memory 是 Observer 的一个器官，不是 Observer 本身）。
import type { ForgottenRecord, RecallEvent, RecallValidation } from "../types/index.js";
import { assertForgottenNoDeletion, assertTriggerExternal, assertRecallLineage, assertRecallNotObservation, assertRecallNoStatusIncrease } from "../guard/recall-guard.js";
import { writeForgottenRecord, readForgottenRecord, writeRecallEvent } from "../persistence/persist.js";
import { today } from "../../../core/util.js";
import type { PersistOutcome } from "../../../persistence/outcomes.js";

const rand = () => Math.random().toString(36).slice(2, 6);
// `accessibilityBefore/After` 是**封闭联合**（`types/event.ts`）—— 成员表是唯一一份校验（B14 同族：
// 旧版把未校验的 `args?.accessibility*` 直接 `as any` 灌进联合，文件里写任何字符串都成为合法值）。
const BEFORE: ReadonlySet<string> = new Set(["accessible", "forgotten", "latent"]);
const AFTER: ReadonlySet<string> = new Set(["accessible", "recalled"]);
const beforeOf = (raw: unknown): RecallEvent["accessibilityBefore"] =>
  BEFORE.has(String(raw || "")) ? (String(raw) as RecallEvent["accessibilityBefore"]) : "forgotten";
const afterOf = (raw: unknown): RecallEvent["accessibilityAfter"] =>
  AFTER.has(String(raw || "")) ? (String(raw) as RecallEvent["accessibilityAfter"]) : "recalled";

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
// B2/B4（v1.22.x）：返回 `persist`（写侧三态）并把「读不出 ForgottenRecord」与「没有这条记录」分开 ——
// 旧版把读故障报成「Recall 须引用已遗忘记录（即非新观察）」，把事故说成**对象不存在**，排障方向反了。
export const buildRecallEvent = async (fs: any, ws: string, args: any): Promise<{ ok: boolean; reason?: string; ev?: RecallEvent; persist?: PersistOutcome }> => {
  const recalledRef = String(args?.recalledRef || "");
  const fr = await readForgottenRecord(fs, ws, recalledRef);
  if (!fr.ok) return { ok: false, reason: `读不出 ForgottenRecord（${fr.reason}）—— 这与「没有对应遗忘记录」是两件事，先查 \`.shadow/recall/\` 的可读性` };
  if (!fr.value) return { ok: false, reason: "Recall 须引用已遗忘记录（recalledRef 无对应 ForgottenRecord；即非新观察）" };
  const trigger = { type: String(args?.triggerType || args?.trigger?.type || ""), sourceRef: String(args?.sourceRef || args?.trigger?.sourceRef || "") };
  const ev: RecallEvent = { id: `re-${Date.now()}-${rand()}`, recalledRef, trigger, accessibilityBefore: beforeOf(args?.accessibilityBefore), accessibilityAfter: afterOf(args?.accessibilityAfter), lineage: { originalRecord: String(args?.originalRecord || fr.value.originalRef), observationRefs: (args?.observationRefs as string[]) || [], validationRefs: (args?.validationRefs as string[]) || fr.value.validationRefs || [] } };
  const status = String(args?.status || args?.epistemicStatus || args?.support || "");
  const g1 = assertTriggerExternal(trigger); if (!g1.ok) return { ok: false, reason: g1.reason };
  const g2 = assertRecallLineage(ev); if (!g2.ok) return { ok: false, reason: g2.reason };
  const g3 = assertRecallNotObservation(ev); if (!g3.ok) return { ok: false, reason: g3.reason };
  const g4 = assertRecallNoStatusIncrease(status); if (!g4.ok) return { ok: false, reason: g4.reason };
  const persist = await writeRecallEvent(fs, ws, ev);
  return { ok: true, ev, persist };
};

// RecallValidation（Recall ≠ 重新证明）。Recall → existing lineage → 原 RealityClaim；绝不 Recall → 新 RealityClaim / 新 hypothesis。
export const validateRecall = async (fs: any, ws: string, args: any): Promise<{ ok: boolean; reason?: string; result?: RecallValidation }> => {
  const recalledRef = String(args?.recalledRef || "");
  const fr = await readForgottenRecord(fs, ws, recalledRef);
  // 读故障 ≠ 「没有对象」（B4）：前者要人修可读性，后者是判定结论。
  if (!fr.ok) return { ok: false, reason: `读不出 ForgottenRecord（${fr.reason}）—— 本次**判不了**，先查 \`.shadow/recall/\` 的可读性` };
  if (!fr.value) return { ok: false, reason: "无 ForgottenRecord（Recall Validation 无对象；无 lineage）" };
  const v: RecallValidation = { recalledRef, sourceRef: String(args?.sourceRef || ""), mapsExistingLineage: true, createsNewClaim: false, epistemicStatusUnchanged: true };
  return { ok: true, result: v };
};
