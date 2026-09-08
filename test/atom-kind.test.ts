// dsh-shadow —— v1.8.0 AtomKind：memory 二级属性（非新 type），task/metadata/experience 分类 + createdBy。
import assert from "node:assert/strict";
import { deriveAtomKind, deriveCreatedBy } from "../dist/core/episode.js";

// kind：task
assert.equal(deriveAtomKind({ entry: "tmp/dnw_todo.md", materials: [], decisions: [], goal: "", userMessages: [] }), "task", "todo 路径→task");
assert.equal(deriveAtomKind({ entry: "todo/2026-plan.md", materials: [], decisions: [], goal: "", userMessages: [] }), "task", "plan 路径→task");
// kind：metadata（会话元数据，无材料）
assert.equal(deriveAtomKind({ entry: "shadow", materials: [], decisions: [], goal: "", userMessages: ["用户打开项目"] }), "metadata", "会话元数据→metadata");
// kind：experience（有材料 / 有决策）
assert.equal(deriveAtomKind({ entry: "io/backend", materials: ["a.java"], decisions: [], goal: "", userMessages: [] }), "experience", "有材料→experience");
assert.equal(deriveAtomKind({ entry: "shadow", materials: [], decisions: ["选择RSA"], goal: "", userMessages: [] }), "experience", "有决策→experience");

// createdBy：user/agent/tool
assert.equal(deriveCreatedBy({ decisionEvents: [{ statement: "a", source: "user", reason: "" }], userMessages: [], materials: [] }), "user", "用户拍板→user");
assert.equal(deriveCreatedBy({ decisionEvents: [{ statement: "a", source: "assistant", reason: "" }], userMessages: [], materials: [] }), "agent", "assistant 决策→agent");
assert.equal(deriveCreatedBy({ decisionEvents: [], userMessages: ["hi"], materials: [] }), "user", "用户消息→user");
assert.equal(deriveCreatedBy({ decisionEvents: [], userMessages: [], materials: ["x.java"] }), "tool", "材料(tool 触达)→tool");

// kind 是二级属性，不新增 NodeType（类型仍是 memory）
console.log("✔ atom-kind：kind 分类(task/metadata/experience) + createdBy(user/agent/tool)，非新增 type");

console.log("ALL PASS ✅");
