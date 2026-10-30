import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

const WS = "/ws";
const seed = {
  [`${WS}/.shadow/atoms/2026-09-05--100000-backend--abc123.md`]: atomText({
    entry: "backend",
    user: "后端工程入口是 src/server/index.ts，先看这里。",
    summary: "后端工程入口位置",
  }),
};
const deps = makeDeps(seed);

// 1) 严格命中：原句片段直接命中，且不应标注「宽松匹配」
const exact = await runRead(deps, { topic: "后端工程入口" });
if (!exact.ok) throw new Error(exact.error.message);
assert.ok(exact.value.text.includes("src/server/index.ts"), "严格命中应返回 atom");
assert.ok(!exact.value.text.includes("宽松匹配"), "严格命中不应标注宽松");

// 2) 兜底：自然改写「后端入口在哪」严格为 0，应被 2-gram 兜底命中
const fuzzy = await runRead(deps, { topic: "后端入口在哪" });
if (!fuzzy.ok) throw new Error(fuzzy.error.message);
assert.ok(fuzzy.value.text.includes("宽松匹配"), "应标注宽松匹配");
assert.ok(fuzzy.value.text.includes("src/server/index.ts"), "宽松匹配应找回 atom");

// 3) 无关查询仍必须是「未找到」（不得因兜底变成乱命中）
const none = await runRead(deps, { topic: "完全不存在主题zzz" });
if (!none.ok) throw new Error(none.error.message);
assert.ok(none.value.text.includes("未找到相关记忆"), "无关查询不得被兜底命中");

// 4) query 模式同样兜底
const q = await runRead(deps, { mode: "query", topic: "后端入口在哪" });
if (!q.ok) throw new Error(q.error.message);
assert.ok(q.value.text.includes("宽松匹配"), "query 模式应标注宽松匹配");
assert.ok(q.value.text.includes("backend"), "query 模式应命中 backend atom");

// 5) recovery(rankTasks) 兜底：改写查询仍能定位该任务
const rec = await runRead(deps, { mode: "recovery", topic: "后端入口在哪" });
if (!rec.ok) throw new Error(rec.error.message);
assert.ok(rec.value.text.includes("后端工程入口是"), "recovery 兜底应定位到任务触发句");

// 6) 更长的自然句「找一下后端服务的入口」也应被兜底命中
const long = await runRead(deps, { topic: "找一下后端服务的入口" });
if (!long.ok) throw new Error(long.error.message);
assert.ok(long.value.text.includes("宽松匹配"), "长句应标注宽松匹配");
assert.ok(long.value.text.includes("src/server/index.ts"), "长句兜底应找回 atom");

console.log("✔ fuzzy：中文改写零结果时用 2-gram 兜底找回；严格命中/无关查询语义不变");
