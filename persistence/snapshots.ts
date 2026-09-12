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
 *
 * ⚠ **回退语义（v1.15.58 起会留痕）**：某一天的最新快照解析失败时，本函数会**继续找更旧的**并返回它。
 * 这是**有意的**（不因一份坏文件就让整条读路径返回 null），但调用方**必须知道**自己拿到的是旧图：
 * 故回退发生时打印一条含「跳过了哪些 / 实际用了哪份」的日志。**静默回退**会让「读到旧投影」
 * 伪装成「投影就是当前状态」（ADR-0003：派生件不是 source）。
 */
export const readLatestSnapshot = async <T = any>(fs: any, ws: string, dirRel: string, fileName = "graph.json"): Promise<T | null> => {
  const skipped: string[] = []; // 坏件（**回退到更旧快照时必须说出来**，见下）
  try {
    const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}`, { cwd: ws });
    const entries = (await fs.listDir(root).catch(() => [])) || [];
    // **降序**：第一个含快照的日期即最新（升序取第一个会拿到最旧 —— 这是修掉的那个 bug）。
    const dates = entries
      .filter((e: any) => e?.name && DATE_DIR.test(e.name))
      .map((e: any) => String(e.name))
      .sort((a: string, b: string) => b.localeCompare(a));
    for (const name of dates) {
      const dir = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}/${name}`, { cwd: ws });
      const files = (await fs.listDir(dir).catch(() => [])) || [];
      if (!files.some((f: any) => f?.name === fileName)) continue;
      const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/${dirRel}/${name}/${fileName}`, { cwd: ws });
      const txt = await fs.readText(p);
      if (!txt) { console.log(`[dsh-shadow] 快照为空文件，跳过：${name}/${fileName}`); continue; }
      try {
        if (skipped.length) {
          // **回退到更旧快照必须可见**（v1.15.58）：否则调用方读到的是旧图却以为是当前图 ——
          // 「读到旧投影」与「投影就是旧的」是两件事（ADR-0003：派生件不是 source）。
          console.log(`[dsh-shadow] ⚠ 较新的快照**坏件**，已回退到更旧的：跳过 ${skipped.join(", ")} ⇒ 实际使用 ${name}/${fileName}`);
        }
        return JSON.parse(txt) as T;
      } catch {
        skipped.push(`${name}/${fileName}`); // 坏快照跳过，继续找更旧的（不因一份坏文件就返回 null）
        continue;
      }
    }
  } catch { /* 目录不存在 */ }
  return null;
};
