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

  // 原地改内容：token 默认看不到；full 必须回 fs 并读到新内容
  const changed = { ...seed };
  const target = `${ws}/.shadow/atoms/2026-09-09--100000-src-new.md`;
  changed[target] = `${seed[target]}\n- [11:00:00] [src/new.ts] 用户：changed-content-marker\n`;
  const fs3 = new MemoryFs(changed);
  const tokenLoad = await cache.load(idx.value, fs3, ws, "token");
  if (!tokenLoad.ok) throw new Error(tokenLoad.error.message);
  assert.equal(tokenLoad.value.source, "db", "token 模式只按文件名集合");
  const fullLoad = await cache.load(idx.value, fs3, ws, "full");
  if (!fullLoad.ok) throw new Error(fullLoad.error.message);
  assert.equal(fullLoad.value.source, "fs", "full 模式应发现 size/mtime 变化");
  assert.ok(fullLoad.value.atoms.some((a) => a.body.includes("changed-content-marker")));
} finally {
  cache.closeAll();
  rmSync(ws, { recursive: true, force: true });
}

console.log("✔ index-cache：首次 fs → 第二次 db（parsed JSON）→ 新增文件回 fs 重建");
