// dsh-shadow —— v1.8.0 Evidence Gate：Invariant 1(无证据 decision 不进 query) / Invariant 3(projection 无 generate·infer·guess)。
import assert from "node:assert/strict";
import { deriveShadowNodes } from "../dist/core/node.js";
import { validateAtomProjection } from "../dist/core/lineage-validator.js";

const atom = (over) => ({
  rel: ".shadow/2026-09-08/x.md", date: "2026-09-08", time: "000000", entry: "x", project: "p", agent: "a", goal: "",
  decisions: [], decisionEvents: [], userMessages: [], materials: [], actions: [], thinkLines: [], body: "",
  ...over,
});
const lin = (evidence, createdBy = "agent", source = "s") => ({ source, createdBy, evidence, createdAt: "" });

// Invariant 1a：无 evidence decision 不进入 query（reject projection，Atom 保留）
const decNoEv = atom({ decisions: ["选择RSA"], kind: "experience", lineage: lin([]) });
const v1 = validateAtomProjection({ type: "decision", kind: "experience", lineage: decNoEv.lineage });
assert.equal(v1.allowed, false, "无 evidence decision 应 reject");
assert.ok(v1.reason && v1.reason.includes("无 evidence"), "reject 原因应说明无 evidence");

// Invariant 1b：有 evidence decision 才 allowed
const decEv = atom({ decisions: ["选择RSA"], kind: "experience", lineage: lin([{ type: "file", locator: "adr/001-auth.md" }]) });
assert.equal(validateAtomProjection({ type: "decision", kind: "experience", lineage: decEv.lineage }).allowed, true, "有 evidence decision 应 allowed");

// Invariant 2：metadata memory reject
const meta = atom({ entry: "shadow", kind: "metadata", lineage: lin([], "user") });
assert.equal(validateAtomProjection({ type: "memory", kind: "metadata", lineage: meta.lineage }).allowed, false, "metadata memory 应 reject");

// deriveShadowNodes：只保留过 gate 的节点
const nodes = deriveShadowNodes([
  meta,                                                                   // metadata（排除）
  decNoEv,                                                                // 无证据 decision（排除）
  decEv,                                                                  // 有证据 decision（保留）
  atom({ entry: "src/AuthFilter.java", materials: ["src/AuthFilter.java"], kind: "experience", lineage: lin([{ type: "file", locator: "src/AuthFilter.java" }], "tool") }), // code（保留）
]);
assert.equal(nodes.length, 2, `应保留 2 节点(有证据 decision+code)，实际 ${nodes.length}`);
assert.ok(nodes.every((n) => n.kind !== "metadata"), "保留节点都不含 metadata");
assert.ok(nodes.filter((n) => n.type === "decision").every((n) => n.evidence.length > 0), "保留的 decision 都有证据");

// Invariant 3：projection 路径无 generate/infer/guess（纯派生，源码里无这些调用）
const src = deriveShadowNodes.toString();
assert.ok(!/\b(generate|infer|guess)\b/.test(src), "deriveShadowNodes 源码不应含 generate/infer/guess");
console.log("✔ evidence-gate：metadata memory 与无证据 decision 被排除，有证据 decision/code 保留，且 projection 无 generate/infer/guess");

console.log("ALL PASS ✅");
