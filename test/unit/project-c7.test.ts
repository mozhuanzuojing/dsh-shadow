/**
 * C7 验收夹具（契约先行，见 ADR-0024 的 C7「投影忠实度与盲区披露」）。
 *
 * C7 要求：任何投影 MUST 声明「纳入了什么、排除了什么、为什么」；缺失与盲区 MUST 可见；
 * 零命中不得编造。本测试把这几条落成可重放的断言——在投影核层面先立契约，再接读路径。
 */
import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { lensFromSoul } from "../../dist/engine/project/lens.js";
import { project } from "../../dist/engine/project/project.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

const atoms = [
  mk("2026-09-05--100000-src-alpha.md", {
    entry: "src/alpha.ts", date: "2026-09-05", time: "100000",
    summary: "alpha 入口改成 A", materials: ["src/alpha.ts"],
    decisions: [{ text: "采用方案 A", source: "user" }], user: "把 alpha 改成 A",
  }),
  mk("2026-09-04--090000-src-beta.md", {
    entry: "src/beta.ts", date: "2026-09-04", time: "090000", user: "看看 beta",
  }),
  mk("2026-09-03--120000-secret-x.md", {
    entry: "secret/x.md", date: "2026-09-03", time: "120000", user: "机密",
  }),
];

const p = project(atoms, lensFromSoul({ identity: { name: "tester" }, observer: { what_matters: ["alpha"], what_to_ignore: ["secret"] } }));

// C7.1 盲区永远显式（哪怕纳入很多）：不得出现「无 blindSpot」的投影。
assert.ok(p.blindSpots.length >= 1, "C7：投影必须至少声明一条盲区/整全边界");
assert.ok(p.distortionNote.includes("视野外"), "C7：剔除项必须以「视野外 N 点」披露");
assert.ok(p.blindSpots.some((b) => b.includes("不宣称看见整全")), "C7：必须声明「不宣称看见整全」");

// C7.2 纳入/排除互斥且都带证据句柄（rel）。
assert.ok(p.included.length > 0 && p.excluded.length > 0, "C7：本夹具应同时有纳入与排除");
assert.ok(
  p.excluded.every((e) => !p.included.some((i) => i.rel === e.rel)),
  "C7：一个点不能同时又纳入又排除",
);
for (const pt of [...p.included, ...p.excluded]) {
  assert.ok(pt.rel && pt.entry, `C7：每个点都必须带证据句柄 rel/entry，坏点=${JSON.stringify(pt)}`);
}

// C7.3 排除项不得出现在「面」正文里（不把视野外的东西编进面）。
assert.ok(!p.face.includes("src/beta.ts"), "C7：视野外的 beta 不得出现在面正文");
assert.ok(!p.face.includes("secret/x.md"), "C7：被忽略的 secret 不得出现在面正文");

// C7.4 零命中：必须诚实说「看不到这部分」，且绝不编造内容。
const zero = project(atoms, lensFromSoul({ observer: { what_matters: ["zzz-不存在"] } }));
assert.equal(zero.included.length, 0, "C7：零命中应纳入 0 点");
assert.ok(zero.blindSpots.some((b) => b.includes("没有任何命中")), "C7：零命中必须显式披露，不得静默空成功");
assert.ok(!zero.face.includes("src/alpha.ts"), "C7：零命中时面里不得凭空出现任何点（不编造）");

console.log("✔ C7：纳入/排除/盲区披露 · 零命中不编造 · 证据句柄齐全 · 不宣称看见整全");
