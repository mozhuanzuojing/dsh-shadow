import assert from "node:assert/strict";
import { makeIgnore } from "../../dist/domain/ignore.js";
import { loadIgnore } from "../../dist/engine/read/ignore.js";
import { searchCode } from "../../dist/engine/read/code-search.js";
import { MemoryFs } from "../../dist/store/fs.js";

// 1) gitignore 基本语义
const ig = makeIgnore(["node_modules/", "*.log", "/dist", "!keep.log", "**/generated/**"].join("\n"));
assert.equal(ig("node_modules", true), true, "node_modules/ 应忽略");
assert.equal(ig("a/node_modules", true), true, "任意层级 node_modules 应忽略");
assert.equal(ig("a/b.log", false), true, "*.log 应忽略");
assert.equal(ig("keep.log", false), false, "!keep.log 取反应保留");
assert.equal(ig("dist/x", true), true, "/dist 锚定应忽略");
assert.equal(ig("a/dist", true), false, "/dist 不应命中 a/dist");
assert.equal(ig("a/generated/x.ts", false), true, "**/generated/** 应忽略");

// 2) 显式 exclude（目录名/前缀）
const ex = makeIgnore("", ["_work", "deps/vendor"]);
assert.equal(ex("_work/a.ts", false), true, "exclude _work 命中其下");
assert.equal(ex("src/_work", true), true, "exclude 目录名命中任意层级");
assert.equal(ex("deps/vendor/x.ts", false), true, "exclude 相对前缀命中");
assert.equal(ex("src/app.ts", false), false, "无关路径不忽略");

// 3) loadIgnore 读取根 .gitignore + 与 searchCode 串起来
const seed = {
  "/ws/.gitignore": "secret/\n",
  "/ws/secret/a.ts": "export const needle = 1;\n",
  "/ws/src/b.ts": "export const needle = 2;\n",
};
const fs = new MemoryFs(seed);
const ignore = await loadIgnore(fs, "/ws", { useGitignore: true, exclude: [] });
assert.equal(ignore("secret", true), true, "loadIgnore 应读到 .gitignore 的 secret/");
const r = await searchCode({ fs, ws: "/ws" }, "needle", { limit: 5, ignore });
assert.ok(r.text.includes("src/b.ts"), "应命中 src/b.ts");
assert.ok(!r.text.includes("secret/a.ts"), "应忽略 secret/ 下的文件");

console.log("✔ ignore：gitignore（* / ** / 锚定 / 取反 / 目录）+ exclude + 与 searchCode 串联");
