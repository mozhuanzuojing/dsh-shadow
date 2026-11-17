/**
 * dsh-shadow —— 显式迁移：atoms(点文件) → lines(线，完整可回放为源)。
 *
 * 默认 dry-run：读全量 atom → 建线写到 .shadow/lines → 从线无损重建 → 逐条 hash 比对；
 * 只有 `--apply` 且**校验全过**才把热 atom 移入 .shadow/.trash/<ts>（不裸删，可回退）。
 *
 * 用法（在 dsh-shadow 目录）：
 *   node tools/migrate-atoms-to-lines.ts                 # dry-run + 校验
 *   node tools/migrate-atoms-to-lines.ts --apply         # 校验通过后移入 trash
 *   node tools/migrate-atoms-to-lines.ts --ws=D:/project/dsh1
 */

import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { realFs } from "../dist/store/fs.js";
import { parseAtom } from "../dist/domain/parse.js";
import { buildLineFiles, loadAtomsFromLines } from "../dist/engine/lines.js";
import type { ParsedAtom } from "../dist/contract/types.js";

const sha = (s: string): string => createHash("sha256").update(String(s), "utf8").digest("hex");
const argOf = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const apply = process.argv.includes("--apply");
const WS = resolve(argOf("ws") ?? join(process.cwd(), ".."));
const ATOMS = `${WS}/.shadow/atoms`;

const main = async (): Promise<void> => {
  const ls = await realFs.listDir(ATOMS);
  if (!ls.ok) {
    console.log(`[migrate] 无 atoms 目录（${ls.error.code}）：${ATOMS} — 无需迁移。`);
    return;
  }
  const files = ls.value.filter((e) => e.type === "file" && e.name.endsWith(".md")).map((e) => e.name);
  const atoms: ParsedAtom[] = [];
  const readErr: string[] = [];
  for (const f of files) {
    const r = await realFs.readText(`${ATOMS}/${f}`);
    if (!r.ok) { readErr.push(f); continue; }
    atoms.push(parseAtom(r.value, `.shadow/atoms/${f}`, f));
  }
  console.log(`[migrate] ws = ${WS}`);
  console.log(`[migrate] 读 atoms = ${atoms.length}${readErr.length ? ` · 读失败 ${readErr.length}` : ""}`);

  const built = buildLineFiles(atoms, 60);
  for (const L of built) {
    const w = await realFs.writeText(`${WS}/${L.rel}`, L.text);
    if (!w.ok) throw new Error(`写线失败 ${L.rel}: ${w.error.message}`);
  }
  console.log(`[migrate] 写线 = ${built.length} 条 · 线内点合计 = ${built.reduce((n, l) => n + l.points, 0)}`);

  const rec = await loadAtomsFromLines(realFs, WS);
  const bodySet = new Set(rec.atoms.map((a) => sha(a.body)));
  let equal = 0;
  const missing: string[] = [];
  for (const a of atoms) {
    if (bodySet.has(sha(a.body))) equal++;
    else missing.push(a.rel);
  }
  const extras = Math.max(0, rec.atoms.length - equal); // 既有线点（非本次 atom）不算失败
  console.log(`[migrate] 从线重建 = ${rec.atoms.length} · atom body 逐字相等 = ${equal}/${atoms.length} · 缺失/不等 = ${missing.length} · 既有线点(额外) = ${extras} · 重建错误 = ${rec.errors.length}`);

  const verified = rec.errors.length === 0 && equal === atoms.length;
  if (!verified) {
    console.log("[migrate] ❌ 校验未通过，拒绝移动任何 atom。");
    process.exitCode = 1;
    return;
  }
  if (!apply) {
    console.log(`[migrate] ✅ 校验通过（dry-run）。加 --apply 才会把 ${atoms.length} 个热 atom 移入 .shadow/.trash。`);
    return;
  }
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const trash = `${WS}/.shadow/.trash/atoms-migrated-${ts}`;
  const mk = await realFs.mkdirp(trash);
  if (!mk.ok) throw new Error("建 trash 目录失败");
  let moved = 0;
  for (const f of files) {
    const r = await realFs.rename(`${ATOMS}/${f}`, `${trash}/${f}`);
    if (r.ok) moved++;
  }
  console.log(`[migrate] ✅ 校验通过，已把 ${moved}/${files.length} 个热 atom 移入：${trash}`);
  console.log(`[migrate] 回退：把该目录里的 *.md 移回 .shadow/atoms 即可；.shadow/lines 可整份重建。`);
};

main().catch((e) => {
  console.error(`[migrate] 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
