import assert from "node:assert/strict";
import { astChunks } from "../../dist/engine/read/ast-chunk.js";

const src = [
  "import x from './x';",
  "export function alpha() {",
  "  return 1;",
  "}",
  "export class Beta {",
  "  methodOne() { return 2; }",
  "}",
  "",
].join("\n");

// 1) 按语法块切分：函数/类各自成块，不切断函数体
const chunks = await astChunks("a.ts", src, "typescript", 1500);
assert.ok(chunks.length >= 2, `应至少 2 块：${JSON.stringify(chunks)}`);
const fn = chunks.find((c) => c.kind === "function" && c.name === "alpha");
assert.ok(fn, "应有 function alpha 块");
assert.ok(fn!.text.includes("return 1;"), "函数块应包含完整函数体");
const cls = chunks.find((c) => c.kind === "class" && c.name === "Beta");
assert.ok(cls, "应有 class Beta 块");
assert.ok(cls!.text.includes("methodOne"), "类块应包含方法");

// 2) 行号是 1-based 且覆盖
assert.ok(fn!.start >= 2 && fn!.end >= 3, `函数行号范围：${fn!.start}-${fn!.end}`);
for (const c of chunks) assert.ok(c.start >= 1 && c.end >= c.start);

// 3) 未知语言 → 退回按行块（不抛错）
const fb = await astChunks("a.unknown", "line1\nline2\nline3", null, 10);
assert.ok(fb.length >= 1 && fb.every((c) => c.kind === "block"), "fallback 应为 block");

console.log("✔ ast-chunk：语法边界切块（函数/类完整）+ 行号 + 未知语言回退");
