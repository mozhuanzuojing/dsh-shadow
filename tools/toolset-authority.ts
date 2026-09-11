#!/usr/bin/env node
// dsh-shadow —— tools/toolset-authority.ts：生成/刷新**台账权威对照清单**（ADR-0072）。
//
// 为什么需要它（ADR-0072 的由来）：
//   台账每条的 `note` 形如 `winget <pkg> · <verSrc> <ver>`，其中 `verSrc` 是**版本号出处**。
//   实测发现 v1.15.10 那 44 条被标成 `"实测"`（= 「在本机 --version 跑出来的」），
//   但它们的版本号**其实全部取自 winget 目录**（44 条里 35 条与 winget 权威逐字一致；
//   已确证 fzf 台账 0.74.3 / 本机 0.73.1、zoxide 台账 0.10.0 / 本机已装 0.9.9）。
//   ⇒ 标签比事实强。默认值已改为 `"权威核验"`。
//
// 本工具解决的**第二个问题**：`verify:toolset` 一直传 `expectedVersion: null`
//   ⇒ `winget-verify.ts` 里的 `verDrift` 分支**从未生效** ⇒ 版本误标/老化**不可能被发现**。
//   本工具**真的把台账版本当期望值**去核验，并把结果**签入**成清单。
//
// 用法：
//   node tools/toolset-authority.ts           # 核验并刷新 tools/toolset-authority.json
//   node tools/toolset-authority.ts --check   # 只读：报告与既有清单的差异（不写文件）
//
// **诚实纪律**：核验失败只说「未取到」，不说「包不存在」（沿用 ADR-0049）。
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyOne } from "./winget-verify.ts";
import { claimOf, countInconsistency, ledgerMismatch, unsubstantiatedMeasured, type AuthorityRow } from "./toolset-authority.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(here, "toolset-authority.json");
const checkOnly = process.argv.includes("--check");

// 台账从**编译产物**读（与 `tools/winget-verify.ts` 同一做法）：源码是 `.ts`，运行时可加载的是 `dist/`。
const { CAPABILITIES } = await import("../dist/core/toolset.js");

type Row = AuthorityRow;


const targets = (CAPABILITIES as any[]).filter((c) => c.winget);
const { probeCapability } = await import("../dist/core/toolset-exec.js");
const rows: Row[] = [];
const started = new Date().toISOString().slice(0, 10);

/** 从探测详情里抠出版本号（详情形如 `rg 15.2.0` / `fzf 0.73.1 (ce4bef75)`）。 */
const verFromDetail = (detail: unknown): string | null => {
  const m = String(detail || "").match(/\b(\d+(?:\.\d+)+(?:[\w.\-+]*))/);
  return m ? m[1] : null;
};

console.log(`核验 ${targets.length} 条（真调 winget show + 本机 probe，只读）…`);
for (const c of targets) {
  const claim = claimOf(c.note);
  const r: any = await verifyOne(c.winget, { expectedVersion: claim?.ver });
  let machineVersion: string | null = null;
  try {
    const p: any = await probeCapability(c.id);
    if (p?.available) machineVersion = verFromDetail(p.detail);
  } catch { /* 探测失败 → null（不等于未安装） */ }
  rows.push({
    id: c.id,
    pkg: c.winget,
    ledgerVerSrc: claim?.verSrc || "(未标)",
    ledgerVersion: claim?.ver || "(无)",
    authorityVersion: r.version || "(未取到)",
    machineVersion,
    status: r.status,
  });
  const badge = r.status === "ok" ? "✅" : r.status === "version-drift" ? "⚠ " : "❌";
  const mv = machineVersion ? ` 本机 ${machineVersion}` : "";
  console.log(`  ${badge} ${c.id.padEnd(16)} ${(claim?.verSrc || "?").padEnd(8)} 台账 ${(claim?.ver || "?").padEnd(20)} 权威 ${r.version || "-"}${mv}`);
}

const aged = rows.filter((r) => r.status === "version-drift");
const okRows = rows.filter((r) => r.status === "ok");
const bad = rows.filter((r) => r.status !== "ok" && r.status !== "version-drift");
/** 「实测」标签但**本机读数不能佐证**的条目 —— 这是本 ADR 要防的那种谎。 */
const falseMeasured = unsubstantiatedMeasured(rows);

