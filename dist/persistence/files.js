import { SHADOW_ROOT } from "../core/paths.js";
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
        const root = await fs.resolve(`${ws}/${SHADOW_ROOT}`, { cwd: ws });
        const dates = await fs.listDir(root);
        for (const d of dates) {
            if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name))
                continue;
            const dt = await fs.resolve(`${ws}/${SHADOW_ROOT}/${d.name}`, { cwd: ws });
            const files = await fs.listDir(dt);
            for (const f of files) {
                const n = f?.name;
                if (!n || !n.endsWith(".md") || n === "_index.md")
                    continue;
                // v1.15.35（D6）：**跳过一切 `_` 前缀文件** —— 它们是**目录级派生物**，不是记忆。
                // 为什么必须是 `_` 前缀而不是一个个列举：本枚举器是**语料入口**，
                // 它多收一个文件 = 多一条「记忆」（会进索引、进召回、进计数）。
                // 原来只排除 `_index.md` 这一**个名字** ⇒ 任何新派生件（如 `_abstract.md`）
                // 只要放进日期目录就会被当成记忆。改成按**前缀**分类，让「派生物 vs 记忆」有唯一判据，
                // 与 ADR-0074 的 `scopedFs`、T5 的 `isAdmissibleClaim` 同一手法（判据收一处）。
                if (n.startsWith("_"))
                    continue;
                const tm = n.match(/^\d{4}-\d{2}-\d{2}--(\d{6})/);
                out.push({ date: d.name, name: n, rel: `${SHADOW_ROOT}/${d.name}/${n}`, time: tm ? tm[1] : "" });
            }
        }
    }
    catch { /* shadow 目录不存在 */ }
    return out;
};
