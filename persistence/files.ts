import { SHADOW_ROOT } from "../core/paths.js";

// dsh-shadow —— persistence/files.ts：记忆文件读写 + 记忆枚举。从 index.ts 迁出。
export const readRel = async (fs: any, ws: string, rel: string) => {
  if (!fs || !ws) return "";
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    return await fs.readText(t);
  } catch {
    return "";
  }
};

// ── 记忆文件名里的**时间判据（唯一来源）** ────────────────────────────────────────
// `date`/`time` 是**取代裁决**的输入（`query/query.ts:299` → `verdictOf`），而裁决决定打分（×0.7）
// 与生命周期标签。所以「同一个文件的时间」必须与「它是怎么被读到的」无关。
//
// 为什么必须是**函数**而不是两处各写一遍正则（v1.15.38 修复）：
//   写侧（`core/writer-materialize.ts` 造 consolidated 文件名）与读侧（本文件的枚举）
//   曾各自决定 `time`：写侧用 `ep.startedAt.slice(11,17).replace(/:/g,"")`（`YYYY-MM-DD HH:MM:SS`
//   下取到 `"09:00:"` → `"0900"`，**4 位**、不是 HHMMSS），且文件名里**没有**时间戳 ⇒
//   读侧正则 `^\d{4}-\d{2}-\d{2}--(\d{6})` 不匹配 ⇒ 重启后同一文件 `time = ""`。
//   ⇒ 本进程判「后写的更新」，重启后判「同日并列、谁都不被取代」（判据分叉，ADR-0069 同族）。
// 现在写侧**从文件名反解** `time`（`timeFromName(name)`），使两侧**同源**、不可能再分叉。
export const timeFromName = (name: string): string =>
  (String(name || "").match(/^\d{4}-\d{2}-\d{2}--(\d{6})/) || ["", ""])[1] || "";

/** 记忆文件名的规范形态：`<date>--<HHMMSS>-<rest>`；`time` 非 6 位时退回 `<date>--<rest>`（读侧给 `""`）。 */
export const memoryFileName = (date: string, time: string, rest: string): string =>
  `${date}--${/^\d{6}$/.test(String(time || "")) ? `${time}-` : ""}${rest}`;

export const listMemories = async (fs: any, ws: string) => {
  const out: any[] = [];
  try {
    const root = await fs.resolve(`${ws}/${SHADOW_ROOT}`, { cwd: ws });
    const dates = await fs.listDir(root);
    for (const d of dates) {
      if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
      const dt = await fs.resolve(`${ws}/${SHADOW_ROOT}/${d.name}`, { cwd: ws });
      const files = await fs.listDir(dt);
      for (const f of files) {
        const n = f?.name;
        if (!n || !n.endsWith(".md") || n === "_index.md") continue;
        // v1.15.35（D6）：**跳过一切 `_` 前缀文件** —— 它们是**目录级派生物**，不是记忆。
        // 为什么必须是 `_` 前缀而不是一个个列举：本枚举器是**语料入口**，
        // 它多收一个文件 = 多一条「记忆」（会进索引、进召回、进计数）。
        // 原来只排除 `_index.md` 这一**个名字** ⇒ 任何新派生件（如 `_abstract.md`）
        // 只要放进日期目录就会被当成记忆。改成按**前缀**分类，让「派生物 vs 记忆」有唯一判据，
        // 与 ADR-0074 的 `scopedFs`、T5 的 `isAdmissibleClaim` 同一手法（判据收一处）。
        if (n.startsWith("_")) continue;
        out.push({ date: d.name, name: n, rel: `${SHADOW_ROOT}/${d.name}/${n}`, time: timeFromName(n) });
      }
    }
  } catch { /* shadow 目录不存在 */ }
  return out;
};
