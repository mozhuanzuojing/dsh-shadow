import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomText } from "../helpers.ts";

// 覆盖 tools/migrate-atoms-to-lines.ts：句柄改线#seq 后，校验必须按 body 匹配（不依赖 rel），dry-run 应通过。
const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-mig-atoms-"));
const atomsDir = join(ws, ".shadow", "atoms");
mkdirSync(atomsDir, { recursive: true });
writeFileSync(
  join(atomsDir, "2026-09-05--100000-a.md"),
  atomText({ entry: "src/a.ts", date: "2026-09-05", time: "100000", agent: "s1", summary: "点一" }),
);
writeFileSync(
  join(atomsDir, "2026-09-05--100500-b.md"),
  atomText({ entry: "src/a.ts", date: "2026-09-05", time: "100500", agent: "s1", summary: "点二" }),
);

try {
  const r = spawnSync(process.execPath, [join(process.cwd(), "tools", "migrate-atoms-to-lines.ts"), `--ws=${ws}`], { encoding: "utf8" });
  assert.equal(r.status, 0, `migrate-atoms 失败：${r.stderr}`);
  assert.ok(r.stdout.includes("atom body 逐字相等 = 2/2"), `应按 body 校验 2/2：${r.stdout}`);
  assert.ok(r.stdout.includes("校验通过"), `dry-run 应通过：${r.stdout}`);
} finally {
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ migrate-atoms：句柄线#seq 后仍按 body 校验通过（不依赖 rel）");
