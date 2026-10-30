import assert from "node:assert/strict";
import { searchSymbols, extractSymbols } from "../../dist/engine/read/symbols.js";
import { MemoryFs } from "../../dist/store/fs.js";

const seed = {
  "/ws/src/auth.ts": [
    "export function createSession(token: string) {",
    "  return token;",
    "}",
    "export class AuthService {",
    "  login() { return 1; }",
    "}",
    "export const VERSION = '1';",
    "",
  ].join("\n"),
  "/ws/node_modules/dep/index.ts": "export function createSession() { return 1; }\n",
  "/ws/readme.md": "createSession 文档（非代码）\n",
};
const deps = { fs: new MemoryFs(seed), ws: "/ws" };

// 1) 找函数/类符号，带行号；跳过 node_modules
const r = await searchSymbols(deps as any, "createSession", { limit: 10 });
assert.ok(!r.error, `不应报错：${r.error}`);
assert.ok(r.hits.some((h) => h.name === "createSession" && h.kind === "function" && h.line === 1), JSON.stringify(r.hits));
assert.ok(!r.hits.some((h) => h.rel.includes("node_modules")), "应跳过 node_modules");

// 2) 找类
const c = await searchSymbols(deps as any, "AuthService", {});
assert.ok(c.hits.some((h) => h.name === "AuthService" && h.kind === "class"), JSON.stringify(c.hits));

// 3) 直接抽取：interface / const
const ex = await extractSymbols("x.ts", "export interface Foo { a: number }\nexport const bar = 1;\n", "typescript");
assert.ok(ex.some((h) => h.name === "Foo" && h.kind === "interface"), JSON.stringify(ex));
assert.ok(ex.some((h) => h.name === "bar" && h.kind === "const"), JSON.stringify(ex));

// 4) 空查询返回空
const empty = await searchSymbols(deps as any, "", {});
assert.equal(empty.hits.length, 0);

console.log("✔ symbols：tree-sitter 抽 函数/类/interface/const（带行号）+ 预筛 + 跳过 node_modules");
