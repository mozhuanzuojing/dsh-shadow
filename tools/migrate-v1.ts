/**
 * v2 ops — v1 → v2 迁移（默认只读演练）。
 *
 *   node tools/migrate-v1.ts --from <ws> --to <ws> [--in-place] [--dry-run] [--report <path>]
 *
 * 硬规则：不删除任何 atom / 旧日期树 / v1 mode 存储；`--in-place` 只备份派生件。
 * atoms 原样复制（v1 旧名可读），v2 启动后自行重建 SQLite。
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseAtom } from "../dist/domain/parse.js";
import { isAtomName } from "../dist/contract/paths.js";

interface Args {
  from: string;
  to: string;
  inPlace: boolean;
  dryRun: boolean;
  report?: string;
}

const parseArgs = (argv: string[]): Args => {
  const get = (name: string, fallback?: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const from = get("--from");
  if (!from) throw new Error("缺 --from <workspace>");
  const to = get("--to", from)!;
  return {
    from,
    to,
    inPlace: argv.includes("--in-place"),
    // 默认只读演练；copy 模式必须显式 --apply，in-place 本身即执行动作
    dryRun: argv.includes("--dry-run") || (!argv.includes("--in-place") && !argv.includes("--apply")),
    report: get("--report"),
  };
};

const sha256 = (p: string): string => createHash("sha256").update(readFileSync(p)).digest("hex");

const walk = (dir: string): string[] => {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
};

const atomFiles = (ws: string): string[] => {
  const dir = join(ws, ".shadow", "atoms");
  if (!existsSync(dir)) return [];
  return walk(dir).filter((p) => isAtomName(p.replace(/\\/g, "/").split("/").pop() ?? ""));
};

const main = (): void => {
  const args = parseArgs(process.argv.slice(2));
  const atoms = atomFiles(args.from);
  let parseFailures = 0;
  const hashes: Record<string, string> = {};
  for (const p of atoms) {
    const name = p.replace(/\\/g, "/").split("/").pop()!;
    const rel = p.replace(/\\/g, "/").split("/.shadow/atoms/")[1] ?? name;
    const text = readFileSync(p, "utf8");
    hashes[`.shadow/atoms/${rel}`] = sha256(p);
    try {
      const a = parseAtom(text, `.shadow/atoms/${rel}`, name);
      if (!a.date) parseFailures++;
    } catch {
      parseFailures++;
    }
  }

  const shadowDir = join(args.from, ".shadow");
  const shadowDirs = existsSync(shadowDir)
    ? readdirSync(shadowDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : [];
  const known = new Set(["atoms", "indexes", "audit", "soul", "taste", "resources", "query-log", "observation", "roles", "affaires"]);
  const modeRoots = shadowDirs.filter((d) => !known.has(d) && !/^\d{4}-\d{2}-\d{2}$/.test(d));
  let legacyDateFiles = 0;
  for (const d of shadowDirs.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))) legacyDateFiles += walk(join(shadowDir, d)).length;

  const report = {
    from: args.from,
    to: args.to,
    mode: args.inPlace ? "in-place" : "copy",
    dry_run: args.dryRun,
    atoms: atoms.length,
    parse_failures: parseFailures,
    legacy_date_files: legacyDateFiles,
    mode_roots: modeRoots,
    meta_present: existsSync(join(shadowDir, "_meta.json")),
    hashes,
  };

  if (!args.dryRun && args.inPlace) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backup = join(shadowDir, `backup-${stamp}`);
    mkdirSync(backup, { recursive: true });
    const idx = join(shadowDir, "indexes");
    if (existsSync(idx)) renameSync(idx, join(backup, "indexes"));
    const meta = join(shadowDir, "_meta.json");
    if (existsSync(meta)) cpSync(meta, join(backup, "_meta.json"));
    // 旧日期树 / mode 根 / atoms 一律不动
  } else if (!args.dryRun && args.to !== args.from) {
    for (const p of atoms) {
      const rel = p.replace(/\\/g, "/").split("/.shadow/atoms/")[1]!;
      const dest = join(args.to, ".shadow", "atoms", rel);
      mkdirSync(join(args.to, ".shadow", "atoms"), { recursive: true });
      if (!existsSync(dest)) cpSync(p, dest);
    }
    // curated source + v1 legacy meta（一次性导入用）
    for (const rel of ["soul", "taste", "resources", "_meta.json"]) {
      const src = join(shadowDir, rel);
      if (!existsSync(src)) continue;
      const dst = join(args.to, ".shadow", rel);
      if (!existsSync(dst)) cpSync(src, dst, { recursive: true });
    }
  }

  const out = JSON.stringify(report, null, 2);
  if (args.report) {
    mkdirSync(dirname(args.report), { recursive: true });
    writeFileSync(args.report, out);
  }
  console.log(out);
  if (parseFailures > 0) {
    console.error(`[migrate] ${parseFailures} 个 atom 解析失败；未删除/未改写任何文件。`);
    process.exitCode = 1;
  }
};

main();
