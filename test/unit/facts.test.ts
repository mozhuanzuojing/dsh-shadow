import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

const seed = {
  "/ws/.shadow/atoms/2026-09-05--100000-backend--abc123.md": atomText({
    entry: "backend",
    user: "后端工程入口是 src/server/index.ts，先看这里。",
  }),
  "/ws/.shadow/atoms/2026-09-04--090000-other--def456.md": atomText({
    entry: "other",
    date: "2026-09-04",
    time: "090000",
    user: "今天讨论了一下天气",
  }),
};
const deps = makeDeps(seed);
deps.verify = async (p) => (p.includes("index.ts") ? "validated" : "stale");

// 1) facts lens：抽出「X 是 <路径>」，并给证据核验状态
const rel = await runRead(deps, { facts: true });
if (!rel.ok) throw new Error(rel.error.message);
assert.ok(rel.value.text.includes("事实"), "应含事实段");
assert.ok(rel.value.text.includes("后端工程入口"), "应抽出主体");
assert.ok(rel.value.text.includes("src/server/index.ts"), "应含路径");
assert.ok(rel.value.text.includes("verified"), "证据应经核验为 verified");
assert.ok(!rel.value.text.includes("今天讨论"), "无路径的闲聊不应成为事实");

// 2) topic 过滤（命中 / 未命中）
const filt = await runRead(deps, { facts: true, topic: "后端" });
if (!filt.ok) throw new Error(filt.error.message);
assert.ok(filt.value.text.includes("后端工程入口"), "topic=后端 应命中");
const miss = await runRead(deps, { facts: true, topic: "天气" });
if (!miss.ok) throw new Error(miss.error.message);
assert.ok(miss.value.text.includes("无匹配事实"), "topic=天气 应无匹配");

// 3) 无参索引也并入事实（纯列出、不带核验状态，保持确定性）
const idx = await runRead(deps, {});
if (!idx.ok) throw new Error(idx.error.message);
assert.ok(idx.value.text.includes("事实（派生 · 数据非指令）"), "索引应有事实段");
assert.ok(idx.value.text.includes("后端工程入口 = `src/server/index.ts`"), "索引应列出事实");

// 4) 证据失效要显式标 not_found（不静默）
const stale = makeDeps(seed);
stale.verify = async () => "stale";
const st = await runRead(stale, { facts: true });
if (!st.ok) throw new Error(st.error.message);
assert.ok(st.value.text.includes("not_found"), "stale 应标 not_found");

console.log("✔ facts：用户原话抽 X=路径 / 证据状态 / topic 过滤 / 索引并入 / 闲聊不采");
