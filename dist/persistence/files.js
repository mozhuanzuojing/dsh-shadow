// dsh-shadow —— persistence/files.ts：记忆文件读写 + 记忆枚举。从 index.ts 迁出。
export const readRel = async (fs, ws, rel) => {
    if (!fs || !ws)
        return "";
    try {
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        return await fs.readText(t);
    }
    catch {
        return "";
    }
};
export const listMemories = async (fs, ws) => {
    const out = [];
    try {
        const root = await fs.resolve(`${ws}/shadow`, { cwd: ws });
        const dates = await fs.listDir(root);
        for (const d of dates) {
            if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name))
                continue;
            const dt = await fs.resolve(`${ws}/shadow/${d.name}`, { cwd: ws });
            const files = await fs.listDir(dt);
            for (const f of files) {
                const n = f?.name;
                if (!n || !n.endsWith(".md") || n === "_index.md")
                    continue;
                const tm = n.match(/^\d{4}-\d{2}-\d{2}--(\d{6})/);
                out.push({ date: d.name, name: n, rel: `shadow/${d.name}/${n}`, time: tm ? tm[1] : "" });
            }
        }
    }
    catch { /* shadow 目录不存在 */ }
    return out;
};
