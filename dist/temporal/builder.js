import { GRAPH_VERSION } from "./types.js";
import { readObservationTraces } from "../observer/trace.js";
import { readIdentityVersions } from "../identity/timeline.js";
import { buildNode } from "./node.js";
import { buildEdges } from "./edge.js";
import { resolvedVersionOf } from "./timeline.js";
import { today } from "../core/util.js";
export const buildTemporalGraph = async (fs, ws, range = {}) => {
    const traces = await readObservationTraces(fs, ws);
    const versions = (await readIdentityVersions(fs, ws)).map((v) => ({ version: v.version, at: v.at }));
    const from = (range.from || "").slice(0, 10);
    const to = (range.to || "").slice(0, 10);
    const nodes = traces
        .filter((t) => {
        const d = String(t.createdAt || "").slice(0, 10);
        if (from && d && d < from)
            return false;
        if (to && d && d > to)
            return false;
        return true;
    })
        .map((t) => buildNode(t, resolvedVersionOf(versions, String(t.createdAt || "").slice(0, 10))));
    const edges = buildEdges(nodes, traces);
    return {
        graphVersion: GRAPH_VERSION,
        generatedAt: today(),
        sourceRange: { from: from || "", to: to || "" },
        sourceTraceIds: nodes.flatMap((n) => n.sourceTraceIds),
        nodes,
        edges,
    };
};
