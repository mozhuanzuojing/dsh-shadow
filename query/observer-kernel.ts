// dsh-shadow —— query/observer-kernel.ts：Observer 时间/梦核 seam（v0.24–v0.27）。
// 从 query/query.ts 迁出：reflection（旁支）、identity-advance（Identity Continuity+三道闸门）、temporal（时间坐标系）、
// offline（SleepWindow→压缩→DreamArtifact+Hypothesis）。只读记忆树/时间边派生，不覆盖源事实。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runObserverKernel(deps,args,ctx)；返回 undefined 表示非本族 mode。
//
// B2/B4（v1.22.x）：本文件是那批**写侧静默降级**的**唯一读者** —— `reflectOf` / `advanceIdentity` /
// `writeTemporalGraph` / `writeDream` 现在都返回三态，这里据此在同一段输出里补「未落盘 / 削样本」一段。
// 判据：这四个 mode 的输出**当场**宣称「反思已写 / 身份已推进 vN / 图已存 / dream 已生成」，
// 若那一步没落盘而不说，就是 ADR-0049 规则 3 的「冒充成功」（`console.log` 不算可见信号，ADR-0085）。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { reflectOf, renderReflection } from "../reflection/engine.js";
import { readCurrentIdentity, renderIdentityModel } from "../selfhood/identity/timeline.js";
import { advanceIdentity, renderEvaluator } from "../selfhood/identity/evaluator.js";
import { buildTemporalGraph } from "../selfhood/temporal/builder.js";
import { writeTemporalGraph } from "../selfhood/temporal/persistence.js";
import { queryTemporal, renderTemporalGraph, renderReplay, renderCompare } from "../selfhood/temporal/query.js";
import { renderNodePerception, renderNodeIdentityContext } from "../selfhood/temporal/render.js";
import { buildSleepWindow, renderSleepWindow } from "../selfhood/dream/sleep.js";
import { offlineCompression, buildDreamArtifact, renderDreamResult } from "../selfhood/dream/compress.js";
import { writeDream } from "../selfhood/dream/persist.js";
import { writeHypothesis } from "../epistemic/validation/evidence.js";
import { unwrittenWarn, readCauseWarn } from "./degrade.js";
import type { ShadowQueryDeps } from "./types.js";
import type { AgentLike } from "../core/types.js";

export interface ObserverCtx { fs: any; ws: string; flushWarn: string; agent?: AgentLike }

const MODES = new Set(["reflection", "identity-advance", "temporal", "offline"]);

/** 读侧削样本的披露（B4）：只在真的削了的时候出现 ⇒ 健康路径输出逐字节不变。 */
const skippedWarn = (what: string, skipped: number, effect: string): string =>
  skipped > 0 ? `\n> ⚠ **${skipped} 份 ${what} 读不出或不是有效文件**（已跳过）：${effect}` : "";

