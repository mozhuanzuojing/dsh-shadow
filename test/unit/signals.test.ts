import assert from "node:assert/strict";
import { SignalStore } from "../../dist/engine/signals.js";

const s = new SignalStore();
assert.equal(s.render(), "");

s.note("index", "IO", "写失败", "索引陈旧");
s.note("index", "IO", "又失败", "索引陈旧");
const one = s.active();
assert.equal(one.length, 1);
assert.equal(one[0]!.count, 2);
assert.ok(s.render().includes("能力降级"));

s.clear("index");
assert.equal(s.active().length, 0);
assert.equal(s.render(), "");

s.note("b", "X", "m", "e", 1);
s.note("a", "X", "m", "e", 2);
assert.deepEqual(s.active().map((x) => x.capability), ["a", "b"]);

console.log("✔ signals：同类合并计数、按能力排序、成功 clear 后不再渲染");

