#!/usr/bin/env node
// dsh-shadow —— tools/audit-triage.ts：**分诊助手**（不是门）。
//
// 用途：`audit:wiring` 的 A/B 段会给出 `字段=值` + `文件:行`，本工具把那些行的**上下文**摆到眼前，
//       便于人工判定「噪声 / 真断线」。**它不做判定** —— 判定要人（或带证据的推理），工具只负责摆证据。
//
// 用法：node tools/audit-triage.ts [仓库根] "field=value@file:line[,file:line...]" ...
// 退出码：0（只打印，从不判违规 —— 它不是门，**不进** `verify`）。
//
// 来源（v1.15.87）：原为 `_research/triage.ts`（本机草稿区、未进版本控制）。按 `AGENTS.md` 的判据
//   「**能复现的东西放 `tools/`**」搬进来 —— 它是一个**可复用**的只读助手，与 `verify` 里那两个审计门配对。
//   `_research/` 里其余脚本**没有**搬，理由在 `../.docs/fix/2026-09-15/volume-defaults-and-index-budget.md`
//   的分类表：要么是**单次改写文档**的（搬进 `tools/` 等于留一个能把当前文档改坏的脚本），
//   要么是**当时取证**（那类按 `AGENTS.md` 归 `../.docs/fix/<日期>/`，不归 `tools/`）。
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] || ".";
// 传入：field=value@file:line[,file:line...]
const items = process.argv.slice(3);

for (const spec of items) {
  const at = spec.indexOf("@");
  const key = spec.slice(0, at);
  const locs = spec.slice(at + 1).split(",");
  console.log("═".repeat(88));
  console.log(`■ ${key}`);
  console.log("═".repeat(88));
  const seen = new Set();
  for (const loc of locs) {
    const [file, lineStr] = loc.split(":");
    if (seen.has(file)) { /* 同一文件只展示一次里最近的一段 */ }
    seen.add(file);
    const n = Number(lineStr);
    let lines;
    try { lines = readFileSync(join(ROOT, file), "utf8").split("\n"); } catch { console.log(`  (读不到 ${file})`); continue; }
    const from = Math.max(0, n - 6), to = Math.min(lines.length, n + 3);
    console.log(`--- ${file}:${n} ---`);
    for (let i = from; i < to; i++) {
      const mark = (i + 1 === n) ? ">>" : "  ";
      console.log(`${mark} ${String(i + 1).padStart(4)}| ${lines[i]}`);
    }
  }
  console.log("");
}
