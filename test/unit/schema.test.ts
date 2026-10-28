import assert from "node:assert/strict";
import { ALL_MODES, CORE_MODES, LAB_MODES, nearestModes } from "../../dist/contract/modes.js";
import { makeCoreTools } from "../../dist/surface/tools.js";
import { schemaChars } from "../../dist/contract/schema.js";

const tools = makeCoreTools(async () => {
  throw new Error("schema test must not execute");
});

const read = tools.find((t) => t.name === "read_shadow")!;
const recall = tools.find((t) => t.name === "recall_shadow")!;
const query = tools.find((t) => t.name === "shadow_query")!;
const toolset = tools.find((t) => t.name === "shadow_toolset")!;

assert.equal(Object.keys(read.parameters.properties).length, 12);
assert.equal(Object.keys(recall.parameters.properties).length, 2);
assert.equal(Object.keys(query.parameters.properties).length, 3);
assert.equal(Object.keys(toolset.parameters.properties).length, 4);

for (const k of ["topic", "entry", "mode", "limit", "max_tokens", "debug", "raw", "soul", "taste", "experience", "judgment", "verifyEvidence"]) {
  assert.ok(k in read.parameters.properties, `missing read param ${k}`);
}
for (const k of ["asOf", "observer", "kg", "identity", "context", "project", "claim"]) {
  assert.ok(!(k in read.parameters.properties), `${k} 应移入 lab`);
}

assert.equal(CORE_MODES.length, 10);
assert.equal(LAB_MODES.length, 51);
assert.equal(ALL_MODES.length, 62);

const total = tools.reduce((n, t) => n + schemaChars(t), 0);
assert.ok(total <= 6000, `core schema 应 ≤6000 字符，实际 ${total}`);

const near = nearestModes("recovry");
assert.ok(near.includes("recovery"), `nearest 应含 recovery：${near.join(",")}`);

console.log(`✔ schema：read=12 recall=2 query=3 toolset=4 · core schema ${total} 字符 · modes 62 (10+1+51)`);

