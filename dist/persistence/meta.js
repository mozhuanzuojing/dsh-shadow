// dsh-shadow —— persistence/meta.ts：_meta.json 派生状态读写（Derived Artifact）。从 index.ts 迁出。
export const readMeta = async (fs, ws) => {
    if (!fs || !ws)
        return {};
    try {
        const t = await fs.resolve(`${ws}/shadow/_meta.json`, { cwd: ws });
        const txt = await fs.readText(t);
        return txt ? (JSON.parse(txt) || {}) : {};
    }
    catch {
        return {};
    }
};
export const writeMeta = async (fs, ws, meta) => {
    if (!fs || !ws)
        return;
    try {
        const t = await fs.resolve(`${ws}/shadow/_meta.json`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(meta));
    }
    catch (e) {
        console.log("[dsh-shadow] meta write failed:", e && e.message);
    }
};
