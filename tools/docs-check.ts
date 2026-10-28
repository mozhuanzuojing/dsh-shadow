/**
 * v2 ops — 文档门：当前态 v2 文档存在、行数/字节预算、mode 计数与源码一致、ADR 索引齐全。
 * 只答“有没有/一致不一致”，不据它宣称文档正确。
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

const required = [
  "README.md",
  "docs/adr/README.md",
  "docs/v2/ARCHITECTURE.md",
  "docs/v2/CONVENTIONS.md",
  "docs/v2/MIGRATION.md",
  "docs/v2/LAB.md",
  "docs/v2/PARITY.md",
];

const missing = required.filter((p) => !existsSync(p));
if (missing.length) {
  console.error(`[docs-check] 缺文件：${missing.join("、")}`);
  process.exit(2);
}

const budget: Record<string, number> = {
  "README.md": 20_000,
  "docs/adr/README.md": 8_000,
  "docs/v2/ARCHITECTURE.md": 30_000,
  "docs/v2/CONVENTIONS.md": 20_000,
  "docs/v2/MIGRATION.md": 30_000,
  "docs/v2/LAB.md": 25_000,
  "docs/v2/PARITY.md": 40_000,
};
let bad = false;
for (const [p, max] of Object.entries(budget)) {
  const size = statSync(p).size;
  if (size > max) {
    console.error(`[docs-check] ${p} 超预算：${size} > ${max} bytes`);
    bad = true;
  }
}

const adrs = readdirSync("docs/adr").filter((n) => /^\d{4}-.+\.md$/.test(n) && !n.startsWith("0000-"));
if (adrs.length < 12) {
  console.error(`[docs-check] v2 ADR 少于 12 条：${adrs.length}`);
  bad = true;
}

const modesSrc = readFileSync("src/contract/modes.ts", "utf8");
const core = (modesSrc.match(/CORE_MODES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "").match(/"[a-z-]+"/g)?.length ?? 0;
const lab = (modesSrc.match(/LAB_MODES\s*=\s*\[([\s\S]*?)\]/)?.[1] ?? "").match(/"[a-z-]+"/g)?.length ?? 0;
if (core !== 10 || lab !== 51) {
  console.error(`[docs-check] mode 计数异常：core=${core} lab=${lab}（应 10 / 51）`);
  bad = true;
}
if (bad) process.exit(1);
console.log(`[docs-check] ok · current-state docs ${required.length} · ADR ${adrs.length} · core=${core} lab=${lab}`);
