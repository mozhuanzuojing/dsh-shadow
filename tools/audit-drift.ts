#!/usr/bin/env node
// dsh-shadow —— tools/audit-drift.ts：**投影漂移**审计 CLI（ADR-0070）。
//
// 为什么需要它（v1.15.22–26 连续五轮同类缺陷，逐个手工找是体力）：
//   机制是对的，断的是「**投影跟不上源头**」，而单元测试全绿。本工具把这一类变成**可重复的检测**。
//
// 用法：node tools/audit-drift.ts [仓库根]
// 纯静态、无 LLM、无网络、不改文件。
//
// **工具自身经标定**：`node tools/audit-drift.selftest.ts`
//   · 夹具 10 组已知答案（POS-1..3 / NEG-1..5 / 检测 B 跨文件）
//   · **git 历史里的真缺陷**：`0c4e06b:core/writer-materialize.ts` 的 :41 与 :215（修复前报 2 条、修复后 0 条）
// 一个抓不到已知缺陷的检测器，报「0 findings」没有意义（本仓纪律：先证工具，再用工具）。
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findFreshnessAsksProcess, findPredicateExpressedTwice, isProductionPath } from "./audit-drift.lib.ts";
import { ratchetCounts, serializeBaselines, type Counts } from "./audit-ratchet.lib.ts";
import { classifyCorpus, type CorpusObservation } from "./corpus-health.lib.ts";
import { sha256Hex } from "./retrieval-eval.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));

const ROOT = process.argv[2] || ".";
const asJson = process.argv.includes("--json");
/** B 段计数需在块作用域内取，故提到顶层（V6 棘轮用）。 */
let driftCounts: Counts = {};
/** 目录计数（V7 语料健康：目录数骤降 ⇒ 递归被静默截断）。 */
let dirCount = 0;
const walk = (d: string, out: string[] = []): string[] => {
  let es: any[];
  try { es = readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    const p = join(d, e.name);
    if (e.isDirectory()) { dirCount++; walk(p, out); }
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
};

const rel = (p: string) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p: string) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

const prod = walk(ROOT, [])
  .map((f) => ({ file: rel(f), text: read(f) }))
  .filter((f) => isProductionPath(f.file));

const fresh = findFreshnessAsksProcess(prod);
const preds = findPredicateExpressedTwice(prod);

// **缺件不静默（ADR-0049）**：与 `audit-wiring` 同因 —— 漏掉根参数会让 ROOT 取到旗标字符串、
// 扫出 0 文件、然后「安静地全绿」。（v1.15.45 实测踩到，故两个工具都加闸。）
if (prod.length === 0) {
  console.error(`生产语料为空（ROOT=${ROOT}）⇒ 拒绝产出「0 线索」读数：先确认根参数写对了（用法：node tools/audit-drift.ts <仓库根> [--ratchet]）`);
  process.exit(2);
}

