const STRIP = ["风险", "问题", "隐患", "瓶颈", "成本", "缺陷", "压力", "负担"];
const keywordOf = (item) => {
    let k = String(item || "").trim();
    for (const s of STRIP)
        if (k.endsWith(s))
            k = k.slice(0, -s.length);
    return k.trim();
};
export const distortionPatterns = (traces) => {
    const out = new Set();
    for (const t of traces) {
        const hid = t.projection?.hidden || [];
        const actual = String(t.outcome?.actual || "").toLowerCase();
        if (!actual)
            continue;
        for (const h of hid) {
            const kw = keywordOf(h);
            if (kw && actual.includes(kw.toLowerCase()))
                out.add(`低估/漏看「${h}」`);
        }
    }
    return [...out];
};
