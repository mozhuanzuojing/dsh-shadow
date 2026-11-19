import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

const seed = {
  "/ws/.shadow/atoms/2026-11-19--090000-a--aaaa.md": atomText({ entry: "a", user: "用 SQLite 代替 PostgreSQL" }),
  "/ws/.shadow/atoms/2026-11-19--090100-b--bbbb.md": atomText({ entry: "b", user: "只要简单的，去掉复杂菜单，不要抽象" }),
};
const deps = makeDeps(seed);

const r = await runRead(deps, { direction: true });
if (!r.ok) throw new Error(r.error.message);
assert.ok(r.value.text.includes("意图方向"), "应含方向段");
assert.ok(/PostgreSQL/.test(r.value.text), "应呈现 PostgreSQL（否决/被替换）");
assert.ok(/抽象/.test(r.value.text), "应呈现 抽象 否决");

const rc = await runRead(deps, { direction: true, candidates: ["PostgreSQL", "SQLite", "加抽象层", "简单方案"] });
if (!rc.ok) throw new Error(rc.error.message);
const t = rc.value.text;
assert.ok(t.includes("✔ SQLite"), "SQLite 应幸存");
assert.ok(t.includes("✗ PostgreSQL"), "PostgreSQL 应被排除");
assert.ok(t.indexOf("✔ SQLite") < t.indexOf("✗ PostgreSQL"), "幸存者应排在排除项前");
assert.ok(t.includes("✗ 加抽象层"), "抽象层应被排除");

// 整体否决 → 不可判，不猜
const d2 = makeDeps({ "/ws/.shadow/atoms/x.md": atomText({ entry: "x", user: "都不要" }) });
const r2 = await runRead(d2, { direction: true, candidates: ["A", "B"] });
if (!r2.ok) throw new Error(r2.error.message);
assert.ok(r2.value.text.includes("不可判"), "整体否决应不可判");
assert.ok(!/·\s*偏移\s*\d/.test(r2.value.text), "不可判时不得输出数字偏移值（fail-closed）");

console.log("✔ read·direction：透镜输出 + 候选偏移排序/排除 + 整体否决不可判");
