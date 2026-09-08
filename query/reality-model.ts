// dsh-shadow —— query/reality-model.ts：Reality Model Kernel seam（v0.30）。
// 从 query/query.ts 迁出：model-observation（RealityObservation 弱事实注册）、model-claim（→RealityClaim，必须保留 lineage）、
// model（跨类型查询）。只读/注册真实观察，claim 必须过 isObservablePredicate；不产 EvaluationClaim。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runRealityModel(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { observationOf, renderObservation } from "../reality/observation.js";
import { registerObservation, readObservations } from "../reality/registry.js";
import { claimOf as claimOfReality, renderClaim, isObservablePredicate } from "../reality/claim/engine.js";
import { writeClaim, readClaims } from "../reality/claim/persist.js";
import type { ShadowQueryDeps } from "./types.js";

export interface RealityCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["model-observation", "model-claim", "model"]);

/** Returns the rendered body for a reality-model mode, or undefined if not one of this family. */
export async function runRealityModel(deps: ShadowQueryDeps, args: any, ctx: RealityCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "model-observation") {
    const ro = observationOf({ observedAt: String(args?.observedAt || today()), subjectRef: String(args?.subject || ""), sourcePerspectives: args?.sourcePerspectives || [String(args?.sourceObserverId || "unknown")], observation: String(args?.observation || ""), temporalContext: String(args?.temporalContext || today()), validationRefs: args?.validationRefs || [] });
    await registerObservation(fs, ws, ro);
    return scrubFinal(RECALL_PREFIX + renderObservation(ro) + flushWarn);
  }
  if (mode === "model-claim") {
    const obs = await readObservations(fs, ws, String(args?.subject || ""));
    const validations = (args?.validations as any) || [];
    const c = claimOfReality({ observations: obs, validations });
    if (!c) return scrubFinal(RECALL_PREFIX + "（无 RealityObservation：仅 Temporal/Federation 不足以生成 RealityClaim）" + flushWarn);
    if (!isObservablePredicate(c.predicate)) return scrubFinal(RECALL_PREFIX + "[Rejected] predicate_not_observable（RealityClaim ≠ EvaluationClaim：predicate 必须属 observable set）" + flushWarn);
    await writeClaim(fs, ws, c);
    return scrubFinal(RECALL_PREFIX + renderClaim(c) + flushWarn);
  }
  // model
  const claims = await readClaims(fs, ws);
  const subject = String(args?.subject || "");
  const claim = claims.find((c) => !subject || c.subjectRef === subject || c.subject === subject || c.id === String(args?.claimId || "")) || null;
  if (!claim) return scrubFinal(RECALL_PREFIX + "（无匹配 RealityClaim）" + flushWarn);
  const obss = await readObservations(fs, ws, claim.subjectRef || claim.subject);
  return scrubFinal(RECALL_PREFIX + renderClaim(claim) + `\n[Lineage] 为什么系统认为它存在：\n` + obss.map((o) => `  - ${o.observation} (perspectives: ${o.sourcePerspectives.join("、") || "—"})`).join("\n") + flushWarn);
}
