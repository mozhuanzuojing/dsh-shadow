import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

const seed = {
  "/ws/.shadow/atoms/2026-11-19--090000-a--aaaa.md": atomText({
    entry: "a", date: "2026-11-19", time: "090000",
    user: "不要多数据库抽象。对 taste.json 继续精修",
  }),
  "/ws/.shadow/atoms/2026-11-19--090100-b--bbbb.md": atomText({
    entry: "b", date: "2026-11-19", time: "090100",
    user: "只读任务，不要改任何文件。项目：dsh-shadow。请核查多数据库抽象。",
  }),
  "/ws/.shadow/atoms/2026-11-19--090200-c--cccc.md": atomText({
    entry: "c", date: "2026-11-19", time: "090200",
    materials: ["src/stat.ts"],
    info: ["统计页当前像台账/表单"],
    user: "当前多数据库抽象让统计页像台账/表单，等权行 + 邮箱混入",
  }),
};const deps = makeDeps(seed);
const r = await runRead(deps, { background: true, topic: "多数据库抽象" });
if (!r.ok) throw new Error(r.error.message);
const t = r.value.text;
assert.ok(t.includes("大背景"), "应返回大背景包");
assert.ok(t.includes("相关线"), "应归并相关线");
assert.ok(t.includes("相关决策"), "应含相关决策");
assert.ok(t.includes("不要多数据库抽象"), "应含真决策");
assert.ok(!t.includes("只读任务"), "应剔除 prompt 噪声");
assert.ok(t.includes("证据句柄"), "应带证据句柄");
assert.ok(t.includes("相关信息"), "背景应含信息(事实/材料)，不只决策");
assert.ok(t.includes("材料：src/stat.ts"), "应带材料引用");
assert.ok(t.includes("统计页当前像台账"), "应带信息(事实)条目");
console.log("✔ background：未来句→大背景（线归并+决策+口味+句柄，剔噪）");
