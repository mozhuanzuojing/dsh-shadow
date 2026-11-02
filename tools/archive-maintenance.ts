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
import { archivedIndex, digestAtom, loadAllAtoms } from "../dist/store/archive.js";
import { loadAtoms } from "../dist/store/atoms.js";
import { realFs } from "../dist/store/fs.js";
import { pinnedBySource } from "../dist/engine/read/recall.js";

interface Candidate {
  rel: string;
  date: string;
  size: number;
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
const hot = await loadAtoms(realFs, ws);
const hotData = hot.ok ? hot.value : fail(`读取热区失败（${hot.error.code}）：${hot.error.message}`);
if (hotData.errors.length) fail(`热区有 ${hotData.errors.length} 个坏文件；为避免误删，中止`);

const archive = await archivedIndex(realFs, ws);
const archiveData = archive.ok ? archive.value : fail(`读取 archive 索引失败（${archive.error.code}）：${archive.error.message}`);

const pinned = pinnedBySource(allData.atoms);
const plan: Plan = { eligible: [], conflicts: [], notArchived: [], pinned: [], noHash: [] };

for (const a of hotData.atoms) {
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
  if (digestAtom(a) !== expected) {
    plan.conflicts.push({ rel: a.rel, reason: "hot 与 archive 逐条 hash 不一致（可能有未归档修改）" });
    continue;
  }
  const st = await realFs.stat(join(ws, a.rel));
  plan.eligible.push({ rel: a.rel, date: a.date, size: st.ok ? st.value.size : 0 });
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
  try {
    await rename(src, target);
  } catch (e) {
    // Windows 同卷 rename 正常；跨卷兜底 copy+unlink（显式维护 CLI，允许 node:fs）。
    const text = await realFs.readText(src);
    if (!text.ok) throw new Error(text.error.message);
    const w = await realFs.writeText(target, text.value);
    if (!w.ok) throw new Error(w.error.message);
    const d = await realFs.unlink(src);
    if (!d.ok) throw new Error(d.error.message);
  }
};

const purge = async (): Promise<number> => {
  if (!existsSync(trashRoot)) return 0;
  const cutoff = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - keepDays);
  const cut = cutoff.toISOString().slice(0, 10);
  let removed = 0;
  for (const ent of await readdir(trashRoot, { withFileTypes: true })) {
    if (!ent.isDirectory() || !/^\d{4}-\d{2}-\d{2}$/.test(ent.name) || ent.name >= cut) continue;
    const dir = join(trashRoot, ent.name);
    for (const f of await readdir(dir, { withFileTypes: true })) {
      if (!f.isFile()) continue;
      await rm(join(dir, f.name), { force: true });
      removed += 1;
    }
    try {
      await rmdir(dir);
    } catch {
      /* 非空/占用：保留目录 */
    }
  }
  return removed;
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
  const purged = purgeTrash ? await purge() : 0;
  const out = { ...report, moved: moved.length, purged, errors };
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(`[maintenance] applied: moved ${moved.length}, purged ${purged}, errors ${errors.length}`);
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
