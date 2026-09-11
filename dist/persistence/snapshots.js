// dsh-shadow —— persistence/snapshots.ts：按日期目录存图的**快照读取**（单一来源）。
//
// **为什么收敛成一处**（ADR-0071）：`temporal/persistence.ts` 与 `world/persistence/persist.ts`
// 原本各有一份**逐字近重复**的读取逻辑（连 bug 都一样），正是 `tools/audit-drift.ts` 的**检测 B**
// 报出的那两个模块（键 `name=graph.json`）。本仓这几轮的教训是「同一逻辑在多处表达，
// 其中一处会漂移」——故把这份逻辑收敛到此，两个 reader 只做参数化调用。
//
// **顺序纪律（原 bug 的根因）**：`listDir` 的契约是 *"List direct children of a directory in
// **stable name order**"*，真机实现是 `entries.sort((l, r) => l.name.localeCompare(r.name))`
// ⇒ **升序**。而日期目录名是 `YYYY-MM-DD`（字典序 = 时间序）。故「取第一个」= **取最旧**。
// 本函数**先按名字降序**再找，第一个命中的就是**最新**的那份快照。
//
// 快照是**可重建的派生件**（ADR-0003 / ADR-0017 / ADR-0024）——回读一份**更旧**的派生件，
// 正是「投影与源头脱钩」那一类；故取最新是唯一自洽的选择。
import { SHADOW_ROOT } from "../core/paths.js";
const DATE_DIR = /^\d{4}-\d{2}-\d{2}$/;
/**
 * 读 `<shadowRoot>/<dirRel>/<YYYY-MM-DD>/<fileName>` 里**最新**的一份。
 *
 * @param dirRel 相对 `.shadow/` 的目录（如 `temporal` / `world`）
 * @param fileName 快照文件名（默认 `graph.json`）
 * @returns 解析出的对象；**没有任何快照 / 全部解析失败 → null**（不抛、不编造）
 */
export const readLatestSnapshot = async (fs, ws, dirRel, fileName = "graph.json") => {
    try {
        const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}`, { cwd: ws });
        const entries = (await fs.listDir(root).catch(() => [])) || [];
        // **降序**：第一个含快照的日期即最新（升序取第一个会拿到最旧 —— 这是修掉的那个 bug）。
        const dates = entries
            .filter((e) => e?.name && DATE_DIR.test(e.name))
            .map((e) => String(e.name))
            .sort((a, b) => b.localeCompare(a));
        for (const name of dates) {
            const dir = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}/${name}`, { cwd: ws });
            const files = (await fs.listDir(dir).catch(() => [])) || [];
            if (!files.some((f) => f?.name === fileName))
                continue;
            const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}/${name}/${fileName}`, { cwd: ws });
            const txt = await fs.readText(p);
            if (!txt)
                continue;
            try {
                return JSON.parse(txt);
            }
            catch {
                continue; // 坏快照跳过，继续找更旧的（不因一份坏文件就返回 null）
            }
        }
    }
    catch { /* 目录不存在 */ }
    return null;
};
