#!/usr/bin/env node
// dsh-shadow —— tools/winget-verify-seed.mjs：核验台账扩源种子（tools/toolset-seed.json）。
// 对每个**精确包 ID** 调 `winget show`，取权威版本/许可证/主页；核验不过的条目**一律不采纳**。
// 用法：node tools/winget-verify-seed.mjs [--json]
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyOne } from "./winget-verify.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(join(here, "toolset-seed.json"), "utf8"));
const asJson = process.argv.includes("--json");

const ok = [], bad = [];
for (const c of seed.candidates) {
  const r = await verifyOne(c.pkg);
  const row = { ...c, ...r };
  if (r.status === "ok" || r.status === "version-drift") ok.push(row);
  else bad.push(row);
  if (!asJson) {
    const badge = (r.status === "ok" || r.status === "version-drift") ? "✅" : "❌";
    console.log(`${badge} ${c.id.padEnd(14)} ${c.pkg.padEnd(38)} ${String(r.version || "-").padEnd(22)} ${String(r.license || "").slice(0, 22).padEnd(24)} ${r.status === "ok" ? "" : r.detail}`);
  }
}

if (asJson) {
  console.log(JSON.stringify({ verified: ok, rejected: bad,
    summary: { total: seed.candidates.length, verified: ok.length, rejected: bad.length } }, null, 2));
} else {
  console.log("");
  console.log(`种子核验：${seed.candidates.length} 项 → ✅ 通过 ${ok.length} · ❌ 拒绝 ${bad.length}`);
  if (bad.length) {
    console.log("\n被拒绝（**不写入台账**）：");
    for (const r of bad) console.log(`  ${r.id.padEnd(14)} ${r.pkg.padEnd(38)} ${r.status} — ${r.detail}`);
  }
}
process.exit(bad.length ? 1 : 0);
