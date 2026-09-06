import { today } from "../core/util.js";
export const writeTemporalGraph = async (fs, ws, graph) => {
    try {
        const rel = `shadow/temporal/${today()}/graph.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(graph, null, 2));
    }
    catch (e) {
        console.log("[dsh-shadow] temporal graph write failed:", e && e.message);
    }
};
export const readTemporalGraph = async (fs, ws) => {
    try {
        const root = await fs.resolve(`${ws}/shadow/temporal`, { cwd: ws });
        const dates = (await fs.listDir(root).catch(() => [])) || [];
        for (const d of dates) {
            if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name))
                continue;
            const dt = await fs.resolve(`${ws}/shadow/temporal/${d.name}`, { cwd: ws });
            const files = (await fs.listDir(dt).catch(() => [])) || [];
            const gf = files.find((f) => f?.name === "graph.json");
            if (gf) {
                const p = await fs.resolve(`${ws}/shadow/temporal/${d.name}/graph.json`, { cwd: ws });
                return JSON.parse(await fs.readText(p));
            }
        }
    }
    catch { /* 无 temporal 目录 */ }
    return null;
};
