import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { defaultLens, lensFromSoul } from "../../dist/engine/project/lens.js";
import { project } from "../../dist/engine/project/project.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

const atoms = [
  mk("2026-09-05--100000-src-alpha.md", {
    entry: "src/alpha.ts", date: "2026-09-05", time: "100000",
    summary: "alpha 入口改成 A", materials: ["src/alpha.ts"], user: "把 alpha 入口改成 A",
  }),
  mk("2026-09-04--090000-src-beta.md", {
    entry: "src/beta.ts", date: "2026-09-04", time: "090000", user: "看看 beta",
  }),
  mk("2026-09-03--120000-secret-x.md", {
    entry: "secret/x.md", date: "2026-09-03", time: "120000", user: "机密材料",
  }),
];

// 1) 默认 lens：全看（但仍是「一个视角」，必须声明整全边界）
const all = project(atoms, defaultLens());
assert.equal(all.included.length, 3, `默认 lens 应纳入全部，实际 ${all.included.length}`);
assert.equal(all.excluded.length, 0);
assert.ok(all.face.includes("alpha"), "面应含 alpha");
assert.ok(all.blindSpots.some((b) => b.includes("不宣称看见整全")), "应声明整全边界");

// 2) 有 lens：只关注 alpha、忽略 secret
const lens = lensFromSoul({
  identity: { name: "tester" },
  observer: { what_matters: ["alpha"], what_to_ignore: ["secret"] },
  boundaries: ["不编造"],
});
assert.equal(lens.id, "tester", `lens.id 应取 identity.name，实际 ${lens.id}`);
assert.deepEqual(lens.whatMatters, ["alpha"]);
const p = project(atoms, lens);
assert.ok(p.included.some((x) => x.entry.includes("alpha")), "alpha 应在面内");
assert.ok(p.excluded.some((x) => x.entry.includes("secret")), "secret 应被排除（what_to_ignore）");
assert.ok(p.excluded.some((x) => x.entry.includes("beta")), "beta 属视野外");
assert.ok(p.distortionNote.includes("视野外"), "应披露视野外点");
assert.ok(p.blindSpots.some((b) => b.includes("不宣称看见整全")), "应披露整全盲区");
assert.equal(p.lensId, "tester");

// 3) 关注点零命中：必须显式披露「这个视角看不到这部分」
const none = project(atoms, lensFromSoul({ observer: { what_matters: ["nonexistent-xyz"] } }));
assert.equal(none.included.length, 0, "零命中应纳入 0 点");
assert.ok(none.blindSpots.some((b) => b.includes("没有任何命中")), "零命中应显式披露");

console.log("✔ project：默认全看 / lens 取景 / 视野外披露 / 零命中盲区 / 整全边界声明");
