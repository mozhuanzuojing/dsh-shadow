import assert from "node:assert/strict";
import { parseAtom } from "../../dist/domain/parse.js";
import { entryCoord, meaningfulEntry, taskCoord, topicCoord } from "../../dist/domain/coords.js";
import { atomText } from "../helpers.ts";

const mk = (name: string, opts: Parameters<typeof atomText>[0]) =>
  parseAtom(atomText(opts), `.shadow/atoms/${name}`, name);

// 入口：原始 entry 有意义 → 直接用
const a1 = mk("a1.md", { entry: "src/alpha.ts", user: "改 alpha" });
assert.equal(meaningfulEntry(a1), "src/alpha.ts");
assert.deepEqual(entryCoord(a1), { value: "src/alpha.ts", source: "entry" });

// 入口：entry 退化成项目名，但用户话里有路径 → 从用户话里抽
const a2 = mk("a2.md", { entry: "ws", project: "ws", user: "看一下 docs/spec.md 的约束" });
assert.equal(meaningfulEntry(a2), "", "entry 与项目名相同应判退化");
const e2 = entryCoord(a2);
assert.equal(e2.source, "user", "应回落到用户话路径");
assert.ok(e2.value.includes("docs/spec.md"), `应抽到 docs/spec.md，实际 ${e2.value}`);

// 入口：处处无路径 → none（不编造）
const a3 = mk("a3.md", { entry: "ws", project: "ws", user: "继续做", actions: [] });
assert.equal(entryCoord(a3).source, "none");

// 入口：用户话无路径，但动作里有 → 从动作抽
const a6 = mk("a6.md", { entry: "ws", project: "ws", user: "继续", actions: ["改/读 docs/report.md"] });
const e6 = entryCoord(a6);
assert.equal(e6.source, "action", "应回落到动作路径");
assert.ok(e6.value.includes("docs/report.md"), `应抽到 docs/report.md，实际 ${e6.value}`);

// 任务：只认 goal
const a4 = mk("a4.md", { goal: "实现升降维" });
assert.deepEqual(taskCoord(a4), { value: "实现升降维", source: "goal" });
const a5 = mk("a5.md", { user: "随便说说" });
assert.deepEqual(taskCoord(a5), { value: "", source: "none" });

// 主题：goal 优先，否则用户首句
assert.equal(topicCoord(a4).source, "goal");
const t5 = topicCoord(a5);
assert.equal(t5.source, "user");
assert.ok(t5.value.includes("随便说说"));

console.log("✔ coords：入口(entry>用户路径>none) / 任务(仅goal) / 主题(goal>用户首句) 派生正确且不编造");