const manifest = {
  _comment:
    "台账版本的权威对照清单（ADR-0072）。由 tools/toolset-authority.ts 生成，**随包签入**。用途有二：① 记录「核验当日，台账声称什么、winget 权威说什么」，使**老化可见**；② 供离线棘轮（test/toolset-authority.test.ts）断言「台账未被静默改动」。台账改了版本或出处 → 必须重跑本工具，否则棘轮变红。",
  verifiedAt: started,
  counts: {
    total: rows.length,
    ok: okRows.length,
    aged: aged.length,
    unavailable: bad.filter((r) => r.status === "unavailable").length,
    notFound: bad.filter((r) => r.status === "not-found").length,
    idMismatch: bad.filter((r) => r.status === "id-mismatch").length,
    /** 标「实测」但本机读数不能佐证的条数 —— **必须为 0**（棘轮会断言）。 */
    falseMeasured: falseMeasured.length,
  },
  rows,
};

let prev: any = null;
try { prev = JSON.parse(readFileSync(MANIFEST, "utf8")); } catch { /* 首次生成 */ }

console.log("");
if (checkOnly) {
  if (!prev) { console.log("清单不存在 —— 请先不带 --check 跑一次生成。"); process.exit(1); }
  const changed = rows.filter((r) => {
    const p = prev.rows.find((x: Row) => x.id === r.id);
    return !p || p.ledgerVersion !== r.ledgerVersion || p.ledgerVerSrc !== r.ledgerVerSrc;
  });
  console.log(`--check：台账侧（版本/出处）与清单的差异 ${changed.length} 条`);
  for (const c of changed) console.log(`   ${c.id}: ${c.ledgerVerSrc} ${c.ledgerVersion}`);
  console.log(`权威侧老化（台账版本 < winget 现值）：${aged.length} 条`);
  console.log("");
  console.log("提示：若「台账侧差异」非 0，说明台账被改过但未重跑本工具 —— 离线棘轮会红。");
  process.exit(changed.length ? 1 : 0);
}

// **清单自洽门**（v1.15.33 接线）：`counts` 是**派生自 `rows` 的汇总**，两者一旦漂移，
// 下游（离线棘轮 / 人读）就会拿着一个与事实不符的汇总数。
// 此前 `countInconsistency`（`toolset-authority.lib.ts:66`）**只被测试调用**，CLI 从不调用它
// ⇒ 这个自洽检查在生产里**从未执行**（接线审计 A 类线索，见 ADR-0062 / BACKLOG T4）。
// 放在 `writeFileSync` **之前**：不一致就**拒绝写入**，不产出坏清单。
const inconsistent = countInconsistency(manifest as any);
if (inconsistent.length) {
  console.error("");
  console.error(`清单自洽校验失败（${inconsistent.length} 项）—— 拒绝写入：`);
  for (const e of inconsistent) console.error(`  · ${e}`);
  process.exit(1);
}

writeFileSync(MANIFEST, JSON.stringify(manifest, null, 1) + "\n", "utf8");
console.log("");
console.log(`已写入 ${MANIFEST}`);
console.log(`  共 ${rows.length} · 台账==权威 ${okRows.length} · **老化 ${aged.length}** · 未取到/异常 ${bad.length}`);
console.log(`  **「实测」但本机读数不能佐证：${falseMeasured.length}** ${falseMeasured.length ? "← 必须为 0！" : "✅"}`);
console.log(`  清单自洽（counts ↔ rows）：✅ ${inconsistent.length === 0 ? `已校验 ${Object.keys(manifest.counts).length} 个计数` : ""}`);
if (falseMeasured.length) {
  for (const r of falseMeasured) console.log(`     ${r.id.padEnd(16)} 台账 ${r.ledgerVerSrc} ${r.ledgerVersion} · 本机 ${r.machineVersion ?? "(未检出)"}`);
  process.exitCode = 1;
}
console.log("");
console.log("判定纪律：");
console.log("  · 「老化」= 台账版本落后于 winget 现值 —— 这是**目录在推进**的正常现象，**不是错误**；");
console.log("    它被记录下来是为了让老化**可见**，而不是为了让台账追着改（改了下次还会老化）。");
console.log("  · 真正要防的是**标签与事实不符**（如把 winget 目录版本标成「实测」）——");
console.log("    那由 test/toolset-authority.test.ts 的棘轮守住。");
