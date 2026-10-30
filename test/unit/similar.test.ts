import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

const seed = {
  "/ws/.shadow/atoms/2026-09-05--100000-auth--a1b2c3.md": atomText({
    entry: "src/auth.ts",
    goal: "修 JWT 过期",
    user: "把 JWT 过期时间改成 2h",
    decisions: [{ text: "JWT 过期改为 2h", source: "user" }],
  }),
  "/ws/.shadow/atoms/2026-09-04--090000-todo--d4e5f6.md": atomText({
    entry: "docs/todo.md",
    date: "2026-09-04",
    time: "090000",
    goal: "整理 todo",
    user: "整理 todo 清单",
  }),
};
const deps = makeDeps(seed);

// 1) 相似任务召回：命中 JWT 任务卡，带出当时决策；不返回无关 todo
const r = await runRead(deps, { similar: true, topic: "JWT 过期" });
if (!r.ok) throw new Error(r.error.message);
assert.ok(r.value.text.includes("相似过往任务"), "应含标题");
assert.ok(r.value.text.includes("修 JWT 过期"), "应召回 JWT 任务卡");
assert.ok(r.value.text.includes("JWT 过期改为 2h"), "应带出当时决策");
assert.ok(!r.value.text.includes("整理 todo"), "不应返回无关任务");

// 2) 无关查询：明确「没有找到相关过往任务」
const none = await runRead(deps, { similar: true, topic: "完全不存在zzz" });
if (!none.ok) throw new Error(none.error.message);
assert.ok(none.value.text.includes("没有找到相关的过往任务"), "无关查询应明确无结果");

// 3) 空查询 = 浏览（返回卡，不报错）
const browse = await runRead(deps, { similar: true });
if (!browse.ok) throw new Error(browse.error.message);
assert.ok(browse.value.text.includes("相似过往任务"), "空查询应进入浏览模式");
assert.ok(browse.value.text.includes("修 JWT 过期") || browse.value.text.includes("整理 todo"), "浏览应列出任务卡");

console.log("✔ similar：任务卡召回 / 决策带出 / 无关不返回 / 空查询=浏览");
