import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

// 两条都含"多数据库"，但一条是"我方任务 prompt"（噪声），一条是真用户决策。
const seed = {
  "/ws/.shadow/atoms/2026-11-19--090000-a--aaaa.md": atomText({
    entry: "a",
    date: "2026-11-19",
    time: "090000",
    user: "只读任务，不要改任何文件。项目：dsh-shadow。请核查多数据库抽象。",
  }),
  "/ws/.shadow/atoms/2026-11-19--090100-b--bbbb.md": atomText({
    entry: "b",
    date: "2026-11-19",
    time: "090100",
    user: "不要多数据库抽象。对 taste.json 继续精修",
  }),
};
const deps = makeDeps(seed);
const r = await runRead(deps, { topic: "多数据库抽象" });
if (!r.ok) throw new Error(r.error.message);
const t = r.value.text;
// 本轮去噪作用在"检索点"（topic 召回）；投影/任务段的去噪是下一轮。
const recallPart = t.split("## 主题召回")[1] ?? "";
assert.ok(!recallPart.includes("只读任务"), "检索点应剔除『只读任务…』这类我方 prompt 噪声");
assert.ok(recallPart.includes("不要多数据库抽象"), "检索点应保留真用户决策");

console.log("✔ retrieval-noise：主题检索剔除 prompt/脚手架噪声，保留真决策");
