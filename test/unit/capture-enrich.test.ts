import assert from "node:assert/strict";
import { buildAtomText, type Trace } from "../../dist/engine/write/atom-text.js";
import { parseAtom } from "../../dist/domain/parse.js";

const mk = (p: Partial<Trace> & Pick<Trace, "kind" | "text">): Trace => ({
  at: "10:00:00", seq: 1, date: "2026-11-19", comp: "", source: "user", ...p,
} as Trace);

const traces: Trace[] = [
  mk({ kind: "user", text: "用户：不要多数据库抽象 因为维护成本高" }),
  mk({ kind: "decision", text: "决定 不要多数据库抽象", statement: "不要多数据库抽象", reason: "维护成本高", materials: ["src/db.ts"] }),
  mk({ kind: "info", text: "信息 当前统计页像台账/表单", materials: ["src/stat.ts"] }),
  mk({ kind: "action", text: "改/读 src/app.ts", comp: "src/app.ts", source: "fs" }),
];
const body = buildAtomText(traces, { ws: "D:\\project\\x", entry: "src/app.ts", date: "2026-11-19", time: "100000", agentId: "a", project: "x", goal: "g", summary: "off" });
const a = parseAtom(body, ".shadow/atoms/t.md", "t.md");

assert.ok(a.decisions.some((d) => d.includes("不要多数据库抽象")), "决策应入库");
assert.ok(a.decisionEvents.some((e) => (e.reason ?? "").includes("维护成本高")), "决策理由应入库");
assert.ok(a.materials.includes("src/db.ts") && a.materials.includes("src/stat.ts") && a.materials.includes("src/app.ts"), "材料应合并(决策/信息/动作)");
assert.ok((a.info ?? []).some((s) => s.includes("当前统计页像台账")), "信息(事实)应入库");

console.log("✔ capture-enrich：决策reason + 材料引用(决策/信息/动作) + 信息，写入→解析闭环");
