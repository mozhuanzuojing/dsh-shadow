import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps, WS } from "../helpers.ts";

const seed: Record<string, string> = {};
for (let i = 0; i < 300; i++) {
  const name = `2026-09-0${(i % 5) + 1}--10${String(i % 60).padStart(2, "0")}00-src-mod-${i}.md`;
  seed[`${WS}/.shadow/atoms/${name}`] = atomText({
    entry: `src/mod-${i}.ts`,
    date: `2026-09-0${(i % 5) + 1}`,
    materials: [`src/mod-${i}.ts`, `docs/mod-${i}.md`],
    user: i % 10 === 0 ? "alpha 模块改造" : `处理模块 ${i}`,
  });
}
const deps = makeDeps(seed);
let calls = 0;
deps.verify = async () => {
  calls++;
  return "validated";
};

const rec = await runRead(deps, { mode: "recovery", topic: "alpha" });
if (!rec.ok) throw new Error(rec.error.message);
assert.ok(calls <= 30, `recovery 不应核验全语料：${calls} 次`);

calls = 0;
const ctx = await runRead(deps, { mode: "context" });
if (!ctx.ok) throw new Error(ctx.error.message);
assert.ok(calls <= 2400, `context 应有核验上限：${calls} 次`);
assert.ok(ctx.value.text.includes("未核验：100"), "context 截断必须披露");

console.log("✔ recovery/context cost：recovery ≤30 次核验；context 有 200 atom 上限且截断披露");
