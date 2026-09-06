// 生命周期：candidate → supported → unstable → rejected；**永不 truth**。
export const parseTriple = (text) => {
    // "subject predicate object" 或 "subject 是 predicate" 的极简三元组
    const t = String(text || "").trim();
    const m = t.match(/^(.+?)\s+(是|has|is|为|出现|暴露|具有)\s+(.+)$/);
    if (m)
        return { subject: m[1], predicate: m[2], object: m[3] };
    const parts = t.split(/\s+/).filter(Boolean);
    if (parts.length >= 3)
        return { subject: parts[0], predicate: parts[1], object: parts.slice(2).join(" ") };
    return { subject: t, predicate: "observed", object: t };
};
