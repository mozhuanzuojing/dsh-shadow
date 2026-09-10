// dsh-shadow —— federation/difference.ts：G3 Observer Difference Engine（核心产物）。
// 输出 difference / blindSpot / unresolvedQuestion，不是 winner（Federation 价值=暴露"为什么看到不同世界"）。
import type { FederatedPerspective, ObserverDifference } from "./types.js";

export const differenceOf = (pa: FederatedPerspective, pb: FederatedPerspective, realEvidenceRef: string): ObserverDifference => {
  const union = Array.from(new Set([...pa.projectionSnapshot.visible, ...pb.projectionSnapshot.visible]));
  const blindSpot = union.filter((x) => !pa.projectionSnapshot.visible.includes(x) || !pb.projectionSnapshot.visible.includes(x));
  const visDiffA = pb.projectionSnapshot.visible.filter((x) => !pa.projectionSnapshot.visible.includes(x));
  const visDiffB = pa.projectionSnapshot.visible.filter((x) => !pb.projectionSnapshot.visible.includes(x));
  const hidDiffA = pb.projectionSnapshot.hidden.filter((x) => !pa.projectionSnapshot.hidden.includes(x));
  const hidDiffB = pa.projectionSnapshot.hidden.filter((x) => !pb.projectionSnapshot.hidden.includes(x));
  const unresolvedQuestion = blindSpot.slice(0, 4).map((x) => `为什么 ${x} 只被一方看到？`);
  return {
    realEvidenceRef,
    observerA: pa.observerId,
    observerB: pb.observerId,
    projectionDelta: {
      visibleDifference: [...visDiffA, ...visDiffB],
      hiddenDifference: [...hidDiffA, ...hidDiffB],
      lensDifference: pa.projectionSnapshot.lens === pb.projectionSnapshot.lens ? [] : [`${pa.projectionSnapshot.lens || "default"} vs ${pb.projectionSnapshot.lens || "default"}`],
    },
    possibleBlindSpot: blindSpot,
    unresolvedQuestion,
  };
};

export const renderDifference = (d: ObserverDifference) => {
  const lines = ["[Observer Difference]"];
  lines.push(`realityRef ${d.realEvidenceRef} · ${d.observerA} vs ${d.observerB}`);
  lines.push(`visibleDiff ${d.projectionDelta.visibleDifference.join("、") || "—"}`);
  lines.push(`hiddenDiff ${d.projectionDelta.hiddenDifference.join("、") || "—"}`);
  lines.push(`lensDiff ${d.projectionDelta.lensDifference.join("、") || "—"}`);
  lines.push(`blindSpot ${d.possibleBlindSpot.join("、") || "—"}`);
  for (const q of d.unresolvedQuestion) lines.push(`unresolved ${q}`);
  return lines.join("\n");
};
