// dsh-shadow —— world/explain/explain.ts：World Representation 的 lineage 解释（不是 DB lookup）。
// Answer "为什么系统认为这个世界结构存在？" -> RepresentationObject -> RealityClaim -> RealityObservation -> Observer Perspective -> Validation History。
import type { RepresentationGraph } from "../types.js";
import type { RealityClaim } from "../../reality/types.js";
import type { RealityObservation } from "../../reality/types.js";

export const explain = (graph: RepresentationGraph | null, subject: string, observations: RealityObservation[], claims: RealityClaim[]): string => {
  if (!graph || !graph.objects.length) return "（无 RepresentationObject：仅 supported RealityClaim 可进 Representation）";
  const obj = graph.objects.find((o) => o.basedOnClaims.some((cid) => { const c = claims.find((x) => x.id === cid); return c && (c.subjectRef === subject || c.subject === subject); })) || graph.objects[0];
  const lines = ["[World Representation]"];
  lines.push(`representation ${obj.id} · basedOnClaims ${obj.basedOnClaims.join("、")} · uncertainty ${obj.uncertainty.toFixed(2)}`);
  lines.push("explain:");
  for (const o of observations) lines.push(`  RealityObservation: ${o.observation} (perspectives: ${o.sourcePerspectives.join("、") || "—"})`);
  lines.push(`  Validation History: ${obj.basedOnClaims.length} supported claim(s)`);
  lines.push("（不是『系统知道 X 存在』，而是『因为这些观察/验证/时间上下文支持这个表示』）");
  return lines.join("\n");
};
