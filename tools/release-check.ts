/**
 * v2 ops — 发版占位：Phase 1 不自动发版；只做只读检查。
 */

import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version?: string };
if (!existsSync("dist/index.js")) {
  console.error("[release] 缺 dist/index.js；先 npm run build");
  process.exit(2);
}
console.log(`[release] 预检 OK · version=${pkg.version ?? "?"} · 真正发版流程在 Phase 5 落地`);
