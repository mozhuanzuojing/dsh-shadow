// dsh-shadow —— tools/audit-drift.selftest.ts：**投影漂移审计的标定测试**。
//
// 纪律（ADR-0062 §2）：**工具必须先标定，再用**。一个抓不到已知缺陷的检测器，报「0 findings」没有意义。
//
// 标定集有两层，**都是已知答案**：
//   ① 夹具（`tools/fixtures/drift-fixture*.ts`）：POS/NEG 各带 `MARK:` 标记，测试**按标记定位**，
//      **不硬编码行号**（夹具改动不会造成假红/假绿）。
//   ② **git 历史里的修复前代码** —— 最强的已知答案：ADR-0069 的真缺陷就在
//      `0c4e06b:core/writer-materialize.ts` 的 `:41` 与 `:215`（两处「新鲜度只看进程」），
//      而同文件**当前版本**已修好。检测器必须「旧版报 2 条、新版报 0 条」。
//      把历史编码进测试（而不是靠人记），是为了让结论**可复现**。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findFreshnessAsksProcess, findPredicateExpressedTwice, isProductionPath, stripComments, markedLines } from "./audit-drift.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const read = (p: string) => readFileSync(p, "utf8");
const gitShow = (rev: string, p: string) => execFileSync("git", ["show", `${rev}:${p}`], { cwd: repoRoot, encoding: "utf8" });
const FIX_A = join(here, "fixtures", "drift-fixture.ts");
const FIX_B = join(here, "fixtures", "drift-fixture-b.ts");

