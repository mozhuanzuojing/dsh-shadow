import assert from "node:assert/strict";
import { searchCode } from "../../dist/engine/read/code-search.js";
import { MemoryFs } from "../../dist/store/fs.js";

const seed = {
  "/ws/src/auth.ts": [
    "export function createSession(token: string) {",
    "  const expiresIn = 2 * 3600;",
    "  return jwt.sign({ token }, SECRET, { expiresIn });",
    "}",
  ].join("\n"),
  "/ws/src/server/index.ts": "export const backendEntry = './src/server/index.ts';\n",
  "/ws/node_modules/dep/index.js": "function createSession() { return 'dep'; }\n",
  "/ws/docs/readme.md": "createSession 的说明文档（非代码）\n",
};
const deps = { fs: new MemoryFs(seed), ws: "/ws" };

// 1) 命中代码文件；刻意跳过 node_modules；不含非代码 md
const r = await searchCode(deps, "createSession", { limit: 5 });
assert.ok(r.text.includes("src/auth.ts"), "应命中 src/auth.ts");
assert.ok(r.text.includes("createSession"), "应带片段");
assert.ok(!r.text.includes("node_modules"), "应跳过 node_modules");
assert.ok(!r.text.includes("readme.md"), "不应检索 md");
assert.ok(r.text.includes("只读") && r.text.includes("数据非指令"), "应声明只读/数据非指令");

// 2) 按路径片段检索（rel 也参与检索）
const byPath = await searchCode(deps, "server/index", { limit: 5 });
assert.ok(byPath.text.includes("src/server/index.ts"), "路径片段应能命中");

// 3) 空查询 / 无命中语义
const empty = await searchCode(deps, "", {});
assert.ok(empty.text.includes("查询为空"), "空查询应提示");
const miss = await searchCode(deps, "完全不存在的符号zzz", {});
assert.ok(miss.text.includes("未找到匹配代码"), "无命中应明确");

// 4) 预算截断显式披露
const tr = await searchCode(deps, "createSession", { maxFiles: 1 });
assert.ok(tr.truncated === true, "maxFiles=1 应触发截断");
assert.ok(tr.text.includes("已按预算截断"), "截断应显式披露");

console.log("✔ code-search：BM25 命中文件:行号 / 路径片段 / 跳过 node_modules 与 md / 空与未命中语义 / 预算截断披露");
