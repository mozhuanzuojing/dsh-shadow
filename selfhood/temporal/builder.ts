// dsh-shadow —— selfhood/temporal/builder.ts：TemporalGraph 构建（从 ObservationTrace 派生，可重建）。
import type { TemporalGraph } from "./types.js";
import { GRAPH_VERSION } from "./types.js";
import { readObservationTraces } from "../../subject/observer/trace.js";
import { readIdentityVersions } from "../identity/timeline.js";
import { buildNode } from "./node.js";
import { buildEdges } from "./edge.js";
import { resolvedVersionOf } from "./timeline.js";
import { today, inDateRange } from "../../core/util.js";

export interface TemporalRange { from?: string; to?: string; }

export const buildTemporalGraph = async (fs: any, ws: string, range: TemporalRange = {}): Promise<TemporalGraph> => {
  // B4 消费点：两个 reader 返回**带 `skipped` / `readFailure` 的结构化结果**
  //（`subject/observer/trace.ts` 的 `ObservationTraces`、`selfhood/identity/timeline.ts` 的 `IdentityVersions`）。
  // 两个信号**随图带出**（承载位在 `TemporalGraph.sourceSkipped` / `sourceReadFailure`），
  // 由 `query/observer-kernel.ts` 的 `mode:"temporal"` 经 `skippedWarn` / `readCauseWarn` 说给读者 ——
  // 不能只落在这里，否则「图偏少」与「真的只有这些」在输出上逐字不可区分。
  const traceRead = await readObservationTraces(fs, ws);
  const versionRead = await readIdentityVersions(fs, ws);
  const traces = traceRead.traces;
  const versions = versionRead.versions.map((v) => ({ version: v.version, at: v.at }));
  const from = (range.from || "").slice(0, 10);
  const to = (range.to || "").slice(0, 10);
  const nodes = traces
    // B7：区间过滤**收一处**到 `core/util.ts` 的 `inDateRange`（原先与 `selfhood/dream/compress.ts`
    // 各写一份逐字同形的实现 ⇒ 一方漂移就会让 `buildTemporalGraph` 与 `offlineCompression`
    // 给出不同的窗口语义，而 `buildDreamArtifact` 正是拿前者的图配后者的模式）。
    // 语义逐字等价：空日期 ⇒ 通过；`from`/`to` 已按前 10 字符收窄，与下面两行原判定的比较面相同。
    .filter((t) => inDateRange(t.createdAt, from, to))
    .map((t) => buildNode(t, resolvedVersionOf(versions, String(t.createdAt || "").slice(0, 10))));
  const edges = buildEdges(nodes, traces);
  const graph: TemporalGraph = {
    graphVersion: GRAPH_VERSION,
    generatedAt: today(),
    sourceRange: { from: from || "", to: to || "" },
    sourceTraceIds: nodes.flatMap((n) => n.sourceTraceIds),
    nodes,
    edges,
  };
  // 两个读者各自的削样本数**相加**（它们喂同一张图的两类输入：轨迹 → 节点/边，身份版本 → 节点的
  // `identityVersion`）；目录级失败原因则**并列**（两个都读不出来时读者要看到两条，而不是只看到第一条）。
  // ⚠ **健康路径不带这两个字段**（不是写 0）—— 与 `query/observatory.ts` 的 `badLines`
  //   「没有坏行 ⇒ 不带该字段（免得被读成 0）」同一条口径 ⇒ 未削样本时 `graph.json` 与改动前逐字节相同。
  const skipped = traceRead.skipped + versionRead.skipped;
  const readFailure = [traceRead.readFailure, versionRead.readFailure].filter(Boolean).join("；");
  if (skipped > 0) graph.sourceSkipped = skipped;
  if (readFailure) graph.sourceReadFailure = readFailure;
  return graph;
};
