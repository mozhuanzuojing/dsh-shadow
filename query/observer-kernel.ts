// dsh-shadow —— query/observer-kernel.ts：Observer 时间/梦核 seam（v0.24–v0.27）。
// 从 query/query.ts 迁出：reflection（旁支）、identity（主体锚+三道闸门）、temporal（时间坐标系）、
// offline（SleepWindow→压缩→DreamArtifact+Hypothesis）。只读记忆树/时间边派生，不覆盖源事实。
// 契约与 query.ts 原实现逐字一致，仅入口改为 runObserverKernel(deps,args,ctx)；返回 undefined 表示非本族 mode。
import { today, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
import { reflectOf, renderReflection } from "../reflection/engine.js";
import { readCurrentIdentity } from "../identity/timeline.js";
import { advanceIdentity, renderEvaluator } from "../identity/evaluator.js";
import { buildTemporalGraph } from "../temporal/builder.js";
import { writeTemporalGraph } from "../temporal/persistence.js";
import { queryTemporal, renderTemporalGraph, renderReplay, renderCompare } from "../temporal/query.js";
import { renderNodePerception, renderNodeIdentityContext } from "../temporal/render.js";
import { buildSleepWindow, renderSleepWindow } from "../dream/sleep.js";
import { offlineCompression, buildDreamArtifact, renderDreamResult } from "../dream/compress.js";
import { writeDream } from "../dream/persist.js";
import { writeHypothesis } from "../validation/evidence.js";
import type { ShadowQueryDeps } from "./types.js";
import type { AgentLike } from "../core/types.js";

export interface ObserverCtx { fs: any; ws: string; flushWarn: string; agent?: AgentLike }

const MODES = new Set(["reflection", "identity", "temporal", "offline"]);

/** Returns the rendered body for an observer-kernel mode, or undefined if not one of this family. */
export async function runObserverKernel(deps: ShadowQueryDeps, args: any, ctx: ObserverCtx): Promise<string | undefined> {
  const mode = String(args?.mode || "");
  if (!MODES.has(mode)) return undefined;
  const { fs, ws, flushWarn, agent } = ctx;
  if (mode === "reflection") {
    const r = await reflectOf(fs, ws, { observerId: agent?.id || "unknown", period: { from: String(args?.from || ""), to: String(args?.to || today()) } });
    return scrubFinal(RECALL_PREFIX + renderReflection(r) + flushWarn);
  }
  if (mode === "identity") {
    const current = await readCurrentIdentity(fs, ws, agent?.id);
    const { model, decisions } = await advanceIdentity(fs, ws, current, {
      minCount: Math.max(1, Number(args?.minCount) || 5),
      minRecency: Number(args?.minRecency) || 0.4,
      maxContradiction: Number(args?.maxContradiction) || 0.3,
      halfLifeDays: Math.max(1, Number(args?.halfLifeDays) || 90),
    });
    return scrubFinal(RECALL_PREFIX + renderEvaluator(decisions, model) + flushWarn);
  }
  if (mode === "temporal") {
    const graph = await buildTemporalGraph(fs, ws, { from: String(args?.from || ""), to: String(args?.to || "") });
    await writeTemporalGraph(fs, ws, graph);
    if (args?.perceptionOnly || args?.identityContext) {
      const node = graph.nodes.find((n) => !args?.at || String(n.timestamp).slice(0, 10) === String(args.at).slice(0, 10)) || graph.nodes[0];
      if (!node) return scrubFinal(RECALL_PREFIX + "（无 Temporal 节点）" + flushWarn);
      return scrubFinal(RECALL_PREFIX + (args?.identityContext ? renderNodeIdentityContext(node) : renderNodePerception(node)) + flushWarn);
    }
    if (args?.at) return scrubFinal(RECALL_PREFIX + renderReplay(queryTemporal(graph, { type: "replay", at: String(args.at) })) + flushWarn);
    if (args?.from && args?.to) return scrubFinal(RECALL_PREFIX + renderCompare(queryTemporal(graph, { type: "compare", from: String(args.from), to: String(args.to) })) + flushWarn);
    return scrubFinal(RECALL_PREFIX + renderTemporalGraph(graph) + flushWarn);
  }
  // offline
  const sw = buildSleepWindow({ observerId: agent?.id || "unknown", from: String(args?.from || ""), to: String(args?.to || today()), trigger: (args?.trigger as any) || "scheduled" });
  const result = await offlineCompression(fs, ws, { observerId: sw.observerId, from: sw.includedTimelineRange.from, to: sw.includedTimelineRange.to });
  const artifact = await buildDreamArtifact(fs, ws, { id: sw.id, observerId: sw.observerId, from: sw.includedTimelineRange.from, to: sw.includedTimelineRange.to }, result);
  await writeDream(fs, ws, { artifact, result });
  for (const h of result.hypotheses) await writeHypothesis(fs, ws, h);
  return scrubFinal(RECALL_PREFIX + renderSleepWindow(sw) + "\n" + renderDreamResult(result) + flushWarn);
}
