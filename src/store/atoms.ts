/**
 * v2 store — atoms：唯一权威的读写。
 *
 * 命名：<date>--<HHMMSS>-<slug>--<uid6>.md；v1 旧名可读。
 * 写入：临时文件 + rename；先查存在，碰撞换 uid（绝不覆盖）。
 */

import { ATOMS_DIR, atomFileName, isAtomName, newUid, parseAtomName } from "../contract/paths.js";
import { err, ok, type Outcome } from "../contract/outcome.js";
import { dateOf, timeOf, type Clock } from "../contract/time.js";
import type { ParsedAtom } from "../contract/types.js";
import { parseAtom } from "../domain/parse.js";
import { slug } from "../domain/text.js";
import type { FsPort } from "./fs.js";

export interface AtomFile {
  name: string;
  rel: string;
}

export interface LoadAtomsResult {
  atoms: ParsedAtom[];
  errors: { rel: string; code: string; message: string }[];
}

const join = (ws: string, rel: string): string => `${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`;

export const listAtomFiles = async (fs: FsPort, ws: string): Promise<Outcome<AtomFile[]>> => {
  const dir = join(ws, ATOMS_DIR);
  const listed = await fs.listDir(dir);
  if (!listed.ok) {
    // 首次运行/空工作区：目录不存在是“空”，不是错误；权限/IO 仍是错误。
    if (listed.error.code === "NOT_FOUND") return ok([]);
    return listed;
  }
  const out: AtomFile[] = [];
  for (const e of listed.value) {
    if (e.type === "dir" || !isAtomName(e.name)) continue;
    out.push({ name: e.name, rel: `${ATOMS_DIR}/${e.name}` });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return ok(out);
};

export const readAtom = async (fs: FsPort, ws: string, rel: string): Promise<Outcome<ParsedAtom>> => {
  const name = rel.split("/").pop() ?? "";
  if (!isAtomName(name)) return err("INVALID", `不是记忆文件名：${rel}`, { rel });
  const text = await fs.readText(join(ws, rel));
  if (!text.ok) return text;
  return ok(parseAtom(text.value, rel, name));
};

export const loadAtoms = async (fs: FsPort, ws: string): Promise<Outcome<LoadAtomsResult>> => {
  const files = await listAtomFiles(fs, ws);
  if (!files.ok) return files;
  const atoms: ParsedAtom[] = [];
  const errors: LoadAtomsResult["errors"] = [];
  for (const f of files.value) {
    const text = await fs.readText(join(ws, f.rel));
    if (!text.ok) {
      errors.push({ rel: f.rel, code: text.error.code, message: text.error.message });
      continue;
    }
    const parts = parseAtomName(f.name);
    if (!parts) continue;
    const atom = parseAtom(text.value, f.rel, f.name);
    atoms.push(atom);
  }
  return ok({ atoms, errors });
};

export interface WriteAtomInput {
  entry: string;
  text: string;
  date?: string;
  time?: string;
  uid?: string;
  /** 测试可注入；默认 Math.random。 */
  rand?: () => number;
}

export interface WriteAtomResult {
  rel: string;
  name: string;
  atom: ParsedAtom;
}

export const writeAtom = async (
  fs: FsPort,
  ws: string,
  input: WriteAtomInput,
  clock: Clock,
): Promise<Outcome<WriteAtomResult>> => {
  const date = input.date ?? clock.today();
  const time = input.time ?? timeOf(clock.now());
  const entrySlug = slug(input.entry || "mem");
  const dir = join(ws, ATOMS_DIR);
  const mk = await fs.mkdirp(dir);
  if (!mk.ok) return mk;

  for (let attempt = 0; attempt < 8; attempt++) {
    const uid = attempt === 0 && input.uid ? input.uid : newUid(input.rand);
    const name = atomFileName(date, time, entrySlug, uid);
    const dest = join(ws, `${ATOMS_DIR}/${name}`);
    if (await fs.exists(dest)) continue;
    if (fs.atomicRename === false) {
      const w = await fs.writeText(dest, input.text);
      if (!w.ok) return w;
      return ok({ rel: `${ATOMS_DIR}/${name}`, name, atom: parseAtom(input.text, `${ATOMS_DIR}/${name}`, name) });
    }
    const tmp = join(ws, `${ATOMS_DIR}/.${name}.tmp`);
    const w = await fs.writeText(tmp, input.text);
    if (!w.ok) return w;
    const mv = await fs.rename(tmp, dest);
    if (!mv.ok) {
      await fs.unlink(tmp);
      return mv;
    }
    return ok({ rel: `${ATOMS_DIR}/${name}`, name, atom: parseAtom(input.text, `${ATOMS_DIR}/${name}`, name) });
  }
  return err("CONFLICT", `无法为 ${entrySlug} 生成唯一文件名（同秒碰撞 8 次）`, { date, time, entrySlug });
};

export const atomPath = join;

export const dateTimeOfClock = (clock: Clock): { date: string; time: string } => ({
  date: dateOf(clock.now()),
  time: timeOf(clock.now()),
});
