// dsh-shadow —— temporal/edge.ts：TemporalEdge 构建（时间结构关系，不声明世界因果）。
// derivation{rule, sourceIds} 必须保留，供未来追问"为什么认为存在这个结构"。
import type { TemporalEdge, TemporalNode } from "./types.js";
import type { ObservationTrace } from "../core/types.js";

export const buildEdges = (nodes: TemporalNode[], traces: Partial<ObservationTrace>[]): TemporalEdge[] => {
  const edges: TemporalEdge[] = [];
  const sorted = [...nodes].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  const byId = new Map(sorted.map((n) => [n.id, n]));
  for (let i = 0; i < sorted.length - 1; i++) {
    edges.push({
      from: sorted[i].id, to: sorted[i + 1].id, relation: "followed_by", confidence: 1,
      derivation: { rule: "timestamp_order", sourceIds: [sorted[i].id, sorted[i + 1].id] },
    });
  }
  // possible_causal_link：高置信枚举（决策上一步观察）；非因果断言，不注入 World Model。
  for (let i = 1; i < sorted.length; i++) {
    const t = traces.find((tt) => tt.id === sorted[i].id);
    if (t?.decision?.action) {
      edges.push({
        from: sorted[i - 1].id, to: sorted[i].id, relation: "possible_causal_link", confidence: 0.6,
        derivation: { rule: "decision_follows_observation", sourceIds: [sorted[i - 1].id, sorted[i].id] },
      });
    }
  }
  return edges;
};

// 保留：把结论标记为 evolved_into（accepted reflection）——v0.26 不跑 reflection，留接口。
export const relationForProposal = (_n: any): TemporalEdge["relation"] => "evolved_into";