// ─────────────────────────────────────────────
// ① 注释剥离（沿用 audit-wiring 的教训：扫注释会把「文档里的例子」报成真代码）
// ─────────────────────────────────────────────
{
  const src = `// if (x.has(k)) return;\n/* if (y.has(k)) return; */\nconst a = 1;\n`;
  const stripped = stripComments(src);
  assert.ok(!/has\(/.test(stripped), "注释里的守卫必须被剥离");
  assert.equal(stripped.split("\n").length, src.split("\n").length, "剥离后行号不得漂移");
  console.log("✔ ① 注释剥离：注释里的守卫被去掉，且行号不漂移");
}

// ─────────────────────────────────────────────
// ② 分类器：按路径分段判（`tools/` 也算非生产 —— 工具自身不该被自己的规则报）
// ─────────────────────────────────────────────
for (const [p, want] of [["core/x.ts", true], ["query/query.ts", true], ["test/x.test.ts", false], ["tools/audit-drift.ts", false], ["node_modules/a/b.ts", false], ["dist/core/x.js", false], ["a/fixtures/b.ts", false]] as [string, boolean][]) {
  assert.equal(isProductionPath(p), want, `isProductionPath(${JSON.stringify(p)}) 应为 ${want}`);
}
console.log("✔ ② 分类器正确（7 例：生产 / 测试 / 工具自身 / node_modules / dist / fixtures）");

// ─────────────────────────────────────────────
// ③ **检测 A 的夹具标定**：恰好报 POS-1/2/3；NEG-1..5 一律不报
//    断言按 `MARK:` 标记定位（不硬编码行号）。
// ─────────────────────────────────────────────
{
  const textA = read(FIX_A);
  const hitLines = new Set(findFreshnessAsksProcess([{ file: "fixtures/drift-fixture.ts", text: textA }]).map((h) => h.line));
  const pos1 = markedLines(textA, "MARK:POS-1"), pos2 = markedLines(textA, "MARK:POS-2"), pos3 = markedLines(textA, "MARK:POS-3");
  for (const [name, lines] of [["POS-1", pos1], ["POS-2", pos2], ["POS-3", pos3]] as [string, number[]][]) {
    assert.equal(lines.length, 1, `夹具里 ${name} 标记应唯一`);
    assert.ok(hitLines.has(lines[0]), `${name}（第 ${lines[0]} 行）应被报出；实际报了 ${JSON.stringify([...hitLines])}`);
  }
  for (const name of ["NEG-1", "NEG-2", "NEG-3", "NEG-4", "NEG-5"]) {
    const lines = markedLines(textA, `MARK:${name}`);
    assert.equal(lines.length, 1, `夹具里 ${name} 标记应唯一`);
    assert.ok(!hitLines.has(lines[0]), `${name}（第 ${lines[0]} 行）**不得**被报出（假阳）`);
  }
  assert.equal(hitLines.size, 3, `检测 A 在夹具上应恰好报 3 条；实际 ${hitLines.size}：${JSON.stringify([...hitLines])}`);
  console.log(`✔ ③ 检测 A 夹具标定：恰好报 POS-1/2/3（行 ${[pos1[0], pos2[0], pos3[0]].join(", ")}），NEG-1..5 全不报`);
}

// ─────────────────────────────────────────────
// ④ **检测 A 的真历史标定（最强的一组）**：git 里的修复前代码
// ─────────────────────────────────────────────
{
  const before = gitShow("0c4e06b", "core/writer-materialize.ts");
  const after = read(join(repoRoot, "core", "writer-materialize.ts"));
  const hitBefore = findFreshnessAsksProcess([{ file: "core/writer-materialize.ts", text: before }]);
  const hitAfter = findFreshnessAsksProcess([{ file: "core/writer-materialize.ts", text: after }]);
  assert.deepEqual(hitBefore.map((h) => h.line).sort((a, b) => a - b), [41, 215],
    `修复前应报 :41 与 :215 两条；实际 ${JSON.stringify(hitBefore.map((h) => h.line))}`);
  assert.ok(hitBefore.every((h) => /Ensure|ensure/.test(h.detail)), "两条都应落在 ensure* 函数上（函数名收窄生效）");
  assert.equal(hitAfter.length, 0,
    `修复后不得报；实际 ${JSON.stringify(hitAfter.map((h) => `${h.line}:${h.snippet.slice(0, 80)}`))}`);
  console.log("✔ ④ **真历史标定**：修复前（0c4e06b）报 2 条（:41 / :215）；当前版本报 0 条 ⇒ 抓得到真缺陷、且不误报已修的");
}

// ─────────────────────────────────────────────
// ⑤ 检测 B 的夹具标定：跨文件的 `phase === "ghost"` 应报；只在本文件的键不报
//    v1.15.32 起键的形态是「接收者.字段名=值」（原为「字段名=值」），且 `?.` 与 `.` 归一。
// ─────────────────────────────────────────────
{
  const files = [
    { file: "fixtures/drift-fixture.ts", text: read(FIX_A) },
    { file: "fixtures/drift-fixture-b.ts", text: read(FIX_B) },
  ];
  const hits = findPredicateExpressedTwice(files);
  const keys = new Set(hits.map((h) => (h.detail.match(/`([^`]+)`/) || [])[1]));
  assert.ok(keys.has("p.phase=ghost"), `应报跨文件的 p.phase=ghost；实际 ${JSON.stringify([...keys])}`);
  assert.ok(!keys.has("p.only=here"), "只在一个文件出现的 p.only=here 不得报");
  assert.ok(!keys.has("p.only2=elsewhere"), "只在一个文件出现的 p.only2=elsewhere 不得报");
  const sharedFiles = [...new Set(hits.filter((h) => h.detail.includes("p.phase=ghost")).map((h) => h.file))];
  assert.equal(sharedFiles.length, 2, "p.phase=ghost 应在两个文件里各报一条（便于定位两侧）");
  // 反向：夹具里每条 p.phase=ghost 的位置都能对上标记
  const m1 = markedLines(read(FIX_A), "MARK:B-SHARED")[0];
  const m2 = markedLines(read(FIX_B), "MARK:B-SHARED")[0];
  const reported = hits.filter((h) => h.detail.includes("p.phase=ghost")).map((h) => h.line);
  assert.deepEqual(reported.sort((a, b) => a - b), [m1, m2].sort((a, b) => a - b), "报出的行号应与两处标记一致");
  console.log(`✔ ⑤ 检测 B 夹具标定：跨文件 p.phase=ghost 报出两侧（行 ${m1} / ${m2}），单文件键不报（共 ${hits.length} 条线索）`);

  // ⑤b **可选链不漏报**（v1.15.32 修的漏报的回归锁）：一侧 `x?.flag`、另一侧 `x.flag`
  //    —— 同一条访问路径 ⇒ 必须归一成**同一个键** `x.flag=join` 并在两侧各报一条。
  assert.ok(keys.has("x.flag=join"),
    `\`x?.flag\` 与 \`x.flag\` 必须归到同一个键 x.flag=join（旧正则因字符集不含 \`?\` 而漏报）；实际 ${JSON.stringify([...keys])}`);
  const optFiles = [...new Set(hits.filter((h) => h.detail.includes("x.flag=join")).map((h) => h.file))];
  assert.equal(optFiles.length, 2, "x.flag=join 应跨两个夹具文件各报一条");
  const o1 = markedLines(read(FIX_A), "MARK:B-OPT")[0];
  const o2 = markedLines(read(FIX_B), "MARK:B-OPT")[0];
  const optLines = hits.filter((h) => h.detail.includes("x.flag=join")).map((h) => h.line);
  assert.deepEqual(optLines.sort((a, b) => a - b), [o1, o2].sort((a, b) => a - b), "可选链两侧报出的行号应与标记一致");
  console.log(`✔ ⑤b 可选链与点号归一到同一个键（行 ${o1} / ${o2}）—— v1.15.32 修的漏报类有回归锁`);
}

// ─────────────────────────────────────────────
// ⑥ 在**真仓库**上跑一次：判据重复是线索；**新鲜度必须是 0 条**（ADR-0069 刚修完的回归护栏）
// ─────────────────────────────────────────────
{
  const walk = (d: string, out: string[] = []): string[] => {
    let es: any[]; try { es = readdirSync(d, { withFileTypes: true }); } catch { return out; }
    for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".ts")) out.push(p); }
    return out;
  };
  const prod = walk(repoRoot, [])
    .map((f) => f.slice(repoRoot.length + 1).replace(/\\/g, "/"))
    .filter(isProductionPath)
    .map((rel) => ({ file: rel, text: readFileSync(join(repoRoot, rel), "utf8") }));
  const fresh = findFreshnessAsksProcess(prod);
  const preds = findPredicateExpressedTwice(prod);
  assert.equal(fresh.length, 0,
    `当前仓库不应再有「新鲜度只看进程」（ADR-0069 已修）；实际 ${fresh.length} 条：${JSON.stringify(fresh.map((h) => `${h.file}:${h.line}`))}`);
  console.log(`✔ ⑥ 真仓库（${prod.length} 个生产文件）：新鲜度线索 **0**（回归护栏）· 判据重复线索 ${preds.length} 条（线索级，需人工复核）`);
  const topKeys = new Map<string, number>();
  for (const h of preds) { const k = (h.detail.match(/`([^`]+)`/) || [])[1] || ""; topKeys.set(k, (topKeys.get(k) || 0) + 1); }
  const shown = [...topKeys].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (shown.length) console.log(`     出现最多的键（前 8）：${shown.map(([k, n]) => `${k}×${n}`).join(" · ")}`);
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 检测 A 只认**裸 `return;`** 的守卫 —— `return <值>` 形式的跳过（若将来出现）不会被抓；");
console.log("  · **跨行**守卫（`if (` / 换行 / `cond` / `) return;`）不抓（按行匹配）；");
console.log("  · 「进程内集合」的识别靠 `core.<field>` 前缀 + 本文件 `new Set/Map` + 属性名含 Map/Set/Cache/Dirty/Warm/Seen/Visited；");
console.log("    换个持有方式（模块级单例、`WeakMap` 别处注入）会漏；");
console.log("  · 函数名收窄靠 `DERIVED_ARTIFACT_FN` 正则 —— 派生件函数若取名不含这些词，会漏；");
console.log("  · 检测 B 只答「同一 `字段=字面量` 出现在多个文件」，**答不了「两处口径是否一致」**");
console.log("    （那需要类型/语义分析，而它正是 ADR-0063 里 D5 的真正病根）⇒ 该项**一律人工复核**，不得据它定罪。");
console.log("ALL PASS ✅");
