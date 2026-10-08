// dsh-shadow —— query/reality-model.ts：Reality Model Kernel seam（v0.30）。
// 从 query/query.ts 迁出：model-observation（RealityObservation 弱事实注册）、model-claim（→RealityClaim，必须保留 lineage）、
// model（跨类型查询）。只读/注册真实观察，claim 必须过 isObservablePredicate；不产 EvaluationClaim。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runRealityModel(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { observationOf, renderObservation } from "../epistemic/reality/observation.js";
import { registerObservation, readObservationsDetailed } from "../epistemic/reality/registry.js";
import { claimOf as claimOfReality, renderClaim, isObservablePredicate } from "../epistemic/reality/claim/engine.js";
import { writeClaim, readClaims } from "../epistemic/reality/claim/persist.js";
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
    const { persisted } = await registerObservation(fs, ws, ro);
    // **没落盘就说没落盘**（v1.15.61）：否则「写入被拒」与「已登记」逐字不可区分。
    const w = persisted ? "" : "\n> ⚠ **未落盘**：写入 `.shadow/model/observations/` 失败 ⇒ 这条 observation 不会被后续 claim/model 模式读到。";
    return scrubFinal(RECALL_PREFIX + renderObservation(ro) + w + flushWarn);
  }
  if (mode === "model-claim") {
    // v1.22.2：消费 `readFailure`（同 federation 的 stability 分支）—— 「读不出来」与「还没有」不可混。
    const obsRead = await readObservationsDetailed(fs, ws, String(args?.subject || ""));
    const obs = obsRead.observations;
    const readWarn = obsRead.readFailure
      ? `\n> ⚠ **读不出** \`.shadow/model/observations/\`（${obsRead.readFailure}）⇒ 下面「无 RealityObservation」的结论**不可信**。`
      : "";
    const validations = (args?.validations as any) || [];
    const c = claimOfReality({ observations: obs, validations });
    if (!c) return scrubFinal(RECALL_PREFIX + "（无 RealityObservation：仅 Temporal/Federation 不足以生成 RealityClaim）" + readWarn + flushWarn);
    if (!isObservablePredicate(c.predicate)) return scrubFinal(RECALL_PREFIX + "[Rejected] predicate_not_observable（RealityClaim ≠ EvaluationClaim：predicate 必须属 observable set）" + flushWarn);
    const ok = await writeClaim(fs, ws, c);
    const w = ok ? "" : "\n> ⚠ **未落盘**：写入 `.shadow/model/claims/` 失败 ⇒ 这条 claim 不会出现在后续 `model` / `world` 读数里。";
    return scrubFinal(RECALL_PREFIX + renderClaim(c) + w + flushWarn);
  }
  // model
  const claims = await readClaims(fs, ws);
  const subject = String(args?.subject || "");
  const claim = claims.find((c) => !subject || c.subjectRef === subject || c.subject === subject || c.id === String(args?.claimId || "")) || null;
  if (!claim) return scrubFinal(RECALL_PREFIX + "（无匹配 RealityClaim）" + flushWarn);
  const obssRead = await readObservationsDetailed(fs, ws, claim.subjectRef || claim.subject);
  const obss = obssRead.observations;
  const lineageWarn = obssRead.readFailure
    ? `\n> ⚠ **读不出** \`.shadow/model/observations/\`（${obssRead.readFailure}）⇒ 上面这份 lineage **不完整**（不是「它没有来源」）。`
    : "";
  return scrubFinal(RECALL_PREFIX + renderClaim(claim) + `\n[Lineage] 为什么系统认为它存在：\n` + obss.map((o) => `  - ${o.observation} (perspectives: ${o.sourcePerspectives.join("、") || "—"})`).join("\n") + lineageWarn + flushWarn);
}
