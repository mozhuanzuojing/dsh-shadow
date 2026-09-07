export const writeGraph = async (fs, ws, g) => {
    try {
        const rel = `.shadow/world/${g.generatedAt}/graph.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(g));
    }
    catch (e) {
        console.log("[dsh-shadow] world graph write failed:", e && e.message);
    }
};
export const readGraph = async (fs, ws) => {
    try {
        const root = await fs.resolve(`${ws}/.shadow/world`, { cwd: ws });
        const dates = (await fs.listDir(root).catch(() => [])) || [];
        for (const d of dates) {
            if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name))
                continue;
            const dt = await fs.resolve(`${ws}/.shadow/world/${d.name}`, { cwd: ws });
            const files = (await fs.listDir(dt).catch(() => [])) || [];
            const gf = files.find((f) => f?.name === "graph.json");
            if (gf) {
                const p = await fs.resolve(`${ws}/.shadow/world/${d.name}/graph.json`, { cwd: ws });
                return JSON.parse(await fs.readText(p));
            }
        }
    }
    catch { /* 无 world 目录 */ }
    return null;
};
