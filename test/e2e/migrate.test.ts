import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const fixture = join(process.cwd(), "fixtures", "oracle-v1", "corpus");
const tool = join(process.cwd(), "tools", "migrate-v1.ts");
const src = mkdtempSync(join(tmpdir(), "dsh-shadow-migrate-src-"));
const dst = mkdtempSync(join(tmpdir(), "dsh-shadow-migrate-dst-"));

const run = (args: string[]): any => {
  const r = spawnSync(process.execPath, [tool, ...args], { encoding: "utf8" });
  assert.equal(r.status, 0, `migrate 失败：${r.stderr}`);
  return JSON.parse(r.stdout);
};

try {
  cpSync(fixture, src, { recursive: true });
  // 造旧日期树 + 派生件，验证“不读不删不迁”
  mkdirSync(join(src, ".shadow", "2026-08-01"), { recursive: true });
  writeFileSync(join(src, ".shadow", "2026-08-01", "old.md"), "# old\n");
  mkdirSync(join(src, ".shadow", "indexes"), { recursive: true });
  writeFileSync(join(src, ".shadow", "indexes", "index.sqlite"), "old");

  const dry = run(["--from", src, "--dry-run"]);
  assert.equal(dry.atoms, 30);
  assert.equal(dry.parse_failures, 0);
  assert.equal(dry.legacy_date_files, 1);
  assert.equal(dry.meta_present, true);

  const copied = run(["--from", src, "--to", dst, "--apply"]);
  assert.equal(copied.atoms, 30);
  assert.equal(readdirSync(join(dst, ".shadow", "atoms")).filter((n) => n.endsWith(".md")).length, 30);
  assert.ok(existsSync(join(dst, ".shadow", "_meta.json")), "legacy _meta 应复制");
  assert.ok(!existsSync(join(dst, ".shadow", "2026-08-01")), "旧日期树不应复制");

  const before = readdirSync(join(src, ".shadow", "atoms")).sort();
  const inPlace = run(["--from", src, "--in-place"]);
  assert.equal(inPlace.mode, "in-place");
  assert.ok(readdirSync(join(src, ".shadow")).some((n) => n.startsWith("backup-")), "in-place 应建备份");
  assert.deepEqual(readdirSync(join(src, ".shadow", "atoms")).sort(), before, "atoms 不得改写/删除");
  assert.ok(existsSync(join(src, ".shadow", "2026-08-01", "old.md")), "旧日期树不得删除");
} finally {
  rmSync(src, { recursive: true, force: true });
  rmSync(dst, { recursive: true, force: true });
}

console.log("✔ migrate：dry-run 计数、copy atoms/meta、in-place 备份且不改 atoms/旧树");
