export const differenceOf = (pa, pb, realityEvidenceRef) => {
    const union = Array.from(new Set([...pa.projectionSnapshot.visible, ...pb.projectionSnapshot.visible]));
    const blindSpot = union.filter((x) => !pa.projectionSnapshot.visible.includes(x) || !pb.projectionSnapshot.visible.includes(x));
    const visDiffA = pb.projectionSnapshot.visible.filter((x) => !pa.projectionSnapshot.visible.includes(x));
    const visDiffB = pa.projectionSnapshot.visible.filter((x) => !pb.projectionSnapshot.visible.includes(x));
    const hidDiffA = pb.projectionSnapshot.hidden.filter((x) => !pa.projectionSnapshot.hidden.includes(x));
    const hidDiffB = pa.projectionSnapshot.hidden.filter((x) => !pb.projectionSnapshot.hidden.includes(x));
    const unresolvedQuestion = blindSpot.slice(0, 4).map((x) => `为什么 ${x} 只被一方看到？`);
    return {
        realityEvidenceRef,
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
export const renderDifference = (d) => {
    const lines = ["[Observer Difference]"];
    lines.push(`realityRef ${d.realityEvidenceRef} · ${d.observerA} vs ${d.observerB}`);
    lines.push(`visibleDiff ${d.projectionDelta.visibleDifference.join("、") || "—"}`);
    lines.push(`hiddenDiff ${d.projectionDelta.hiddenDifference.join("、") || "—"}`);
    lines.push(`lensDiff ${d.projectionDelta.lensDifference.join("、") || "—"}`);
    lines.push(`blindSpot ${d.possibleBlindSpot.join("、") || "—"}`);
    for (const q of d.unresolvedQuestion)
        lines.push(`unresolved ${q}`);
    return lines.join("\n");
};
