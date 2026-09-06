export const compareProjections = (a, b) => {
    const union = Array.from(new Set([...a.visible, ...b.visible]));
    const missA = b.visible.filter((x) => !a.visible.includes(x));
    const missB = a.visible.filter((x) => !b.visible.includes(x));
    return {
        observers: [a.observerId, b.observerId],
        sameReality: { visibleUnion: union },
        disagreement: [
            { observerId: a.observerId, sees: a.visible, misses: missA },
            { observerId: b.observerId, sees: b.visible, misses: missB },
        ],
    };
};
export const renderDistortion = (d) => {
    const lines = ["[Cross Observer Distortion]"];
    lines.push(`sameReality visibleUnion=${d.sameReality.visibleUnion.join("、") || "—"}`);
    for (const x of d.disagreement)
        lines.push(`observer ${x.observerId} · sees ${x.sees.join("、") || "—"} · misses ${x.misses.join("、") || "—"}`);
    return lines.join("\n");
};
