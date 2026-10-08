// dsh-shadow —— query/world.ts：World Representation Kernel seam（v0.31）。
// 从 query/query.ts 迁出：world-represent（RepresentationObject 只接受 supported）、world-relation（RelationHypothesis 恒 hypothesis）、
// world（Graph 可重建 + explain）。只读 claim/观察派生，graph 可 rm -rf 重建，不覆盖事实。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runWorld(deps,args,ctx)；返回 undefined 表示非本族 mode。
//
// **B2/B4 同类补扫（v1.22.x；规格轴复审 (a)-1/(a)-2）**：本文件是 `writeGraph`（三态）与两个
// 「读不出 vs 还没有」carrier（`readClaimsDetailed.readFailure` / `readObservationsDetailed.readFailure`）
// 的读者 —— 三件事都在**同一段输出**里说清，不再只走 `console.log`（ADR-0049 / ADR-0085）。
import { RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { createRepresentationFromClaims, renderAdmission, isAdmissibleClaim } from "../epistemic/world/guard/claim-admission.js";
import { relationHypothesisOf, isRelationHypothesis, renderRelation } from "../epistemic/world/guard/relation-guard.js";
import { buildRepresentationGraph } from "../epistemic/world/builder/representation-builder.js";
import { writeGraph } from "../epistemic/world/persistence/persist.js";
import { explain } from "../epistemic/world/explain/explain.js";
import { readClaims, readClaimsDetailed } from "../epistemic/reality/claim/persist.js";
import { readObservationsDetailed } from "../epistemic/reality/registry.js";
import { unwrittenWarn, readCauseWarn } from "./degrade.js";
import type { ShadowQueryDeps } from "./types.js";

export interface WorldCtx { fs: any; ws: string; flushWarn: string }

const MODES = new Set(["world-represent", "world-relation", "world"]);

/** Returns the rendered body for a world mode, or undefined if not one of this family. */
export async function runWorld(deps: ShadowQueryDeps, args: any, ctx: WorldCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn } = ctx;
  if (mode === "world-represent") {
    const claims = await readClaims(fs, ws);
    const subject = String(args?.subject || "");
    const target = claims.filter((c) => !subject || c.subjectRef === subject || c.subject === subject);
    const r = createRepresentationFromClaims(target);
    return scrubFinal(RECALL_PREFIX + renderAdmission(r) + flushWarn);
  }
  if (mode === "world-relation") {
    const rh = relationHypothesisOf({ from: String(args?.from || ""), to: String(args?.to || ""), relation: String(args?.relation || ""), evidence: args?.evidence || [] });
    return scrubFinal(RECALL_PREFIX + renderRelation(rh) + (isRelationHypothesis(rh) ? "" : "\n（relation guard FAIL）") + flushWarn);
  }
  // world
  const claimsRead = await readClaimsDetailed(fs, ws);
  const { claims, corrupt } = claimsRead;
  // B4：claims **目录级读不出来**（非「还没有」）必须说出来 —— 否则一张残缺的图会被当成「世界就只有这样」。
  const claimsReadNote = readCauseWarn("model/claims", claimsRead.readFailure, "下面的图**不是**由全部 claim 算出来的（「读不出来」≠「还没有」）—— 先修 `.shadow/model/` 的可读性再依赖它。");
  const validations = claims.flatMap((c) => c.validationHistory.map((id) => ({ id })));
  const graph = buildRepresentationGraph(claims, validations);
  // **坏件时不覆盖落盘图**（v1.15.61）：由残缺 claims 建出的图**更小**，写回 `graph.json` 是**不可逆**的
  // 「用残缺覆盖完整」——与前面几轮修的「坏件不写回」是同一条纪律（ADR-0049 / adr/0083 §2）。
  let corruptNote = "";
  let writeNote = "";
  if (corrupt > 0) {
    corruptNote = `\n> ⚠ 有 **${corrupt}** 个 claim 坏件被跳过：下面的图**不完整**，且**本次未覆盖落盘图**（请人工修复后重跑）。`;
  } else {
    // B2：`writeGraph` 现在返回三态 —— 旧版写失败只 `console.log`，而上面这段输出当场就宣称「这是世界图」。
    writeNote = unwrittenWarn("RepresentationGraph", await writeGraph(fs, ws, graph), "`.shadow/world/<date>/graph.json` 没有这份图：上面的 representation 只是**内存里的对象**，`readGraph` 读到的是旧图或什么都没有。");
  }
  const subject = String(args?.subject || "");
  // 用**唯一判据源** `isAdmissibleClaim`，不再手写 `c.status === "supported"`
  // （v1.15.32 / ADR-0070 T5 第 4 次复核：真漂移，同 ADR-0063/D5 一族）。
  const supportedSubject = claims.find((c) => isAdmissibleClaim(c) && (!subject || c.subjectRef === subject || c.subject === subject));
  const obssRead = await readObservationsDetailed(fs, ws, supportedSubject ? (supportedSubject.subjectRef || supportedSubject.subject) : subject);
  // B4：观测侧的「读不出来」（目录级）与「单条坏件」同样要可见 —— lineage 段是它们的直接消费者。
  const obsNote =
    readCauseWarn("model/observations", obssRead.readFailure, "下面的 `[Lineage] 为什么系统认为它存在` **不是**基于全部观测算出来的。")
    + (obssRead.corrupt > 0 ? `\n> ⚠ 有 **${obssRead.corrupt}** 条 observation 坏件被跳过：下面的 lineage **不完整**。` : "");
  return scrubFinal(RECALL_PREFIX + explain(graph, subject, obssRead.observations, claims) + claimsReadNote + corruptNote + writeNote + obsNote + flushWarn);
}
