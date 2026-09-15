#!/usr/bin/env node
// dsh-shadow —— tools/audit-scripts.ts：**脚本扩展名门** CLI（v1.15.87 立）。
//
// 判据只有一处：`tools/audit-scripts.lib.ts` 的 `findForbiddenScripts`（本文件的遍历只是**优化**）。
// 规则与由来（用户 2026-09-15 定的边界、以及为什么必须有门）见那个文件的文件头。
//
// 用法：node tools/audit-scripts.ts [仓库根]
// 退出码：0 = 没有手写 `.js` / `.mjs` / `.cjs`；1 = 有（逐条点名）；2 = 结构缺失（根读不到）。
// 纯静态、无 LLM、无网络、不改任何文件。
//
// **本工具的结论必须经标定**：见 `tools/audit-scripts.selftest.ts`（一个抓不到已知违规的检测器，
// 报「0 findings」是没有意义的）。
import { statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { walkTree } from "./audit-corpus.lib.ts";
import { SCRIPT_SKIP_DIRS, corpusVerdict, findForbiddenScripts, isForbiddenScript } from "./audit-scripts.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] ?? join(here, "..");

console.log("脚本扩展名门（v1.15.87）：仓库内不得有**手写** `.js` / `.mjs` / `.cjs`");
console.log("口径（必须打印，否则读数不可解释）：");
console.log(`  · 语料 = \`${ROOT}\` 下**所有文件**（递归），跳过目录：${SCRIPT_SKIP_DIRS.join(" / ")}`);
console.log("    —— `dist/` 是 tsc 产物（本仓 195 个 `.js`）、`node_modules/` 是依赖 ⇒ 都不算「手写脚本」；");
console.log("    —— **本门不跳过 `_research/`**：它问的是「本机有没有手写 js/mjs」，不是「产品语料是什么」");
console.log("       （与两个审计工具的 `NON_REPO_DIRS` 刻意不同 —— 那边问的是「哪些目录不属于这个仓库」）。");
console.log("  · 允许：`.ts`（本仓口径）与 `.py` / `.ps1` 等**其它脚本语言**（用户 2026-09-15 立的边界）。");

// **缺件不静默（ADR-0049）**：先确认根**存在且是目录** —— `walkTree` 的 `readdirSync` 是 try/catch 的，
// 缺件它会安静地返回 0 个文件，于是本门会报「全部判据通过」。v1.15.87 实测踩到过（根不存在 ⇒ exit 0），
// 而这是本仓已知的同族假绿（v1.15.45：漏根参数 ⇒ 0 文件 ⇒ 假全绿）。
let st: any;
try {
  st = statSync(ROOT);
} catch (e: any) {
  console.log(`✗ **结构缺失(2)**：根 \`${ROOT}\` 不存在/读不到（${e?.code ?? e?.message ?? e}）—— 这不是「通过」（ADR-0049）。`);
  process.exit(2);
}
if (!st.isDirectory()) {
  console.log(`✗ **结构缺失(2)**：根 \`${ROOT}\` 不是目录 —— 这不是「通过」（ADR-0049）。`);
  process.exit(2);
}

const walked = walkTree(ROOT, { match: () => true, skip: SCRIPT_SKIP_DIRS });

const verdict = corpusVerdict(walked.files.length);
if (!verdict.ok) {
  console.log(`✗ **结构缺失(2)**：${verdict.why}`);
  process.exit(verdict.code);
}

const relPaths = walked.files.map((p) => relative(ROOT, p).replace(/\\/g, "/"));
// 遍历时用 `isForbiddenScript` 只是**预筛**；判据以 `findForbiddenScripts` 为准（同一份 lib）。
const violations = findForbiddenScripts(relPaths);
const matched = relPaths.filter((p) => isForbiddenScript(p.split("/").pop() ?? "")).length;

console.log(`扫描：${relPaths.length} 个文件 / ${walked.dirCount} 个目录；其中扩展名命中 ${matched} 个 ⇒ 计违规 ${violations.length} 个。`);
console.log("");

if (violations.length === 0) {
  console.log("全部判据通过 ✅");
  process.exit(0);
}

console.log(`✗ 发现 ${violations.length} 个手写脚本（应为 \`.ts\`）：`);
for (const v of violations.slice(0, 40)) console.log(`   ✗ ${v}`);
if (violations.length > 40) console.log(`   ……另有 ${violations.length - 40} 处（只显示前 40）`);
console.log("");
console.log("怎么修：改名成 `.ts` —— 本包 `package.json` 是 `\"type\": \"module\"`，Node 原生剥类型能直跑 `.ts`，");
console.log("        通常**直接改扩展名**即可；若脚本之间互相 import，把 `.mjs` 说明符一并改成 `.ts`。");
console.log("        （`.py` / `.ps1` 等**不必**改：它们被明确允许。）");
process.exit(1);