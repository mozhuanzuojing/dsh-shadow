// dsh-shadow —— world/guard/claim-admission.ts：Representation 单向准入（只接受 supported RealityClaim）。
// Representation 是 Reality Model 的二级结构，不应重新成为 Claim 生成器。
import type { RealityClaim } from "../../reality/types.js";
import type { RepresentationObject } from "../types.js";
import { newId } from "../../../core/util.js";

export const isAdmissibleClaim = (c: RealityClaim) => c?.status === "supported";

/**
 * 「断言 / 准入结果」的**唯一形态**（A27 **反向统一**：守卫族对齐到它，而不是它对齐 `reasons[]`）。
 *
 * 为什么反着统一（把 `AdmissionResult` 改成守卫族既有的 `{ ok, reason? }`）：
 *   ① 守卫族本来就都是 `{ ok, reason? }`（`epistemic/action/guard` 2 处 · `epistemic/verification/guard` 3 处 ·
 *      `epistemic/simulation/guard` 2 处 · `stance/planning/guard` 4 处）—— **多数派在这里**；
 *      而它们的消费者（`query/sim-action.ts` 与 `query/planning.ts` 都读 `.reason`）**不在本轮写面**，
 *      若把守卫族改成 `reasons[]`，收一处会变成**跨模块连锁**（正是本仓反对的那种「修正向传播」）。
 *   ② `reasons[]` 在本文件里的**唯一**消费者是 `renderAdmission` 的 `join("；")`
 *      ⇒ 改成单串 `reason` 后**读者看到的文本逐字不变**（多原因在构造点一次 join）。
 *   ③ 统一后的形态与守卫族逐字同形（`ok` + 可选 `reason`），`object` 是本模块特有的附加产物。
 * ⚠ **残留（刻意保留，已在回执报给 Lead）**：`epistemic/federation/contract.ts` 的 `assertPacketBarrier`
 *   返回的仍是 `{ ok, reasons[] }` —— 那是**真·多原因**（Identity/Memory/Dream 三路各自可泄漏，
 *   消费者 `query/federation.ts` 按数组展开），且该消费者不在本写面；本轮不强行拉平。
 */
export interface AdmissionResult { ok: boolean; reason?: string; object?: RepresentationObject; }

export const createRepresentationFromClaims = (claims: RealityClaim[]): AdmissionResult => {
  if (!claims.length) return { ok: false, reason: "无 RealityClaim" };
  const inadmissible = claims.filter((c) => !isAdmissibleClaim(c));
  // 多原因在**构造点**一次 join（原 `renderAdmission` 就是 `join("；")` ⇒ 输出逐字不变）。
  if (inadmissible.length) return { ok: false, reason: inadmissible.map((c) => `${c.id} 状态=${c.status}（仅 supported 可进 Representation）`).join("；") };
  const avgAlt = claims.reduce((s, c) => s + (c.confidence?.alternativeSurvival ?? 0), 0) / claims.length;
  const object: RepresentationObject = {
    id: newId("rep"),   // A12：id 生成**收一处**到 `core/util.ts`
    basedOnClaims: claims.map((c) => c.id),
    temporalScope: claims[0].temporalContext || "",
    uncertainty: Math.round((1 - Math.min(0.95, avgAlt)) * 100) / 100,
    status: "represented",
  };
  return { ok: true, object };
};

export const renderAdmission = (r: AdmissionResult) => {
  if (r.ok && r.object) {
    return ["[Representation]"].concat([
      `object ${r.object.id} · status ${r.object.status} · uncertainty ${r.object.uncertainty.toFixed(2)}`,
      `basedOnClaims ${r.object.basedOnClaims.join("、")}（仅 supported）`,
      `temporalScope ${r.object.temporalScope}`,
    ]).join("\n");
  }
  // A27：`reason` 是单串（多原因已在构造点 join）—— 输出与旧 `reasons.join("；")` 逐字相同。
  return `[Representation Rejected] reason: ${r.reason || ""}`;
};
