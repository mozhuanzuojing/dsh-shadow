import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { buildLineFiles, loadAtomsFromLines, loadLines, materializeLines, unionByRel } from "../../dist/engine/lines.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

const atoms = [
  mk("2026-09-05--100000-a.md", { entry: "src/a.ts", date: "2026-09-05", time: "100000", agent: "s1", summary: "点一" }),
  mk("2026-09-05--100500-b.md", { entry: "src/a.ts", date: "2026-09-05", time: "100500", agent: "s1", summary: "点二" }),
  mk("2026-09-05--110000-c.md", { entry: "src/b.ts", date: "2026-09-05", time: "110000", agent: "s2", summary: "点三" }),
];

// 建线：s1+src/a.ts 两点归一条线；s2+src/b.ts 另一条 → 2 条线、装 3 点（不再一句话一文件）
const built = buildLineFiles(atoms, 60);
assert.equal(built.length, 2, `应 2 条线，实际 ${built.length}`);
assert.equal(built.reduce((n, l) => n + l.points, 0), atoms.length, "Σ线内点应 == 原点数（升维不丢点）");
const s1Line = built.find((l) => l.rel.includes("src-a-ts"))!;
assert.ok(s1Line, "应存在 s1/src-a.ts 的线文件");
assert.ok(s1Line.text.includes("点#1") && s1Line.text.includes("点#2"), "一条线文件应装两点");
assert.ok(s1Line.text.includes("{{rel=.shadow/lines/"), "点必须带 线#seq 句柄");

// 物化到 MemoryFs + 回读
const fs = new MemoryFs();
const m = await materializeLines(fs, "/ws", atoms, undefined, 60);
assert.equal(m.lines, 2);
assert.equal(m.errors, 0);
const back = await loadLines(fs, "/ws");
assert.equal(back.length, 2, "回读应得 2 条线");
const totalPts = back.reduce((n, l) => n + l.points.length, 0);
assert.equal(totalPts, atoms.length, "回读点数应守恒");
assert.ok(back.flatMap((l) => l.points).every((p) => p.rel.includes("/lines/")), "回读的点句柄应为线#seq");

// 幂等：再物化不重写（written=0）
const m2 = await materializeLines(fs, "/ws", atoms, undefined, 60);
assert.equal(m2.written, 0, "内容不变应幂等不重写");

// 从线无损重建：这是"删热 atom、以线为源"的验收前提
const rec = await loadAtomsFromLines(fs, "/ws");
assert.equal(rec.errors.length, 0, `重建不应有错误：${rec.errors.join("；")}`);
assert.equal(rec.atoms.length, atoms.length, "重建点数应守恒");
const origByBody = new Map(atoms.map((a) => [a.body, a]));
for (const a of rec.atoms) {
  const o = origByBody.get(a.body);
  assert.ok(o, "重建点的 body 应能对应原 atom");
  assert.equal(a.date, o!.date, "重建 date 应正确（从 when() 补回）");
  assert.equal(a.time, o!.time, "重建 time 应正确（从 when() 补回）");
  assert.equal(a.decisions.length, o!.decisions.length, "重建 decisions 数应一致");
  assert.equal(a.userMessages.length, o!.userMessages.length, "重建 userMessages 数应一致");
}

// 并集按 rel 去重（同 rel 不重复；不再按正文去重，避免误删同文不同点）
const u = unionByRel([rec.atoms[0]!], rec.atoms);
assert.equal(u.length, rec.atoms.length, "并集按 rel 去重");

console.log("✔ lines-materialize：点→线物化（一文件多点）· Σ线内点守恒 · 点带 rel 句柄 · 回读可解析 · 幂等");

// 同名覆盖防护：同 session/entry/日、但间隔 > gap → 必须切成不同线文件（不得同名）
const splitAtoms = [
  mk("2026-09-05--100000-x.md", { entry: "src/a.ts", date: "2026-09-05", time: "100000", agent: "s9" }),
  mk("2026-09-05--130000-y.md", { entry: "src/a.ts", date: "2026-09-05", time: "130000", agent: "s9" }),
];
const sb = buildLineFiles(splitAtoms, 60);
assert.equal(sb.length, 2, "间隔>gap 应切 2 条线");
assert.notEqual(sb[0]!.rel, sb[1]!.rel, "两条线 rel 必须不同（否则同名覆盖丢点）");
console.log("✔ lines-materialize：同 session/entry/日 跨 gap 的多段线 rel 唯一（不覆盖）");
