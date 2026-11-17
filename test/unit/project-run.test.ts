import assert from "node:assert/strict";
import { MemoryFs } from "../../dist/store/fs.js";
import { runProject } from "../../dist/engine/project/run.js";
import { parseAtom } from "../../dist/domain/parse.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

const atoms = [
  mk("2026-09-05--100000-src-alpha.md", { entry: "src/alpha.ts", date: "2026-09-05", time: "100000", user: "改 alpha" }),
  mk("2026-09-04--090000-src-beta.md", { entry: "src/beta.ts", date: "2026-09-04", time: "090000", user: "看看 beta" }),
];

// 1) 无 soul：退回默认视角，且可见地说明「未配置」（不是静默当作有灵魂）
const r1 = await runProject({ fs: new MemoryFs({}), ws: "/ws" }, { topic: "alpha" }, atoms);
assert.equal(r1.degraded, true, "无 soul 应标记降级");
assert.equal(r1.lens.id, "default");
assert.ok(r1.soulNote.includes("未配置"), "缺 soul 必须可见说明，不能静默");
assert.ok(r1.projection.face.includes("面（Projection"), "应产出面");

// 2) 好 soul：lens 来自 soul，非降级
const d2 = new MemoryFs({
  "/ws/.shadow/soul/soul.json": JSON.stringify({ identity: { name: "tester" }, observer: { what_matters: ["alpha"], what_to_ignore: ["beta"] } }),
});
const r2 = await runProject({ fs: d2, ws: "/ws" }, {}, atoms);
assert.equal(r2.degraded, false, "有合法 soul 不应降级");
assert.equal(r2.lens.id, "tester");
assert.deepEqual(r2.lens.whatMatters, ["alpha"]);
assert.ok(r2.projection.excluded.some((p) => p.entry.includes("beta")), "what_to_ignore 应让 beta 被排除");

// 3) 坏 soul：解析失败 → 退回默认视角，且降级可见（不静默吞错）
const d3 = new MemoryFs({ "/ws/.shadow/soul/soul.json": "{ not valid json" });
const r3 = await runProject({ fs: d3, ws: "/ws" }, {}, atoms);
assert.equal(r3.degraded, true, "坏 soul 应标记降级");
assert.equal(r3.lens.id, "default");
assert.ok(r3.soulNote.includes("解析失败"), "坏 soul 必须可见说明，不静默吞错");

console.log("✔ runProject：无 soul / 好 soul / 坏 soul 三态降级均可见 · lens→projection 贯通");
