import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { conserved, deriveConsciousness, deriveFaces, downToPoints } from "../../dist/domain/dimensions.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

const atoms = [
  mk("2026-09-05--100000-a.md", { entry: "src/a.ts", date: "2026-09-05", time: "100000", agent: "s1", user: "改 a" }),
  mk("2026-09-05--100500-b.md", { entry: "src/b.ts", date: "2026-09-05", time: "100500", agent: "s1", user: "改 b" }),
  mk("2026-09-06--110000-c.md", { entry: "src/c.ts", date: "2026-09-06", time: "110000", agent: "s2", user: "改 c" }),
  mk("2026-09-06--110500-d.md", { entry: "src/d.ts", date: "2026-09-06", time: "110500", agent: "s2", user: "改 d" }),
];

// 升维：面轴=会话 → 2 张面（s1 / s2）
const { lines, faces } = deriveFaces(atoms, "session");
assert.equal(lines.length, 2, `应 2 条线，实际 ${lines.length}`);
assert.equal(faces.length, 2, `会话轴应 2 张面，实际 ${faces.length}`);
assert.equal(faces[0]!.axis, "session");

// 守恒：升维不丢点
assert.equal(conserved(atoms, faces), true, "Σ面内点应 == 0维点");
assert.equal(faces.reduce((n, f) => n + f.points, 0), atoms.length);

// 降维：面 → 点句柄，可解析回 atom rel，且总点数守恒
const relSet = new Set(atoms.map((a) => a.rel));
const down = faces.flatMap((f) => downToPoints(f));
assert.equal(down.length, atoms.length, "降维返回的点应等于原点数");
assert.ok(down.every((r) => relSet.has(r)), "每个降维句柄都应能解析回 atom rel");

// 面轴=日 → 按日期织
const byDay = deriveFaces(atoms, "day").faces;
assert.ok(byDay.length >= 2, `日轴应≥2面，实际 ${byDay.length}`);

// 面轴=task → 词法聚类，仍守恒、axis 标记正确
const byTask = deriveFaces(atoms, "task");
assert.equal(conserved(atoms, byTask.faces), true, "task 轴也应守恒不丢点");
assert.ok(byTask.faces.length >= 1, "task 轴应至少 1 面");
assert.ok(byTask.faces.every((f) => f.axis === "task"), "task 面 axis 应标记为 task");

// 观察意识：收面 + soul
const cs = deriveConsciousness(atoms, faces, "tester");
assert.equal(cs.faces, 2);
assert.equal(cs.points, atoms.length);
assert.equal(cs.soulId, "tester");
assert.ok(cs.blindSpots.length >= 1, "意识必须声明盲区（不宣称看见整全）");

console.log("✔ dimensions：升维(点→线→面→意识) 守恒不丢点 · 降维(面→点句柄)可回点 · 面轴 session/day 生效 · 意识带盲区");
