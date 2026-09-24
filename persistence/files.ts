import { SHADOW_ROOT, ATOMS_DIR, atomsRel } from "../core/paths.js";

// dsh-shadow —— persistence/files.ts：记忆文件读写 + 记忆枚举（ADR-0106 投影空间）。
// 权威语料 = `.shadow/atoms/<date>--<HHMMSS>-….md`；日期树不再枚举。
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
// `date`/`time` 是**取代裁决**的输入；写侧造名与读侧反解必须同源（ADR-0069 同族）。
export const timeFromName = (name: string): string =>
  (String(name || "").match(/^\d{4}-\d{2}-\d{2}--(\d{6})/) || ["", ""])[1] || "";

/** 从规范文件名取日期段：`<date>--<HHMMSS>-…`。 */
export const dateFromName = (name: string): string =>
  (String(name || "").match(/^(\d{4}-\d{2}-\d{2})--/) || ["", ""])[1] || "";

/** 记忆文件名的规范形态：`<date>--<HHMMSS>-<rest>`；`time` 非 6 位时退回 `<date>--<rest>`（读侧给 `""`）。 */
export const memoryFileName = (date: string, time: string, rest: string): string =>
  `${date}--${/^\d{6}$/.test(String(time || "")) ? `${time}-` : ""}${rest}`;

/**
 * **记忆文件判据（唯一一份实现）**：`.md`、非 `_index.md`、非 `_` 前缀。
 * 派生索引与 `listMemories` 共用（T17-B）。
 */
export const isMemoryFileName = (name: unknown): boolean => {
  const n = String(name ?? "");
  return n.endsWith(".md") && n !== "_index.md" && !n.startsWith("_");
};

/** Atom 的规范 rel：`.shadow/atoms/<name>`。 */
export const atomRel = (name: string): string => `${atomsRel()}/${name}`;

export const listMemories = async (fs: any, ws: string) => {
  const out: any[] = [];
  try {
    const root = await fs.resolve(`${ws}/${atomsRel()}`, { cwd: ws });
    const files = await fs.listDir(root);
    for (const f of files) {
      const n = f?.name;
      if (!isMemoryFileName(n)) continue;
      const date = dateFromName(n);
      out.push({ date, name: n, rel: atomRel(n), time: timeFromName(n) });
    }
  } catch { /* atoms 目录不存在 */ }
  return out;
};

/** 导出供指纹/sqlite 识别「权威源目录名」—— 仅 `atoms`（resources 另案）。 */
export { ATOMS_DIR, SHADOW_ROOT };
