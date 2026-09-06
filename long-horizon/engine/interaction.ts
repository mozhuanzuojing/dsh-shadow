// dsh-shadow —— long-horizon/engine/interaction.ts：Long Horizon 四对象，守卫 224–229 + 关注点 A/B 两个运行时出口。
// 时间的连续性不构成主体性：Longer≠MoreAuthority / History≠Purpose / Experience≠Identity / Adaptation≠Evolution / Continuity≠Autonomy。
import type { InteractionContext, HistorySummary, HistoryContinuityEvent, InteractionAdaptationLink } from "../types/index.js";
import { assertSummaryNoRealityField } from "../guard/compression-guard.js";
import { assertResultNoIdentityChain } from "../guard/identity-guard.js";
import { assertResultNoAuthorityGrowth, assertResultNoSelfConfidence, assertResultNoPreference, assertResultNoInferredObjective } from "../guard/authority-guard.js";
import { writeInteractionContext, writeHistorySummary, writeContinuityEvent, writeInteractionAdaptationLink } from "../persistence/persist.js";
import { today } from "../../core/util.js";

const rand = () => Math.random().toString(36).slice(2, 6);
const resultGuards = [
  assertResultNoAuthorityGrowth,    // 224
  assertResultNoSelfConfidence,     // 229
  assertResultNoPreference,         // 225
  assertResultNoIdentityChain,      // 226
  assertResultNoInferredObjective,  // 228
];

// InteractionContext：基于什么历史（what happened before，非 who I became）。
export const buildInteractionContext = (args: any): { ok: boolean; reason?: string; ctx?: InteractionContext } => {
  const basedOnHistory = (args?.basedOnHistory as string[]) || [];
  if (!basedOnHistory.length) return { ok: false, reason: "InteractionContext 须 basedOnHistory（当前长期交互基于什么历史）" };
  const ctx: InteractionContext = { id: `ih-${Date.now()}-${rand()}`, basedOnHistory, window: { from: String(args?.from || ""), to: String(args?.to || today()) }, recallRefs: (args?.recallRefs as string[]) || [], adaptationRefs: (args?.adaptationRefs as string[]) || [], createdAt: today() };
  return { ok: true, ctx };
};

// HistorySummary（227）：摘要=访问辅助，非新事实源。
export const buildHistorySummary = (args: any): { ok: boolean; reason?: string; summary?: HistorySummary } => {
  const sourceRefs = (args?.sourceRefs as string[]) || [];
  const compressionMethod = String(args?.compressionMethod || "");
  if (!sourceRefs.length || !compressionMethod) return { ok: false, reason: "HistorySummary 须 sourceRefs + compressionMethod（摘要是访问辅助）" };
  const summary: HistorySummary = { id: `hs-${Date.now()}-${rand()}`, sourceRefs, compressionMethod, accessibility: (args?.accessibility as any) || "available" };
  const g = assertSummaryNoRealityField(summary);
  if (!g.ok) return { ok: false, reason: g.reason };
  return { ok: true, summary };
};

// HistoryContinuityEvent：previous/current accessibility + lineage；结果措辞禁 authority/confidence/preference/identity/objective 漂移。
export const buildContinuityEvent = async (fs: any, ws: string, args: any): Promise<{ ok: boolean; reason?: string; event?: HistoryContinuityEvent }> => {
  const historyRef = String(args?.historyRef || "");
  if (!historyRef) return { ok: false, reason: "HistoryContinuityEvent 须 lineage.historyRef（continuity 可追溯）" };
  const result = String(args?.result || "");
  for (const g of resultGuards) { const r = g(result); if (!r.ok) return { ok: false, reason: r.reason }; }
  const event: HistoryContinuityEvent = { id: `he-${Date.now()}-${rand()}`, previousAccessibility: String(args?.previousAccessibility || "forgotten"), currentAccessibility: String(args?.currentAccessibility || "available"), lineage: { historyRef, recallRef: String(args?.recallRef || "") || undefined, adaptationRef: String(args?.adaptationRef || "") || undefined } };
  await writeContinuityEvent(fs, ws, event);
  return { ok: true, event };
};

// InteractionAdaptationLink：History→Recall→Adaptation；禁 History→Identity；结果措辞同漂移守卫。
export const buildInteractionAdaptationLink = async (fs: any, ws: string, args: any): Promise<{ ok: boolean; reason?: string; link?: InteractionAdaptationLink }> => {
  const historyRef = String(args?.historyRef || "");
  const recallRef = String(args?.recallRef || "");
  const adaptationRef = String(args?.adaptationRef || "");
  if (!historyRef || !recallRef || !adaptationRef) return { ok: false, reason: "InteractionAdaptationLink 须 historyRef+recallRef+adaptationRef（History→Recall→Adaptation；禁 History→Identity）" };
  if (String(args?.identityRef || "")) return { ok: false, reason: "InteractionAdaptationLink 禁 identityRef（History→Identity 禁）" };
  const result = String(args?.result || "");
  for (const g of resultGuards) { const r = g(result); if (!r.ok) return { ok: false, reason: r.reason }; }
  const link: InteractionAdaptationLink = { historyRef, recallRef, adaptationRef };
  await writeInteractionAdaptationLink(fs, ws, link);
  return { ok: true, link };
};
