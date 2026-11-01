/**
 * v2 engine/write — 用户裁决（纠正 / 撤回 / 恢复）。
 *
 * 不变量：
 * - 纠正只追加新的 Source Atom（`> 纠正：<target>`）；旧 Atom 不改写、不删除。
 * - 撤回只追加新的 Source Atom（`> 撤回：<correction>`）；纠正记录保留，但不再生效。
 * - 恢复把 archive/trash 中的 Atom 复制回热区；archive/trash 仍保留，直到保留期清理。
 */

import { dirname } from "node:path";
import { err, ok, type Outcome } from "../../contract/outcome.js";
import type { Clock } from "../../contract/time.js";
import { scrubUnsafe } from "../../domain/text.js";
import { loadAllAtoms } from "../../store/archive.js";
import { writeAtom, type WriteAtomResult } from "../../store/atoms.js";
import type { FsPort } from "../../store/fs.js";

export type AdjudicationAction = "correct" | "withdraw" | "restore";

export interface AdjudicationResult {
  action: AdjudicationAction;
  target: string;
  rel: string;
  note: string;
}

const normalizeRel = (raw: string): string => {
  const s = String(raw ?? "").trim();
  const hash = s.indexOf("#");
  return (hash >= 0 ? s.slice(hash + 1) : s).replace(/\\/g, "/");
};

const bodyText = (ws: string, date: string, time: string, field: "纠正" | "撤回", target: string, note: string): string => {
  const hhmmss = `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`;
  return [
    "# shadow/adjudication",
    "",
    "> 完整线索",
    `> 坐标：locus(${ws}) · when(${date} ${hhmmss}) · soul(default) · role(default) · intent(adjudication)`,
    `> 摘要：${field} ${target}`,
    `> ${field}：${target}`,
    `> 决策：〔user〕${note}`,
    "",
    `- [${hhmmss}] [shadow/adjudication] 用户：${note}`,
    "",
  ].join("\n");
};

const writeAdjudicationAtom = async (
  fs: FsPort,
  ws: string,
  clock: Clock,
  field: "纠正" | "撤回",
  target: string,
  note: string,
): Promise<Outcome<WriteAtomResult>> => {
  const date = clock.today();
  const time = clock.stamp().replace(/:/g, "");
  return writeAtom(
    fs,
    ws,
    {
      entry: "shadow/adjudication",
      date,
      time,
      text: bodyText(ws, date, time, field, normalizeRel(target), scrubUnsafe(note).trim() || (field === "纠正" ? "用户纠正" : "用户撤回")),
    },
    clock,
  );
};

const targetExists = async (fs: FsPort, ws: string, rel: string): Promise<boolean> => {
  const all = await loadAllAtoms(fs, ws);
  if (!all.ok) return false;
  return all.value.atoms.some((a) => a.rel === rel);
};

/** 用户纠正：追加 correction Atom；旧 Atom 保留。 */
export const correctAtom = async (
  fs: FsPort,
  ws: string,
  clock: Clock,
  targetRaw: string,
  note = "",
): Promise<Outcome<AdjudicationResult>> => {
  const target = normalizeRel(targetRaw);
  if (!target.startsWith(".shadow/atoms/")) return err("INVALID", `纠正目标必须是 .shadow/atoms/...：${target}`);
  if (!(await targetExists(fs, ws, target))) return err("NOT_FOUND", `纠正目标不存在：${target}`);
  const w = await writeAdjudicationAtom(fs, ws, clock, "纠正", target, note);
  if (!w.ok) return w;
  return ok({ action: "correct", target, rel: w.value.rel, note });
};

/** 用户撤回一条纠正：追加 withdraw Atom；旧 target 重新出现在正常排序中。 */
export const withdrawCorrection = async (
  fs: FsPort,
  ws: string,
  clock: Clock,
  correctionRaw: string,
  note = "",
): Promise<Outcome<AdjudicationResult>> => {
  const correction = normalizeRel(correctionRaw);
  const all = await loadAllAtoms(fs, ws);
  if (!all.ok) return { ok: false, error: all.error };
  const target = all.value.atoms.find((a) => a.rel === correction);
  if (!target) return err("NOT_FOUND", `纠正记录不存在：${correction}`);
  if (!target.corrects) return err("INVALID", `目标不是纠正记录：${correction}`);
  const w = await writeAdjudicationAtom(fs, ws, clock, "撤回", correction, note);
  if (!w.ok) return w;
  return ok({ action: "withdraw", target: correction, rel: w.value.rel, note });
};

/** 从 archive/trash 恢复到热区；不删除 archive/trash 副本。 */
export const restoreAtom = async (
  fs: FsPort,
  ws: string,
  targetRaw: string,
): Promise<Outcome<AdjudicationResult>> => {
  const rel = normalizeRel(targetRaw);
  if (!rel.startsWith(".shadow/atoms/")) return err("INVALID", `恢复目标必须是 .shadow/atoms/...：${rel}`);
  if (await fs.exists(`${ws}/${rel}`)) return ok({ action: "restore", target: rel, rel, note: "已在热区" });

  let text: string | undefined;
  const all = await loadAllAtoms(fs, ws);
  if (all.ok) text = all.value.atoms.find((a) => a.rel === rel)?.body;

  if (!text) {
    // 只剩 .trash 副本时也允许恢复；目录按 atom 日期命名。
    const name = rel.split("/").pop() ?? "";
    const date = (name.match(/^(\d{4}-\d{2}-\d{2})/) ?? [])[1];
    if (date) {
      const trashed = await fs.readText(`${ws}/.shadow/.trash/${date}/${name}`);
      if (trashed.ok) text = trashed.value;
    }
  }
  if (!text) return err("NOT_FOUND", `archive/trash 中都找不到：${rel}`);

  const mk = await fs.mkdirp(`${ws}/${dirname(rel)}`);
  if (!mk.ok) return mk;
  const w = await fs.writeText(`${ws}/${rel}`, text);
  if (!w.ok) return w;
  return ok({ action: "restore", target: rel, rel, note: "已从 archive/trash 恢复" });
};
