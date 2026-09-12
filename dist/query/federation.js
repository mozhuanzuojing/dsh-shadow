// dsh-shadow —— query/federation.ts：Observer Federation / Epistemic Kernel seam（v0.28.1–v0.29）。
// 从 query/query.ts 迁出：federation（投影契约交换）、distortion（视角失真）、federation-perspective、
// real-evidence（RealityEvidence 注册/引用）、federation-diff、stability。Federation 只交换 ObservationClaim（投影契约，非权限）。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runFederation(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { packetOf, renderPacket, assertPacketBarrier } from "../federation/contract.js";
import { compareProjections, renderDistortion } from "../federation/guard.js";
import { perspectiveOf, renderPerspective, perspectiveIsClean, confidenceOfInput } from "../federation/perspective.js";
import { registerRealityEvidence, referenceEvidence, readRealityEvidence, renderRealityEvidence } from "../federation/reality.js";
import { differenceOf, renderDifference } from "../federation/difference.js";
import { perspectiveStateOf, renderStability } from "../federation/stability.js";
const MODES = new Set(["federation", "distortion", "federation-perspective", "real-evidence", "real-refer", "federation-diff", "stability"]);
/** Returns the rendered body for a federation mode, or undefined if not one of this family. */
export async function runFederation(deps, args, ctx) {
    const mode = String(args?.mode || "");
    if (!MODES.has(mode))
        return undefined;
    const { fs, ws, flushWarn, agent } = ctx;
    if (mode === "federation") {
        const p = packetOf({ sourceObserverId: String(args?.sourceObserverId || agent?.id || "unknown"), observationClaim: String(args?.obsClaim || ""), lens: args?.lens, visible: args?.visible || [], hidden: args?.hidden || [], distortion: args?.distortion || [] });
        const barrier = assertPacketBarrier(p);
        return scrubFinal(RECALL_PREFIX + renderPacket(p) + (barrier.ok ? "\n（boundary OK：Identity/Memory/Dream 不交换）" : `\n（boundary FAIL: ${barrier.reasons.join("、")}）`) + flushWarn);
    }
    if (mode === "distortion") {
        const d = compareProjections({ observerId: String(args?.sourceObserverId || "A"), visible: args?.visibleA || [], hidden: args?.hiddenA || [] }, { observerId: String(args?.targetObserverId || "B"), visible: args?.visibleB || [], hidden: args?.hiddenB || [] });
        return scrubFinal(RECALL_PREFIX + renderDistortion(d) + flushWarn);
    }
    if (mode === "federation-perspective") {
        const p = perspectiveOf({ observerId: String(args?.sourceObserverId || agent?.id || "unknown"), temporalReference: String(args?.temporalReference || ""), observationClaim: String(args?.obsClaim || ""), lens: args?.lens, visible: args?.visible || [], hidden: args?.hidden || [], observationConfidence: confidenceOfInput(args?.obsConfidence), validationConfidence: confidenceOfInput(args?.valConfidence) });
        const clean = perspectiveIsClean(p);
        return scrubFinal(RECALL_PREFIX + renderPerspective(p) + (clean.ok ? "\n（perspective OK：不携带 Memory/Identity/Dream/Knowledge，confidence 已拆分）" : `\n（perspective FAIL: ${clean.reasons.join("、")}）`) + flushWarn);
    }
    if (mode === "real-evidence") {
        const { evidence: ev, persisted } = await registerRealityEvidence(fs, ws, { observedAt: String(args?.observedAt || today()), source: String(args?.sourceObserverId || "unknown"), observation: String(args?.observation || ""), linkedHypothesis: args?.linkedHypothesis || [] });
        // **没落盘就说没落盘**（v1.15.61）：否则「写入被拒」与「已登记」在工具面逐字不可区分。
        const warn = persisted ? "" : "\n> ⚠ **未落盘**：写入 `.shadow/reality/` 失败 ⇒ 这条证据不会被后续模式读到（先确认 shadowRoot 可写）。";
        return scrubFinal(RECALL_PREFIX + renderRealityEvidence(ev) + warn + flushWarn);
    }
    if (mode === "real-refer") {
        const { evidence: ev, reason } = await referenceEvidence(fs, ws, String(args?.realityId || ""), String(args?.sourceObserverId || "unknown"));
        // **「不存在」与「读不出」必须分开**（v1.15.61）：旧版把工具报错/坏件也说成「无此证据」。
        const body = ev
            ? renderRealityEvidence(ev)
            : reason === "unreadable"
                ? `（reality evidence ${args?.realityId} **存在但读不出**：坏件或字段缺失 —— 这不是「没有这条证据」，请人工修复）`
                : `（无 reality evidence ${args?.realityId}）`;
        return scrubFinal(RECALL_PREFIX + body + flushWarn);
    }
    if (mode === "federation-diff") {
        const pa = perspectiveOf({ observerId: String(args?.sourceObserverId || "A"), observationClaim: String(args?.obsClaim || "claim-A"), lens: args?.lensA, visible: args?.visibleA || [], hidden: args?.hiddenA || [] });
        const pb = perspectiveOf({ observerId: String(args?.targetObserverId || "B"), observationClaim: String(args?.obsClaimB || "claim-B"), lens: args?.lensB, visible: args?.visibleB || [], hidden: args?.hiddenB || [] });
        const d = differenceOf(pa, pb, String(args?.realEvidenceRef || ""));
        return scrubFinal(RECALL_PREFIX + renderDifference(d) + flushWarn);
    }
    // stability
    const evs = await readRealityEvidence(fs, ws);
    const ev = evs.find((e) => e.id === String(args?.realityId || "")) || null;
    const state = perspectiveStateOf(ev, Boolean(args?.hasValidation));
    return scrubFinal(RECALL_PREFIX + renderStability(state) + flushWarn);
}
