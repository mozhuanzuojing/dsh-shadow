import assert from "node:assert/strict";
import { MemoryFs } from "../../dist/store/fs.js";
import { archiveDays, archivedIndex, loadAllAtoms, readArchivedAtoms } from "../../dist/store/archive.js";
import type { ParsedAtom } from "../../dist/contract/types.js";

const WS = "/ws";
const atom = (date: string, time: string, rel: string, body: string, uid: string): ParsedAtom => ({
  rel,
  name: rel.split("/").pop()!,
  date,
  time,
  slug: "s",
  uid,
  entry: "src/a.ts",
  project: "p",
  agent: "a",
  goal: "g",
  summary: `summary ${date}`,
  axes: { locus: "", when: "", soul: "", role: "", intent: "" },
  materials: [],
  decisions: [],
  decisionEvents: [],
  userMessages: [],
  actions: [],
  thinkLines: [],
  body,
  kind: "memory",
});

const old1 = atom("2026-10-29", "100000", ".shadow/atoms/2026-10-29--100000-a--aaaaaa.md", "old a", "aaaaaa");
const old2 = atom("2026-10-29", "100001", ".shadow/atoms/2026-10-29--100001-b--bbbbbb.md", "old b", "bbbbbb");
const today = atom("2026-10-30", "090000", ".shadow/atoms/2026-10-30--090000-c--cccccc.md", "today c", "cccccc");

const fs = new MemoryFs();
const first = await archiveDays(fs, WS, [old1, old2, today], "2026-10-30", { now: 1000 });
assert.equal(first.errors.length, 0);
assert.deepEqual(first.archived.map((x) => x.date), ["2026-10-29"]);
assert.deepEqual(first.skipped, []);
assert.equal(first.archived[0]!.count, 2);

const jsonl = await fs.readText(`${WS}/.shadow/archive/2026-10-29.jsonl`);
assert.equal(jsonl.ok, true);
if (!jsonl.ok) throw new Error("missing archive");
assert.equal(jsonl.value.trim().split("\n").length, 2);
assert.match(jsonl.value, /old a/);
assert.match(jsonl.value, /old b/);
assert.doesNotMatch(jsonl.value, /today c/);

const md = await fs.readText(`${WS}/.shadow/archive/2026-10-29.md`);
assert.equal(md.ok, true);
if (!md.ok) throw new Error("missing digest");
assert.match(md.value, /完整原文/);
assert.match(md.value, /2026-10-29\.jsonl/);

const manifest = await fs.readText(`${WS}/.shadow/archive/_index.json`);
assert.equal(manifest.ok, true);
if (!manifest.ok) throw new Error("missing manifest");
const parsedManifest = JSON.parse(manifest.value) as { days: Record<string, { count: number }> };
assert.equal(parsedManifest.days["2026-10-29"]!.count, 2);

const loaded = await readArchivedAtoms(fs, WS, "2026-10-29");
assert.equal(loaded.ok, true);
if (!loaded.ok) throw new Error("read archive failed");
assert.equal(loaded.value.length, 2);
assert.equal(loaded.value[0]!.body, "old a");

// 幂等：manifest 命中后不重写
const second = await archiveDays(fs, WS, [old1, old2, today], "2026-10-30", { now: 2000 });
assert.deepEqual(second.archived, []);
assert.deepEqual(second.skipped, ["2026-10-29"]);

// 锁被占用：不写、不报成功
const locked = new MemoryFs({ [`${WS}/.shadow/.archive.lock`]: JSON.stringify({ at: 5000 }) });
const busy = await archiveDays(locked, WS, [old1], "2026-10-30", { now: 6000 });
assert.equal(busy.archived.length, 0);
assert.equal(busy.errors.length > 0, true, "锁被占用必须可见");
assert.equal(await locked.exists(`${WS}/.shadow/archive/2026-10-29.jsonl`), false);

// 已有坏 JSONL 且无 manifest：重写并校验通过
const corrupt = new MemoryFs({ [`${WS}/.shadow/archive/2026-10-29.jsonl`]: "not-json\n" });
const fixed = await archiveDays(corrupt, WS, [old1], "2026-10-30", { now: 1000 });
assert.equal(fixed.errors.length, 0);
const fixedJsonl = await corrupt.readText(`${WS}/.shadow/archive/2026-10-29.jsonl`);
assert.equal(fixedJsonl.ok, true);
if (!fixedJsonl.ok) throw new Error("fixed archive missing");
assert.match(fixedJsonl.value, /old a/);

// deleteHot：归档+manifest 校验通过后删热文件；today 保留；可从 archive 重建
const delFs = new MemoryFs({
  [`${WS}/.shadow/atoms/2026-10-29--100000-a--aaaaaa.md`]: "old a file",
  [`${WS}/.shadow/atoms/2026-10-29--100001-b--bbbbbb.md`]: "old b file",
  [`${WS}/.shadow/atoms/2026-10-30--090000-c--cccccc.md`]: "today c file",
});
const del = await archiveDays(delFs, WS, [old1, old2, today], "2026-10-30", { now: 1000, deleteHot: true });
assert.equal(del.errors.length, 0);
assert.equal(del.deleted, 2);
assert.equal(await delFs.exists(`${WS}/.shadow/atoms/2026-10-29--100000-a--aaaaaa.md`), false);
assert.equal(await delFs.exists(`${WS}/.shadow/atoms/2026-10-29--100001-b--bbbbbb.md`), false);
assert.equal(await delFs.exists(`${WS}/.shadow/atoms/2026-10-30--090000-c--cccccc.md`), true, "today 热文件必须保留");
const rebuilt = await loadAllAtoms(delFs, WS);
assert.equal(rebuilt.ok, true);
if (!rebuilt.ok) throw new Error("loadAllAtoms failed");
assert.equal(rebuilt.value.atoms.length, 3, "热 + 归档必须能重建全部 atoms");
const idx = await archivedIndex(delFs, WS);
assert.equal(idx.ok, true);
if (!idx.ok) throw new Error("archivedIndex failed");
assert.equal(idx.value.rels.size, 2);

// 第二次 deleteHot：热文件已不存在，不应误报
const again = await archiveDays(delFs, WS, [old1, old2, today], "2026-10-30", { now: 2000, deleteHot: true });
assert.equal(again.errors.length, 0);
assert.equal(again.deleted, 0);
assert.deepEqual(again.skipped, ["2026-10-29"]);

console.log("✔ archive：按日 JSONL+MD+manifest；幂等；锁占用可见；坏 JSONL 重写；today 不归档；deleteHot 后热文件删除且可重建；重复删除不报错");
