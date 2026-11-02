/**
 * dsh-shadow 维护 CLI（显式、人工运行；不由插件自动调用）。
 *
 * 用途：宿主 fs 没有 unlink/rename 时，插件只能写归档副本、不能物理删除热文件。
 * 本 CLI 在 **DSH 插件沙箱之外** 用 node:fs 做受控维护：
 *   - 默认 dry-run；
 *   - 只删除“archive 已有同 rel 且逐条 hash 相同”的热文件；
 *   - 先移入 .shadow/.trash/<date>/，不直接 rm；
 *   - --apply 才动手；--purge-trash 才清过期 trash。
 *
 * 用法：
 *   node tools/archive-maintenance.ts --ws=D:/project/local-workbench
 *   node tools/archive-maintenance.ts --ws=... --apply
 *   node tools/archive-maintenance.ts --ws=... --apply --purge-trash
 */

import { existsSync } from "node:fs";
import { mkdir, rename, readdir, rm, rmdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { archivedIndex, digestAtom, listArchiveDates, loadAllAtoms, readArchivedAtoms } from "../dist/store/archive.js";
import { loadAtoms } from "../dist/store/atoms.js";
import { realFs } from "../dist/store/fs.js";
import { pinnedBySource } from "../dist/engine/read/recall.js";
import { parseAtom } from "../dist/domain/parse.js";

interface Candidate {
  rel: string;
  date: string;
  size: number;
  hash: string;
}

interface Plan {
  eligible: Candidate[];
  conflicts: Array<{ rel: string; reason: string }>;
  notArchived: string[];
  pinned: string[];
  noHash: string[];
}

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const ws = resolve(arg("ws", process.cwd()));
const apply = flag("apply");
const purgeTrash = flag("purge-trash");
const keepDays = Math.max(0, Math.floor(Number(arg("keep-trash-days", "7")) || 7));
const json = flag("json");

const fail = (message: string): never => {
  console.error(`[maintenance] ${message}`);
  process.exit(2);
};

const all = await loadAllAtoms(realFs, ws);
const allData = all.ok ? all.value : fail(`读取全部 atoms 失败（${all.error.code}）：${all.error.message}`);
if (allData.errors.length) fail(`全部 atoms 有 ${allData.errors.length} 个读取错误；为避免误删，中止`);
const hot = await loadAtoms(realFs, ws);
const hotData = hot.ok ? hot.value : fail(`读取热区失败（${hot.error.code}）：${hot.error.message}`);
if (hotData.errors.length) fail(`热区有 ${hotData.errors.length} 个坏文件；为避免误删，中止`);

const archive = await archivedIndex(realFs, ws);
const archiveData = archive.ok ? archive.value : fail(`读取 archive 索引失败（${archive.error.code}）：${archive.error.message}`);

// manifest 里的 recordHashes 是派生记录；必须再读实际 JSONL，证明 archive 副本真的存在且内容一致。
const archiveActual = new Map<string, string>();
for (const date of await listArchiveDates(realFs, ws)) {
  const atoms = await readArchivedAtoms(realFs, ws, date);
  const archiveAtoms = atoms.ok ? atoms.value : fail(`读取归档 ${date}.jsonl 失败（${atoms.error.code}）：${atoms.error.message}`);
  for (const a of archiveAtoms) archiveActual.set(a.rel, digestAtom(a));
}

const pinned = pinnedBySource(allData.atoms);
const plan: Plan = { eligible: [], conflicts: [], notArchived: [], pinned: [], noHash: [] };

for (const a of hotData.atoms) {
  if (!a.rel.startsWith(".shadow/atoms/") || a.rel.split("/").includes("..")) {
    plan.conflicts.push({ rel: a.rel, reason: "非法 Atom rel（不在 .shadow/atoms/ 或含 ..）" });
    continue;
  }
  if (!archiveData.rels.has(a.rel)) {
    plan.notArchived.push(a.rel);
    continue;
  }
  if (pinned.has(a.rel)) {
    plan.pinned.push(a.rel);
    continue;
  }
  const expected = archiveData.recordHashes.get(a.rel);
  if (!expected) {
    plan.noHash.push(a.rel);
    continue;
  }
  const actual = archiveActual.get(a.rel);
  if (!actual) {
    plan.conflicts.push({ rel: a.rel, reason: "archive JSONL 缺少该 Atom（manifest 有记录但副本不存在）" });
    continue;
  }
  if (actual !== expected) {
    plan.conflicts.push({ rel: a.rel, reason: "manifest hash 与实际 archive JSONL 不一致" });
    continue;
  }
  if (digestAtom(a) !== expected) {
    plan.conflicts.push({ rel: a.rel, reason: "hot 与 archive 逐条 hash 不一致（可能有未归档修改）" });
    continue;
  }
  const st = await realFs.stat(join(ws, a.rel));
  plan.eligible.push({ rel: a.rel, date: a.date, size: st.ok ? st.value.size : 0, hash: expected });
}

const trashRoot = join(ws, ".shadow", ".trash");
const moveOne = async (c: Candidate): Promise<void> => {
  const dir = join(trashRoot, c.date);
  await mkdir(dir, { recursive: true });
  const target = join(dir, basename(c.rel));
  if (existsSync(target)) {
    throw new Error(`trash 目标已存在：${target}`);
  }
  const src = join(ws, c.rel);
  // plan 之后热文件可能又被编辑；移动前再校验一次，避免把“未归档修改”移走。
  const current = await realFs.readText(src);
  if (!current.ok) throw new Error(current.error.message);
  const parsed = parseAtom(current.value, c.rel, basename(c.rel));
  if (digestAtom(parsed) !== c.hash) {
    throw new Error("热文件在 plan 后发生变化；跳过，不移动");
  }
  try {
    await rename(src, target);
  } catch {
    // Windows 同卷 rename 正常；跨卷兜底 copy+unlink（显式维护 CLI，允许 node:fs）。
    const w = await realFs.writeText(target, current.value);
    if (!w.ok) throw new Error(w.error.message);
    const d = await realFs.unlink(src);
    if (!d.ok) throw new Error(d.error.message);
  }
};

const purge = async (): Promise<{ removed: number; skipped: number }> => {
  if (!existsSync(trashRoot)) return { removed: 0, skipped: 0 };
  const cutoff = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const cut = cutoff.toISOString().slice(0, 10);
  let removed = 0;
  let skipped = 0;
  for (const ent of await readdir(trashRoot, { withFileTypes: true })) {
    if (!ent.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(ent.name) || ent.name >= cut) continue;
    const dir = join(trashRoot, ent.name);
    for (const f of await readdir(dir, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      const abs = join(dir, f.name);
      const rel = `.shadow/atoms/${f.name}`;
      const expected = archiveActual.get(rel);
      if (!expected) {
        skipped += 1;
        continue;
      }
      const text = await realFs.readText(abs);
      if (!text.ok || digestAtom(parseAtom(text.value, rel, f.name)) !== expected) {
        skipped += 1;
        continue;
      }
      await rm(abs, { force: true });
      removed += 1;
    }
    try {
      await rmdir(dir);
    } catch {
      /* 非空/占用：保留目录 */
    }
  }
  return { removed, skipped };
};

const report = {
  workspace: ws,
  mode: apply ? "apply" : "dry-run",
  archiveDays: archiveData.dates.length,
  hot: hotData.atoms.length,
  archivedStillHot: plan.eligible.length,
  eligibleBytes: plan.eligible.reduce((n, c) => n + c.size, 0),
  conflicts: plan.conflicts.length,
  notArchived: plan.notArchived.length,
  pinned: plan.pinned.length,
  noHash: plan.noHash.length,
};

if (apply) {
  const moved: Candidate[] = [];
  const errors: Array<{ rel: string; message: string }> = [];
  for (const c of plan.eligible) {
    try {
      await moveOne(c);
      moved.push(c);
    } catch (e) {
      errors.push({ rel: c.rel, message: e instanceof Error ? e.message : String(e) });
    }
  }
  const purged = purgeTrash ? await purge() : { removed: 0, skipped: 0 };
  const out = { ...report, moved: moved.length, purged: purged.removed, purgeSkipped: purged.skipped, errors };
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`[maintenance] applied: moved ${moved.length}, purged ${purged.removed}, purgeSkipped ${purged.skipped}, errors ${errors.length}`);
    for (const e of errors.slice(0, 20)) console.error(`  - ${e.rel}: ${e.message}`);
    if (plan.conflicts.length) console.log(`[maintenance] skipped ${plan.conflicts.length} conflicts (hot/archive hash mismatch)`);
    if (plan.notArchived.length) console.log(`[maintenance] skipped ${plan.notArchived.length} not archived`);
  }
  process.exit(errors.length ? 1 : 0);
}

const out = {
  ...report,
  samples: plan.eligible.slice(0, 20),
  conflicts: plan.conflicts.slice(0, 20),
  notArchived: plan.notArchived.slice(0, 10),
  pinned: plan.pinned.slice(0, 10),
  noHash: plan.noHash.slice(0, 10),
};
if (json) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`[maintenance] dry-run: ${plan.eligible.length} archived hot files (${(report.eligibleBytes / 1024).toFixed(1)} KiB) can move to .trash`);
  console.log(`[maintenance] skipped: conflicts=${plan.conflicts.length} notArchived=${plan.notArchived.length} pinned=${plan.pinned.length} noHash=${plan.noHash.length}`);
  for (const c of plan.eligible.slice(0, 20)) console.log(`  ✓ ${c.rel} (${c.size} B) → .trash/${c.date}/`);
  for (const c of plan.conflicts.slice(0, 10)) console.log(`  ✗ ${c.rel}: ${c.reason}`);
  console.log("[maintenance] dry-run only. Add --apply to move verified files to .trash; add --purge-trash to remove expired trash.");
}
