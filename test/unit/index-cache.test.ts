import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IndexCache } from "../../dist/store/index-cache.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { atomText } from "../helpers.ts";

const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-index-"));
const seed: Record<string, string> = {};
for (let i = 0; i < 5; i++) {
  const name = `2026-09-0${i + 1}--100000-src-alpha-${i}.md`;
  seed[`${ws}/.shadow/atoms/${name}`] = atomText({ entry: `src/alpha-${i}.ts`, date: `2026-09-0${i + 1}` });
}
const fs = new MemoryFs(seed);
const cache = new IndexCache();
try {
  const idx = await cache.get(fs, ws);
  if (!idx.ok) throw new Error(idx.error.message);
  const first = await cache.load(idx.value, fs, ws);
  if (!first.ok) throw new Error(first.error.message);
  assert.equal(first.value.source, "fs");
  assert.equal(first.value.atoms.length, 5);

  const second = await cache.load(idx.value, fs, ws);
  if (!second.ok) throw new Error(second.error.message);
  assert.equal(second.value.source, "db", "第二次应走 SQLite parsed JSON");
  assert.deepEqual(second.value.atoms.map((a) => a.rel).sort(), first.value.atoms.map((a) => a.rel).sort());

  // 新增一个 atom：文件名集合变化 ⇒ 回 fs 并重建
  seed[`${ws}/.shadow/atoms/2026-09-09--100000-src-new.md`] = atomText({ entry: "src/new.ts", date: "2026-09-09" });
  const fs2 = new MemoryFs(seed);
  const third = await cache.load(idx.value, fs2, ws);
  if (!third.ok) throw new Error(third.error.message);
  assert.equal(third.value.source, "fs");
  assert.equal(third.value.atoms.length, 6);
} finally {
  cache.closeAll();
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ index-cache：首次 fs → 第二次 db（parsed JSON）→ 新增文件回 fs 重建");
