import assert from "node:assert/strict";
import { parseAtomName } from "../../dist/contract/paths.js";
import { parseAtom } from "../../dist/domain/parse.js";
import { atomText } from "../helpers.ts";

const rel = ".shadow/atoms/2026-09-05--100000-src-alpha.md";
const text = atomText({
  summary: "把 alpha 入口改成 A",
  materials: ["src/alpha.ts", "docs/spec.md"],
  decisions: [{ text: "采用方案 A", source: "user" }, { text: "先跑基准", source: "goal" }],
  reasons: [{ text: "因为 A 可回滚", source: "user" }],
  user: "请把 alpha 入口改成 A",
});
const atom = parseAtom(text, rel, "2026-09-05--100000-src-alpha.md");

assert.equal(atom.entry, "src/alpha.ts");
assert.equal(atom.date, "2026-09-05");
assert.equal(atom.time, "100000");
assert.equal(atom.summary, "把 alpha 入口改成 A");
assert.deepEqual(atom.materials, ["src/alpha.ts", "docs/spec.md"]);
assert.equal(atom.userMessages.length, 1);
assert.ok(atom.userMessages[0]!.includes("alpha"));
assert.equal(atom.decisionEvents.length, 2);
assert.equal(atom.decisionEvents[0]!.source, "user");
assert.equal(atom.decisionEvents[0]!.reason, "因为 A 可回滚");
assert.equal(atom.axes.locus, "/ws");
assert.equal(atom.axes.intent, "test");

const v2 = parseAtomName("2026-09-05--100000-src-alpha--ab12cd.md");
assert.deepEqual(v2, { date: "2026-09-05", time: "100000", slug: "src-alpha", uid: "ab12cd" });

const v1 = parseAtomName("2026-09-05--100000-src-alpha.md");
assert.deepEqual(v1, { date: "2026-09-05", time: "100000", slug: "src-alpha", uid: undefined });

const consolidated = parseAtom(
  atomText({ entry: "shadow" }),
  ".shadow/atoms/2026-09-05--100000-ep-x-consolidated.md",
  "2026-09-05--100000-ep-x-consolidated.md",
);
assert.equal(consolidated.kind, "consolidated");

console.log("✔ parse：v1/v2 文件名、头字段、决策/理由、材料、摘要、轴、consolidated");

