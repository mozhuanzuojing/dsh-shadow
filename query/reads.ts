// dsh-shadow —— query/reads.ts：ReadQuery 深 seam（候选 1，方案 A）。
// 目标：把「read 概念」从 query.ts 的 61 分支 god monolith 里立成满足同一 seam 的深模块。
//   每个读概念一个 handler：mode 命中 -> run(view/args/ctx) -> 派生+渲染（带 RECALL_PREFIX+flushWarn）。
// 共享的「物化原子」由 query/materialize.ts 提供（唯一定义），不再在各分支复制脚手架。
import {
  loadOrBuildProjection,
} from "../core/projection-store.js";
import { deriveShadowNodes, queryShadow, matchShadowNodes, renderContext as renderShadowContext } from "../core/node.js";
import { recordQueryObservation, evidenceBreakdownOf } from "./observatory.js";
import { materializeAtoms } from "./materialize.js";
import { today, stamp, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";

export interface ReadCtx {
  fs: any;
  ws: string;
  flushWarn: string;
  agent: any;
}
export interface ReadQuery {
  modes: string[];                       // 它负责的 mode 串
  run(deps: any, args: any, exec: any, ctx: ReadCtx): Promise<string>;
}

// ── shadow_query：统一 ShadowNode View + 跨类型上下文 + 旁路观测 + 可选 Projection 缓存（最深的一个读）──
const shadowQuery: ReadQuery = {
  modes: ["query"],
  run: async (deps, args, _exec, ctx) => {
    const { fs, ws, flushWarn } = ctx;
    const topicQ = String(args?.topic || "").trim();
    const qStart = Date.now();
    const { nodes, cached } = await loadOrBuildProjection(fs, ws, deps.config, async () => {
      const { parsed } = await materializeAtoms(fs, ws, deps.config);
      return deriveShadowNodes(parsed);
    });
    const scope = Array.isArray(args?.scope) ? args.scope.filter((t: string) => ["memory", "code", "document", "decision", "concept"].includes(t)) : [];
    const limit = Math.max(1, Math.min(30, Number(args?.limit) || 8));
    const items = queryShadow(nodes, topicQ, scope, limit);
    const matchedNodes = matchShadowNodes(nodes, topicQ, scope).slice(0, limit);
    const nodeTypes = matchedNodes.reduce((acc: Record<string, number>, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
    const bd = evidenceBreakdownOf(matchedNodes);
    await recordQueryObservation(fs, ws, deps.config, {
      date: today(), ts: stamp(), query: topicQ, scope, limit,
      candidateNodes: nodes.length, projectionCached: cached, returnedNodes: items.length,
      evidenceCount: Array.from(new Set(items.flatMap((it) => it.evidence))).length,
      evidenceNodes: matchedNodes.filter((n) => n.evidence.length > 0).length,
      relationCount: matchedNodes.reduce((a, n) => a + n.relations.length, 0),
      relationNodes: matchedNodes.filter((n) => n.relations.length > 0).length,
      nodeTypes, nodeTitles: matchedNodes.map((n) => n.title), latencyMs: Date.now() - qStart,
      evidenceByType: bd.byType, evidenceByKind: bd.byKind, evidenceByCreatedBy: bd.byCreatedBy,
    });
    return scrubFinal(RECALL_PREFIX + renderShadowContext(topicQ, items) + flushWarn);
  },
};

export const readQueries: ReadQuery[] = [shadowQuery];

const modeOf = (args: any) => String(args?.mode || "");
export const findReadQuery = (args: any): ReadQuery | undefined => {
  const m = modeOf(args);
  return readQueries.find((q) => q.modes.includes(m) || (m === "query" && args?.shadowQuery));
};

/** 若 mode 命中某 ReadQuery，则交给它并返回；否则返回 undefined（交由 runReadShadow 继续走内联分支）。 */
export const dispatchReadQuery = async (deps: any, args: any, exec: any, ctx: ReadCtx): Promise<string | undefined> => {
  const q = findReadQuery(args);
  if (!q) return undefined;
  return q.run(deps, args, exec, ctx);
};