if (asJson) {
  console.log(JSON.stringify({ productionFiles: prod.length, freshness: fresh, predicateLeads: preds }, null, 2));
} else {
  console.log(`生产源码 ${prod.length} 个`);
  console.log("");

  // ── A：派生件新鲜度「只看进程、不问源」（**已标定**，精度高）──
  console.log("═".repeat(100));
  console.log("A. 派生件的新鲜度**只看进程、不问源**（已标定；对应 ADR-0069 那一族）");
  console.log("═".repeat(100));
  if (!fresh.length) console.log("  （无）");
  for (const h of fresh) console.log(`  ${`${h.file}:${h.line}`.padEnd(46)} ${h.snippet.slice(0, 90)}`);
  console.log(`  小计 ${fresh.length} 条`);

  // ── B：同一条判据在 ≥2 个模块被表达（**线索级**）──
  const byKey = new Map<string, { files: Set<string>; hits: typeof preds }>();
  for (const h of preds) {
    const k = (h.detail.match(/`([^`]+)`/) || [])[1] || "?";
    if (!byKey.has(k)) byKey.set(k, { files: new Set(), hits: [] });
    byKey.get(k)!.files.add(h.file);
    byKey.get(k)!.hits.push(h);
  }
  const keys = [...byKey].sort((a, b) => b[1].files.size - a[1].files.size || a[0].localeCompare(b[0]));
  console.log("");
  console.log("═".repeat(100));
  console.log("B. 同一条判据在 **≥2 个生产模块**被表达（线索级 —— **一律人工复核**，见下）");
  console.log("═".repeat(100));
  if (!keys.length) console.log("  （无）");
  for (const [k, v] of keys) {
    console.log(`  ${k.padEnd(26)} 文件 ${v.files.size}: ${[...v.files].join(", ")}`);
  }
  console.log(`  小计 ${keys.length} 个键 / ${preds.length} 处`);
  driftCounts = { drift_keys: keys.length, drift_sites: preds.length };

  console.log("");
  console.log("判定纪律（**本条最重要**）：以上都是**线索不是结论**。");
  console.log("  · A 已被**标定**（夹具 8 组 + git 历史真缺陷「修复前报 2、修复后报 0」）⇒ 精度高，仍需看一眼；");
  console.log("  · B **只能答「同一 `字段=字面量` 出现在多个模块」**，答不了「两处口径是否一致」——");
  console.log("    而「口径不一致」才是 ADR-0063/D5 的真正病根（那需要类型/语义分析）⇒ **不得据 B 定罪**；");
  console.log("    生产者与消费者分别表达同一条判据，在分层架构里**可能是正当的**。");
  console.log("");
  console.log("**工具自身经标定**：node tools/audit-drift.selftest.ts");
}

// ───────────────────── V6：棘轮（退出码语义） ─────────────────────
// 与 `audit-wiring` **共用同一个基线文件**的 `drift` 段。判据同前：线索数只能降不能升；
// 桶消失或新桶出现都算违规。**诚实标注**：本段只棘轮 **B 段**（`drift_keys` / `drift_sites`）——
// A 段的 `fresh` 计数在块作用域里，文件尾取不到；要棘轮它得先把计数提到顶层（留作后续）。
const RATCHET_BASELINE = join(here, "audit-ratchet.baseline.json");
const DRIFT_COUNTS: Counts = driftCounts;
const wantsRatchet = process.argv.includes("--ratchet") || process.argv.includes("--update-ratchet");
if (wantsRatchet) {
  const all = existsSync(RATCHET_BASELINE) ? JSON.parse(readFileSync(RATCHET_BASELINE, "utf8")) : {};
  const isUpdate = process.argv.includes("--update-ratchet");

  // **V7 语料健康门**（与 `audit-wiring` 同一份判据与同一个基线文件的 `corpus` 段）。
  const SENTINELS = ["index.ts", "core/paths.ts", "core/types.ts", "security/scrub.ts"];
  const seen = new Set(prod.map((f: { file: string }) => f.file));
  const missing = SENTINELS.filter((s) => !seen.has(s));
  const CORPUS: CorpusObservation = {
    files: prod.length,
    dirs: dirCount,
    findingsA: fresh.length,
    findingsB: preds.length,
    fingerprint: sha256Hex(prod.map((f: { file: string }) => f.file).sort().join("\n")),
  };
  const health = classifyCorpus("audit-drift", CORPUS, all.corpus?.drift, missing);

  if (isUpdate) {
    if (health.health === "EMPTY" || health.health === "PARTIAL") {
      for (const l of health.lines) console.log(l);
      console.log("  ⇒ 拒绝 `--update-ratchet`：先确认是「真修好了」还是「工具坏了」。");
      process.exit(2);
    }
    // 语料段**按消费者分开**（见 `audit-wiring.ts` 同处注释：两工具量的是不同语料，共享键会互相覆盖）。
    all.corpus = { ...(all.corpus ?? {}), drift: CORPUS };
    all.drift = DRIFT_COUNTS;
    writeFileSync(RATCHET_BASELINE, serializeBaselines(all), "utf8");
    console.log(`已写入棘轮基线（drift 段 + corpus 段）：${RATCHET_BASELINE}`);
    for (const [k, v] of Object.entries(DRIFT_COUNTS).sort()) console.log(`  ${k} = ${v}`);
    console.log(`  corpus: files=${CORPUS.files} dirs=${CORPUS.dirs} fingerprint=${CORPUS.fingerprint.slice(0, 12)}…`);
    process.exit(0);
  }

  console.log("");
  for (const l of health.lines) console.log(l);
  if (!health.ok) {
    console.log("  ⇒ 语料不健康 ⇒ **不跑棘轮比较**（先修语料，再比线索）。");
    process.exit(health.exitCode);
  }
  const r = ratchetCounts("audit-drift", DRIFT_COUNTS, all.drift);
  for (const l of r.lines) console.log(l);
  process.exit(r.exitCode);
}

process.exit(0);
