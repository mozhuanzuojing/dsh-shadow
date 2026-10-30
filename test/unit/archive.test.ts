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
assert.match(loaded.value[0]!.archiveRel ?? "", /^\.shadow\/archive\/2026-10-29\.jsonl#/, "归档 atom 必须带 archiveRel 句柄");

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
assert.equal(await delFs.exists(`${WS}/.shadow/.trash/2026-10-29/2026-10-29--100000-a--aaaaaa.md`), true, "删热文件先进 .trash");

// .trash 保留期：过期日期目录被清理
const trashFs = new MemoryFs({
  [`${WS}/.shadow/.trash/2026-10-01/old.md`]: "old trash",
  [`${WS}/.shadow/atoms/2026-10-29--100000-a--aaaaaa.md`]: "a",
});
const trashRun = await archiveDays(trashFs, WS, [old1], "2026-10-30", { now: 1000, deleteHot: true, keepTrashDays: 7 });
assert.equal(trashRun.errors.length, 0);
assert.equal(trashRun.purged, 1, "超过 7 天的 .trash 应清理");
assert.equal(await trashFs.exists(`${WS}/.shadow/.trash/2026-10-01/old.md`), false);
assert.equal(await trashFs.exists(`${WS}/.shadow/.trash/2026-10-29/2026-10-29--100000-a--aaaaaa.md`), true, "未过期的 trash 保留");
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

// 迟到 atom：archive 只有 A，同日新增 B；必须把 B 也归档后再删，不能只删不进档
const lateFs = new MemoryFs({
  [`${WS}/.shadow/atoms/2026-10-29--100000-a--aaaaaa.md`]: "a",
});
await archiveDays(lateFs, WS, [old1], "2026-10-30", { now: 1000, deleteHot: true });
const late = atom("2026-10-29", "100001", ".shadow/atoms/2026-10-29--100001-b--bbbbbb.md", "late b", "bbbbbb");
const lateRun = await archiveDays(lateFs, WS, [old1, late], "2026-10-30", { now: 2000, deleteHot: true });
assert.equal(lateRun.errors.length, 0);
const lateArchive = await readArchivedAtoms(lateFs, WS, "2026-10-29");
assert.equal(lateArchive.ok, true);
if (!lateArchive.ok) throw new Error("late archive missing");
assert.equal(lateArchive.value.length, 2, "迟到 atom 必须先进入 archive");
assert.ok(lateArchive.value.some((a) => a.rel === late.rel));

// 同 rel/uid 内容变化：archive 必须改写成新内容后再删热文件
const changeFs = new MemoryFs({ [`${WS}/.shadow/atoms/2026-10-29--100000-a--aaaaaa.md`]: "old" });
await archiveDays(changeFs, WS, [old1], "2026-10-30", { now: 1000, deleteHot: true });
const changed = { ...old1, body: "changed body" };
const changeRun = await archiveDays(changeFs, WS, [changed], "2026-10-30", { now: 2000, deleteHot: true });
assert.equal(changeRun.errors.length, 0);
const changedArchive = await readArchivedAtoms(changeFs, WS, "2026-10-29");
assert.equal(changedArchive.ok, true);
if (!changedArchive.ok) throw new Error("changed archive missing");
assert.equal(changedArchive.value[0]!.body, "changed body", "archive 必须写新内容，不能删新热文件留旧 archive");

// 热/归档同 rel：重建时热文件优先
const precedenceFs = new MemoryFs({ [`${WS}/.shadow/atoms/2026-10-29--100000-a--aaaaaa.md`]: "hot-new" });
await archiveDays(precedenceFs, WS, [old1], "2026-10-30", { now: 1000 });
const rebuiltPriority = await loadAllAtoms(precedenceFs, WS);
assert.equal(rebuiltPriority.ok, true);
if (!rebuiltPriority.ok) throw new Error("loadAllAtoms failed");
const hotAtom = rebuiltPriority.value.atoms.find((a) => a.rel === old1.rel);
assert.equal(hotAtom?.body, "hot-new", "热文件必须优先于 archive");

// pinned：可以归档，但不删热文件
const pinFs = new MemoryFs({
  [`${WS}/.shadow/atoms/2026-10-29--100000-a--aaaaaa.md`]: "a",
  [`${WS}/.shadow/atoms/2026-10-29--100001-b--bbbbbb.md`]: "b",
});
const pinRun = await archiveDays(pinFs, WS, [old1, old2], "2026-10-30", {
  now: 1000,
  deleteHot: true,
  pinned: new Set([old1.rel]),
});
assert.equal(pinRun.errors.length, 0);
assert.equal(await pinFs.exists(`${WS}/${old1.rel}`), true, "pinned 热文件不能删");
assert.equal(await pinFs.exists(`${WS}/${old2.rel}`), false, "非 pinned 热文件应删");

// 坏归档：部分可用，不能阻断全部 atoms
const badArchiveFs = new MemoryFs({
  [`${WS}/.shadow/atoms/2026-10-30--090000-c--cccccc.md`]: "today",
  [`${WS}/.shadow/archive/2026-10-29.jsonl`]: "broken\n",
});
const partial = await loadAllAtoms(badArchiveFs, WS);
assert.equal(partial.ok, true, "坏归档应返回部分结果");
if (!partial.ok) throw new Error("partial load failed");
assert.equal(partial.value.atoms.length, 1, "热文件仍可读");
assert.equal(partial.value.errors.length, 1, "坏归档必须可见");

console.log("✔ archive：按日 JSONL+MD+manifest；幂等；锁占用可见；坏 JSONL 重写；today 不归档；deleteHot 后热文件删除且可重建；重复删除不报错；迟到/内容变化/pinned/坏归档部分可用");
