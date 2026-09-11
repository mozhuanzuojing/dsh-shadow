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
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { findFreshnessAsksProcess, findPredicateExpressedTwice, isProductionPath } from "./audit-drift.lib.ts";

const ROOT = process.argv[2] || ".";
const asJson = process.argv.includes("--json");
const walk = (d: string, out: string[] = []): string[] => {
  let es: any[];
  try { es = readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
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

  console.log("");
  console.log("判定纪律（**本条最重要**）：以上都是**线索不是结论**。");
  console.log("  · A 已被**标定**（夹具 8 组 + git 历史真缺陷「修复前报 2、修复后报 0」）⇒ 精度高，仍需看一眼；");
  console.log("  · B **只能答「同一 `字段=字面量` 出现在多个模块」**，答不了「两处口径是否一致」——");
  console.log("    而「口径不一致」才是 ADR-0063/D5 的真正病根（那需要类型/语义分析）⇒ **不得据 B 定罪**；");
  console.log("    生产者与消费者分别表达同一条判据，在分层架构里**可能是正当的**。");
  console.log("");
  console.log("**工具自身经标定**：node tools/audit-drift.selftest.ts");
}

process.exit(0);
