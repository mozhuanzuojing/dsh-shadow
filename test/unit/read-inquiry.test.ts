import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

const seed = {
  "/ws/.shadow/atoms/2026-11-19--090000-a--aaaa.md": atomText({ entry: "a", user: "用 SQLite 代替 PostgreSQL" }),
  "/ws/.shadow/atoms/2026-11-19--090100-b--bbbb.md": atomText({ entry: "b", user: "只要简单的，去掉复杂菜单，不要抽象" }),
};
const deps = makeDeps(seed);

const r = await runRead(deps, { inquiry: true });
if (!r.ok) throw new Error(r.error.message);
const t = r.value.text;
for (const k of ["对 AI 的问询", "多维背景", "方向假设", "决策谱系", "证据句柄", "请 AI 回答", "0 偏移方向", "边界（诚实）"]) {
  assert.ok(t.includes(k), `问询应含「${k}」`);
}
assert.ok(/\.shadow|\.md#|rel/.test(t) || t.includes("`"), "应含证据句柄");

// 带候选：应含候选偏移 + 硬排除
const rc = await runRead(deps, { inquiry: true, candidates: ["PostgreSQL", "SQLite", "加抽象层", "简单方案"] });
if (!rc.ok) throw new Error(rc.error.message);
assert.ok(rc.value.text.includes("候选偏移"), "应含候选偏移段");
assert.ok(rc.value.text.includes("✗ PostgreSQL"), "PostgreSQL 应被排除");
assert.ok(rc.value.text.includes("✗ 加抽象层"), "抽象层应被排除");

console.log("✔ read·inquiry：多维背景问询骨架 + 证据句柄 + 候选偏移/排除");
