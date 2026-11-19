import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { buildEdges, activateNet } from "../../dist/domain/graph.js";
import { atomText } from "../helpers.ts";

const a1 = parseAtom(atomText({ entry: "src/alpha.ts", date: "2026-11-19", time: "090000", materials: ["src/x.ts"], decisions: [{ text: "删除 dry_run", source: "user" }], user: "alpha 重构 删除 dry_run" }), ".shadow/atoms/a1.md", "a1.md");
const a2 = parseAtom(atomText({ entry: "src/alpha.ts", date: "2026-11-19", time: "090100", materials: ["src/x.ts"], user: "alpha 重构 beta 层" }), ".shadow/atoms/a2.md", "a2.md");

const edges = buildEdges([a1, a2]);
assert.ok(edges.some((e) => e.type === "same-entry"), "应有同入口边");
assert.ok(edges.some((e) => e.type === "material"), "应有共享材料边");
assert.ok(edges.some((e) => e.type === "semantic"), "应有语义边(共享关键词)");
assert.ok(edges.some((e) => e.type === "causal"), "应有因果边(决策↔材料)");

const net = activateNet(edges, [a1.rel], 1);
assert.ok(net.hop.get(a2.rel) === 1, "1 跳应激活同入口邻居");
assert.deepEqual(net.seeds, [a1.rel]);

console.log("✔ graph：派生边(同入口/材料) + 1 跳 ego-net 激活");
