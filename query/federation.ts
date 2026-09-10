// dsh-shadow —— query/federation.ts：Observer Federation / Epistemic Kernel seam（v0.28.1–v0.29）。
// 从 query/query.ts 迁出：federation（投影契约交换）、distortion（视角失真）、federation-perspective、
// real-evidence（RealityEvidence 注册/引用）、federation-diff、stability。Federation 只交换 ObservationClaim（投影契约，非权限）。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runFederation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { packetOf, renderPacket, assertPacketBarrier } from "../federation/contract.js";
import { compareProjections, renderDistortion } from "../federation/guard.js";
import { perspectiveOf, renderPerspective, perspectiveIsClean } from "../federation/perspective.js";
import { registerRealityEvidence, referenceEvidence, readRealityEvidence, renderRealityEvidence } from "../federation/reality.js";
import { differenceOf, renderDifference } from "../federation/difference.js";
import { perspectiveStateOf, renderStability } from "../federation/stability.js";
import type { ShadowQueryDeps } from "./types.js";
import type { AgentLike } from "../core/types.js";

export interface FederationCtx { fs: any; ws: string; flushWarn: string; agent?: AgentLike }

const MODES = new Set(["federation", "distortion", "federation-perspective", "real-evidence", "real-refer", "federation-diff", "stability"]);

/** Returns the rendered body for a federation mode, or undefined if not one of this family. */
export async function runFederation(deps: ShadowQueryDeps, args: any, ctx: FederationCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn, agent } = ctx;
  if (mode === "federation") {
    const p = packetOf({ sourceObserverId: String(args?.sourceObserverId || agent?.id || "unknown"), observationClaim: String(args?.obsClaim || ""), lens: args?.lens as string, visible: args?.visible || [], hidden: args?.hidden || [], distortion: args?.distortion || [] });
    const barrier = assertPacketBarrier(p);
    return scrubFinal(RECALL_PREFIX + renderPacket(p) + (barrier.ok ? "\n（boundary OK：Identity/Memory/Dream 不交换）" : `\n（boundary FAIL: ${barrier.reasons.join("、")}）`) + flushWarn);
  }
  if (mode === "distortion") {
    const d = compareProjections({ observerId: String(args?.sourceObserverId || "A"), visible: args?.visibleA || [], hidden: args?.hiddenA || [] }, { observerId: String(args?.targetObserverId || "B"), visible: args?.visibleB || [], hidden: args?.hiddenB || [] });
    return scrubFinal(RECALL_PREFIX + renderDistortion(d) + flushWarn);
  }
  if (mode === "federation-perspective") {
    const p = perspectiveOf({ observerId: String(args?.sourceObserverId || agent?.id || "unknown"), temporalReference: String(args?.temporalReference || ""), observationClaim: String(args?.obsClaim || ""), lens: args?.lens as string, visible: args?.visible || [], hidden: args?.hidden || [], observationConfidence: Number(args?.obsConfidence) || 0.5, validationConfidence: Number(args?.valConfidence) || 0.5 });
    const clean = perspectiveIsClean(p);
    return scrubFinal(RECALL_PREFIX + renderPerspective(p) + (clean.ok ? "\n（perspective OK：不携带 Memory/Identity/Dream/Knowledge，confidence 已拆分）" : `\n（perspective FAIL: ${clean.reasons.join("、")}）`) + flushWarn);
  }
  if (mode === "real-evidence") {
    const ev = await registerRealityEvidence(fs, ws, { observedAt: String(args?.observedAt || today()), source: String(args?.sourceObserverId || "unknown"), observation: String(args?.observation || ""), linkedHypothesis: args?.linkedHypothesis || [] });
    return scrubFinal(RECALL_PREFIX + renderRealityEvidence(ev) + flushWarn);
  }
  if (mode === "real-refer") {
    const ev = await referenceEvidence(fs, ws, String(args?.realityId || ""), String(args?.sourceObserverId || "unknown"));
    return scrubFinal(RECALL_PREFIX + (ev ? renderRealityEvidence(ev) : `（无 reality evidence ${args?.realityId}）`) + flushWarn);
  }
  if (mode === "federation-diff") {
    const pa = perspectiveOf({ observerId: String(args?.sourceObserverId || "A"), observationClaim: String(args?.obsClaim || "claim-A"), lens: args?.lensA as string, visible: args?.visibleA || [], hidden: args?.hiddenA || [] });
    const pb = perspectiveOf({ observerId: String(args?.targetObserverId || "B"), observationClaim: String(args?.obsClaimB || "claim-B"), lens: args?.lensB as string, visible: args?.visibleB || [], hidden: args?.hiddenB || [] });
    const d = differenceOf(pa, pb, String(args?.realEvidenceRef || ""));
    return scrubFinal(RECALL_PREFIX + renderDifference(d) + flushWarn);
  }
  // stability
  const evs = await readRealityEvidence(fs, ws);
  const ev = evs.find((e) => e.id === String(args?.realityId || "")) || null;
  const state = perspectiveStateOf(ev, Boolean(args?.hasValidation));
  return scrubFinal(RECALL_PREFIX + renderStability(state) + flushWarn);
}