/** Returns the rendered body for an observer-kernel mode, or undefined if not one of this family. */
export async function runObserverKernel(deps: ShadowQueryDeps, args: any, ctx: ObserverCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn, agent } = ctx;
  if (mode === "reflection") {
    const r = await reflectOf(fs, ws, { observerId: agent?.id || "unknown", period: { from: String(args?.from || ""), to: String(args?.to || today()) } });
    const degrade =
      unwrittenWarn("reflection", r.persist, "本次反思只存在于内存：`readReflections` 下次**读不到它** ⇒ 身份演化少一份输入样本（`mode:\"identity-advance\"` 的闸门结论会不稳）。")
      + readCauseWarn("observation 轨迹", r.traces.readFailure, "上面的反思**不是**基于全部轨迹算出来的 —— 先把该目录的可读性修好再依赖它。")
      + skippedWarn("observation 轨迹", r.traces.skipped, "本次反思基于**被削过的样本**：门槛（≥3 次 decision→outcome）可能因此没被触发，而输出看起来与「真的不够」一样。");
    return scrubFinal(RECALL_PREFIX + renderReflection(r.reflection) + degrade + flushWarn);
  }
  if (mode === "identity-advance") {
    const current = await readCurrentIdentity(fs, ws, agent?.id);
    const { model, decisions, reflections, write } = await advanceIdentity(fs, ws, current, {
      minCount: Math.max(1, Number(args?.minCount) || 5),
      minRecency: Number(args?.minRecency) || 0.4,
      maxContradiction: Number(args?.maxContradiction) || 0.3,
      halfLifeDays: Math.max(1, Number(args?.halfLifeDays) || 90),
    });
    // 两处降级都必须说出来：
    //   · 切片没落盘 ⇒ 上面那句 `version vN` 并没有写进 `.shadow/identity/`（下次读仍是 vN-1）；
    //   · 反思样本被削 ⇒ 三道闸门的结论基于不完整输入（可能漏掉本该 accepted 的原则）。
    const degrade =
      unwrittenWarn("identity 时间切片", write, "上面的 `version vN` / `learned N` **没有落盘**：`.shadow/identity/` 下仍是上一版，下次 `readCurrentIdentity` 会读回旧版本 —— 勿把它当成已推进。")
      + readCauseWarn("reflection", reflections.readFailure, "本次评估**不是**基于全部反思 —— 闸门结论不可靠，先修好 `.shadow/reflection/` 的可读性。")
      + skippedWarn("reflection", reflections.skipped, "本次评估基于**被削过的样本**：`accepted`/`candidate` 的判定可能因此偏保守。");
    // soft tool-output（ADR-0086）：evaluator 块保留；其后接 IdentityModel 完整渲染（学到的一半）。
    // `args.identity:true` 仍走 soul/identity 的 `renderIdentity` —— 两对象不混名。
    return scrubFinal(
      RECALL_PREFIX + renderEvaluator(decisions, model) + "\n\n" + renderIdentityModel(model) + degrade + flushWarn,
    );
  }
  if (mode === "temporal") {
    const graph = await buildTemporalGraph(fs, ws, { from: String(args?.from || ""), to: String(args?.to || "") });
    const w = await writeTemporalGraph(fs, ws, graph);
    // B4：`TemporalGraph` 现在自带 `sourceSkipped` / `sourceReadFailure`（构建时两个 reader 的削样本信号），
    // 这里必须**读出来**并进同一段输出 —— 否则「图偏少」与「真的只有这些」在读者眼里逐字不可区分。
    // 用本文件的 `skippedWarn` / `readCauseWarn`（词表唯一一份在 `query/degrade.ts`；`selfhood/` 不能 import `query/`，
    // 所以这 4 行只能在这里，不能放到渲染器里）。
    const degrade = unwrittenWarn("temporal graph", w, "`.shadow/temporal/<date>/graph.json` 没有这份图：上面显示的图只是**本次内存里算出来的**，`readTemporalGraph` 读到的是旧图或什么都没有。")
      + readCauseWarn("observation 轨迹/身份版本", graph.sourceReadFailure, "上面这张图**不是**由全部输入算出来的 —— 节点/边可能偏少，先把 `.shadow/observation/` 与 `.shadow/identity/` 的可读性修好再依赖它。")
      + skippedWarn("observation 轨迹/身份版本", graph.sourceSkipped ?? 0, "上面这张图基于**被削过的样本**：`nodes`/`edges` 比真实少，别把「图里没有」读成「当时没有」。");
    if (args?.perceptionOnly || args?.identityContext) {
      const node = graph.nodes.find((n) => !args?.at || String(n.timestamp).slice(0, 10) === String(args.at).slice(0, 10)) || graph.nodes[0];
      if (!node) return scrubFinal(RECALL_PREFIX + "（无 Temporal 节点）" + degrade + flushWarn);
      return scrubFinal(RECALL_PREFIX + (args?.identityContext ? renderNodeIdentityContext(node) : renderNodePerception(node)) + degrade + flushWarn);
    }
    if (args?.at) return scrubFinal(RECALL_PREFIX + renderReplay(queryTemporal(graph, { type: "replay", at: String(args.at) })) + degrade + flushWarn);
    if (args?.from && args?.to) return scrubFinal(RECALL_PREFIX + renderCompare(queryTemporal(graph, { type: "compare", from: String(args.from), to: String(args.to) })) + degrade + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderTemporalGraph(graph) + degrade + flushWarn);
  }
  // offline
  const sw = buildSleepWindow({ observerId: agent?.id || "unknown", from: String(args?.from || ""), to: String(args?.to || today()), trigger: (args?.trigger as any) || "scheduled" });
  const result = await offlineCompression(fs, ws, { observerId: sw.observerId, from: sw.includedTimelineRange.from, to: sw.includedTimelineRange.to });
  const artifact = await buildDreamArtifact(fs, ws, { id: sw.id, observerId: sw.observerId, from: sw.includedTimelineRange.from, to: sw.includedTimelineRange.to }, result);
  const dw = await writeDream(fs, ws, { artifact, result });
  // **播报必须与实际一致**（v1.15.55）：`renderDreamResult` 会打印 `hypotheses N`，
  // 若其中若干条没落盘，就必须在**同一条回复里**说明 —— 否则用户以为有 N 条可 validate，实际少几条。
  let failedH = 0;
  for (const h of result.hypotheses) if (!(await writeHypothesis(fs, ws, h))) failedH += 1;
  const hypWarn = failedH > 0
    ? `\n> ⚠ 其中 **${failedH} 条假设未落盘**（写 \`.shadow/hypothesis/\` 失败）：上面的 \`hypotheses ${result.hypotheses.length}\` 只有 ${result.hypotheses.length - failedH} 条可被 \`mode:validate\` 读到。\n`
    : "";
  // B2：`dream.json` 没落盘也不能只 `console.log`（同一条回复里必须说清）。
  // B4：`DreamResult` 现在自带 `sourceSkipped` / `sourceReadFailure` —— 一并进这段输出，
  // 尤其 `no_pattern`：「真的没有模式」与「样本被削/读不出来所以没算出模式」处置不同（ADR-0049）。
  const dreamWarn = unwrittenWarn("dream 产物", dw, "`.shadow/dream/<date>/dream.json` 没有这份产物：上面的 dream 只是本次内存里算出来的，下一次 `mode:\"offline\"` 不会读到它。")
    + readCauseWarn("observation 轨迹", result.sourceReadFailure, "这次压缩**不是**基于全部轨迹算出来的 —— `no_pattern` 或 pattern 计数都不可当作「真的没有」。")
    + skippedWarn("observation 轨迹", result.sourceSkipped ?? 0, "这次压缩基于**被削过的样本**：模式/假设可能因此没被触发，而输出看起来与「真的不够」一样。");
  return scrubFinal(RECALL_PREFIX + renderSleepWindow(sw) + "\n" + renderDreamResult(result) + hypWarn + dreamWarn + flushWarn);
}
