import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { downToPoints } from "../../dist/domain/dimensions.js";
import { filterFacesByLens, renderUserSummary, splitScopeHandle, userScope } from "../../dist/domain/scope.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

// 两个工作区，故意用同名文件（rel 相同）——打标后不得冲突
const wsA = "/proj/a";
const wsB = "/proj/b";
const A = { ws: wsA, atoms: [
  mk("x.md", { entry: "src/a.ts", date: "2026-09-05", time: "100000", agent: "sa", user: "改 a" }),
  mk("y.md", { entry: "src/a2.ts", date: "2026-09-05", time: "100500", agent: "sa", user: "改 a2" }),
] };
const B = { ws: wsB, atoms: [
  mk("x.md", { entry: "src/b.ts", date: "2026-09-06", time: "110000", agent: "sb", user: "改 b" }),
  mk("z.md", { entry: "src/b2.ts", date: "2026-09-06", time: "110500", agent: "sb", user: "改 b2" }),
] };

const u = userScope([A, B], "session");
assert.equal(u.points, 4, `user 层点数应为 4，实际 ${u.points}`);
assert.equal(u.consciousness.points, 4);
const sum = u.faces.reduce((n, f) => n + f.points, 0);
assert.equal(sum, 4, "守恒：Σ user 面内点 == 全部点（升维不丢点）");

// 降维句柄带 workspace 定位，且同名 rel 不冲突
const handles = u.faces.flatMap((f) => downToPoints(f));
assert.equal(handles.length, 4, "降维应回到 4 个点");
const seen = new Set<string>();
for (const h of handles) {
  const { ws, rel } = splitScopeHandle(h);
  assert.ok(ws === wsA || ws === wsB, `句柄应带正确 workspace：${h}`);
  assert.ok(rel.startsWith(".shadow/atoms/"), `句柄 rel 应可回落：${rel}`);
  seen.add(h);
}
assert.equal(seen.size, 4, "4 个句柄应互不相同（跨工作区同名 rel 不冲突）");

console.log("✔ scope：跨工作区 user 聚合 · 守恒 · 降维句柄带 workspace 定位且同名 rel 不冲突");

// user 摘要渲染：只派生摘要、带根与降维句柄、不含原文
const md = renderUserSummary(u, { roots: [wsA, wsB], generatedAt: "2026-11-17T19:00:00" });
assert.ok(md.startsWith("# 用户级记忆"), "应有 user 级标题");
assert.ok(md.includes("跨 2 个工作区"), "应标工作区数");
assert.ok(md.includes("## 观察意识") && md.includes("## 面"), "应含意识与面");
assert.ok(md.includes("::.shadow/atoms/"), "降维句柄应带 workspace 定位");
console.log("✔ scope-render：user 摘要含根/意识/面/降维句柄");

// 隐私/视野过滤：what_matters 命中者留、视野外显式排除（全口径披露，不静默）
const lf = filterFacesByLens(u.faces, { whatMatters: ["src/a"], whatToIgnore: [] });
assert.ok(lf.kept.length >= 1 && lf.excluded.length >= 1, `应既有保留又有排除：kept=${lf.kept.length} excl=${lf.excluded.length}`);
assert.ok(lf.kept.every((f) => f.lines.some((l) => [l.title, ...l.entries].join(" ").toLowerCase().includes("src/a"))), "保留面应命中 what_matters");
assert.equal(lf.kept.length + lf.excluded.length, u.faces.length, "过滤必须全口径披露（不静默丢面）");
assert.ok(lf.excluded.every((e) => e.reason), "每个被过滤面都要带原因");

// what_to_ignore 命中即排除
const lf2 = filterFacesByLens(u.faces, { whatMatters: [], whatToIgnore: ["src/b"] });
assert.ok(lf2.excluded.some((e) => e.reason.includes("what_to_ignore")), "what_to_ignore 应排除");
console.log("✔ scope-privacy：what_matters/ignore 过滤面 · 全口径披露 · 带原因");
