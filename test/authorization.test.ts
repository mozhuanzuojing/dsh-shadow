// dsh-shadow —— ADR-0048⑥：授权范围搜索（zg authorization 思想，防越权泄漏）。
import assert from "node:assert/strict";
import { inScope, authorizeScope } from "../dist/core/authorization.js";

const scope = { workspace: "D:/project/dsh1", allowed: ["D:/project/shared"], denied: ["D:/project/dsh1/.secret"] };
assert.equal(inScope("D:/project/dsh1/vendor/dsh-shadow/README.md", scope), true, "workspace 内放行");
assert.equal(inScope("D:/project/dsh1/.secret/key.txt", scope), false, "denied 优先排除");
assert.equal(inScope("D:/project/shared/commons.ts", scope), true, "allowed 扩展放行");
assert.equal(inScope("C:/other/world.txt", scope), false, "范围外排除");

// authorizeScope 过滤
const refs = [
  { locator: "D:/project/dsh1/src/AuthFilter.java" },
  { locator: "C:/outside/leak.txt" },
  { locator: "D:/project/dsh1/.secret/token" },
];
const kept = authorizeScope(refs, scope);
assert.equal(kept.length, 1, "只在范围内保留 1 条");
assert.equal(kept[0].locator, "D:/project/dsh1/src/AuthFilter.java", "保留的是范围内条目");

// 无 workspace → 保守放行（不限定范围）
assert.equal(inScope("anything/x", {}), true, "无 workspace 保守放行");
const keptAll = authorizeScope(refs, {});
assert.equal(keptAll.length, 3, "无 scope 全放行");

console.log("✔ 场景 Authorize-1 授权范围：workspace 内放行/denied 排除/allowed 扩展/范围外排除 + 保守放行");
console.log("ALL PASS ✅");
