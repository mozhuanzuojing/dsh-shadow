// dsh-shadow —— soul/taste.ts：Taste（curated 偏好）。从 index.ts 迁出。
export const tasteOf = async (fs, ws, soul) => {
    let extra = null;
    try {
        const t = await fs.resolve(`${ws}/shadow/taste/taste.json`, { cwd: ws });
        const txt = await fs.readText(t);
        if (txt)
            extra = JSON.parse(txt);
    }
    catch { /* 无 extra */ }
    return { soul: soul?.taste || null, extra };
};
export const renderTaste = (t) => {
    const lines = ["[Taste]"];
    if (t.soul)
        lines.push(`品味 ${JSON.stringify(t.soul)}`);
    if (t.extra && (t.extra.likes || t.extra.dislikes || t.extra.preferences)) {
        if (Array.isArray(t.extra.likes) && t.extra.likes.length)
            lines.push(`喜欢 ${t.extra.likes.join("、")}`);
        if (Array.isArray(t.extra.dislikes) && t.extra.dislikes.length)
            lines.push(`不喜欢 ${t.extra.dislikes.join("、")}`);
        const pref = t.extra.preferences;
        if (pref && typeof pref === "object")
            lines.push(`偏好 ${JSON.stringify(pref)}`);
    }
    if (!t.soul && !t.extra)
        lines.push("（暂无品味配置：可在 soul.json.taste 或 shadow/taste/taste.json 定义）");
    return lines.join("\n");
};
