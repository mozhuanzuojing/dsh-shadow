#!/usr/bin/env node
// dsh-shadow —— tools/audit-wiring.ts：**接线审计** CLI（找「机制存在但没人调用」与「分支永不可达」）。
//
// 为什么需要它（本仓已实测到三处同类缺陷，都是「机制是对的、接线断了」，且**单元测试全绿**）：
//   ① v1.15.13：`readQueries` 漏挂 `toolset` → 整块台账三个版本无入口
//      （三个既有测试全**直接 import 执行函数**，从不走 dispatch —— 断的是接线，不是执行）
//   ② v1.15.15：`fsExists` 无条件拼 `${ws}/${rel}` → 绝对路径证据被判失效；目录引用同类
//   ③ v1.15.18：`meta.status === "superseded"` 三条分支**无写入者**
//      （唯一写入者是测试夹具）
//
// 用法：node tools/audit-wiring.ts [仓库根]
// 纯静态、无 LLM、无网络、不改任何文件。
//
// **本工具的结论必须经标定**：见 `tools/audit-wiring.selftest.ts`。
// 一个抓不到已知缺陷的检测器，报「0 findings」是没有意义的（本仓纪律：先证工具，再用工具）。
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { collectComparisons, hasProducer, findOrphanComparisons, isProductionPath, countCallSites, importedBy, exportsOf, pairedExport, bareMentions, maskStrings } from "./audit-wiring.lib.ts";

const ROOT = process.argv[2] || ".";
const walk = (d, out = []) => {
  let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
};

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p) => { try { return readFileSync(p, "utf8"); } catch { return ""; } };

// 按**路径分段**分类（见 lib 里 isProductionPath 的说明：正则判法曾漏掉顶层 test/）
const allTs = walk(ROOT, []);
const prodPaths = allTs.filter((f) => isProductionPath(rel(f)));
/**
 * ⚠ **「测试」这一侧必须显式限定**（v1.15.43 修，来自 T2 分诊的标定发现）：
 * 原写法是 `!isProductionPath(...)` —— 那会把 `dist/` 下的 `.d.ts` 与 `node_modules/` 下的 `.d.ts` **也算成测试**，
 * 于是「测试引用 N」是**虚高**的（实测：`hasNoUpgradeApi` 的 1 全来自 `dist/agency/guards.d.ts`；
 * `apply` 的 230 里 15 来自 `node_modules` 里的 `lib.dom.d.ts`）⇒ 分诊时会把「零测试引用」读成「已被测试覆盖」。
 * 现判据改成**只认 `test/` 下的文件**；`dist/` 与 `node_modules/` **两边都不算**（它们是产物/依赖，不是断言）。
 */
const isTestPath = (p: string) => p === "test" || p.startsWith("test/");
const testPaths = allTs.filter((f) => isTestPath(rel(f)));
const prod = prodPaths.map((f) => ({ file: rel(f), text: read(f) }));
const testText = testPaths.map((f) => read(f)).join("\n");

console.log(`生产源码 ${prod.length} 个 · 测试 ${testPaths.length} 个（判据：生产 = isProductionPath；测试 = 仅 test/ 下）`);
console.log("");

// ═══════════ A. 导出但生产代码**无调用点** ═══════════
// **v3 收窄**：只对 **函数 / 类** 判「调用点」—— 常量的「调用点」概念不成立
//   （`SHADOW_ROOT + "/x"` 是当值用，没有括号），v2 因此把大批常量误报成「未接线」。
//   本仓真实案例 `ChangeSet` 是 **class**，收窄后仍会被抓到（见 selftest 的已知答案断言）。
//
// **v4 分桶**（v1.15.36）：不再吐「一个 33 条的大堆」，而是按**性质**分四桶 ——
//   ② 间接调用与 ③ 平行 API 都**无法靠文本分析彻底解决**，故工具**不伪造精度**，只如实分类。
//   但 ② 能再切一刀：`bareMentions` 区分「导入之外还有提及」（间接调用/类型位置 ⇒ 正当）
//   与「导入之外**零提及**」（**未使用的导入** ⇒ 真可疑）。实测把 A2 的 8 条缩到 1 条。
const exportRe = /^export\s+(?:const\s+(\w+)\s*=\s*(?:async\s*)?\(|function\s+(\w+)|async\s+function\s+(\w+)|class\s+(\w+))/gm;
/** 测试侧引用计数：**同样走 `maskStrings`**（否则注释/字符串里的提及会虚增该数）。 */
const testMasked = maskStrings(testText);
const rows = [];
for (const { file, text } of prod) {
  const siblings = () => exportsOf(text);
  for (const m of text.matchAll(exportRe)) {
    const name = m[1] || m[2] || m[3] || m[4];
    if (!name) continue;
    const { sites } = countCallSites(prod, name);
    if (sites !== 0) continue;
    const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const imports = importedBy(prod, name);
    const pair = pairedExport(siblings(), name);
    const bare = bareMentions(prod, name, file);
    rows.push({
      name, file,
      mentions: (testMasked.match(re) || []).length,
      imports, pair,
      bare: bare.count, bareWhere: bare.where,
      // 优先级：A2b（导入即闲置）> A1（零引用）> A2a（间接调用）> A3（平行 API）
      bucket: pair ? "A3" : !imports.length ? "A1" : bare.count === 0 ? "A2b" : "A2a",
    });
  }
}
rows.sort((a, b) => a.bucket.localeCompare(b.bucket) || a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
console.log("═".repeat(96));
console.log("A. 导出但**生产代码无直接调用点**（线索：仅测试消费 / 忘了接线 / 外部公开面）");
console.log("═".repeat(96));
console.log("  分桶（v1.15.36）：**性质不同，复核方式也不同** —— 按下面顺序看，越靠前越可疑。");
console.log("");
const BUCKETS = {
  A2b: ["A2b. **导入即闲置**（被 import，但导入行之外**零提及**）", "最可疑之一：很可能是「忘了接线」或残留导入 —— **先看这桶**"],
  A1: ["A1. **零引用候选**（既未被 import、也无配对导出）", "可疑：可能真的忘了接线，或纯公开面"],
  A2a: ["A2a. **间接调用/类型位置候选**（被 import 且别处有提及）", "多为经数组/回调间接调用或类型位置 ⇒ **基本是误报**，一般可略过"],
  A3: ["A3. **平行 API 候选**（与同文件另一导出成对，如 `assertX` ↔ `x`）", "「成对导出、只接一半」是**一处决定**，不是 N 处缺陷 ⇒ **基本是误报**，一般可略过"],
};
for (const key of ["A2b", "A1", "A2a", "A3"]) {
  const list = rows.filter((r) => r.bucket === key);
  console.log("─".repeat(96));
  console.log(`${BUCKETS[key][0]} —— ${list.length} 个`);
  console.log(`   ${BUCKETS[key][1]}`);
  if (!list.length) console.log("   （无）");
  for (const r of list) {
    const extra =
      key === "A2b" ? ` ← 仅被 import：${r.imports.join(", ")}`
      : key === "A2a" ? ` ← 提及于：${r.bareWhere.join(", ")}`
      : key === "A3" ? ` ← 配对：${r.pair}`
      : "";
    console.log(`   ${r.name.padEnd(32)} ${r.file.padEnd(44)} 测试引用 ${String(r.mentions).padEnd(4)}${extra}`);
  }
}
console.log("─".repeat(96));
const cnt = (k) => rows.filter((r) => r.bucket === k).length;
console.log(`  小计 ${rows.length} 个（A2b ${cnt("A2b")} · A1 ${cnt("A1")} · A2a ${cnt("A2a")} · A3 ${cnt("A3")}）`);
console.log(`  ⇒ **需人工逐条查的**：A2b ${cnt("A2b")} + A1 ${cnt("A1")} = ${cnt("A2b") + cnt("A1")} 个（其余按已知形态可略过）`);

// ═══════════ B. 只被读、生产代码无写入点的判断值 ═══════════
const orphans = findOrphanComparisons(prod);
console.log("");
console.log("═".repeat(92));
console.log("B. **只被读、生产代码无写入点**的判断值（线索：分支可能永不可达）");
console.log("═".repeat(92));
if (!orphans.length) console.log("  （无）");
for (const o of orphans) console.log(`  ${`${o.field}=${o.value}`.padEnd(34)} 读于 ${o.where.join(", ")}`);
console.log(`  小计 ${orphans.length} 个`);

console.log("");
console.log("判定纪律（**本条最重要**）：以上都是**线索不是结论**。");
console.log("  · **A2b 先看**：A2a/A3 是「已知形态」的误报（间接调用 / 平行 API），A2b 与 A1 才是高发区。");
console.log("  · A 类要逐个看：是「公开面/仅测试用」还是「忘了接线」——本仓已知 3 例属后者。");
console.log("  · B 类要确认「该值是否真无写入者」：可能来自**外部数据**（宿主载荷 / 读进来的 JSON /");
console.log("    审批服务的返回值），此时分支可达，只是不由本仓生产。**不得凭静态分析定罪**。");
console.log("  · 本工具只做**单行**窗口匹配，跨行的对象构造可能漏判 —— 命中项一律人工复核。");
console.log("  · **字符串/注释里的 `Name(` 已不计入调用点**（v1.15.36 修的真盲区：旧实现会把");
console.log("    `\"Foo(1)\"` 算成调用点 ⇒ 漏报）。**模板串 `${…}` 里的代码仍计**（那是真调用）。");
console.log("  · ⚠ **已知盲区（未修）**：数不出**传递性死代码** —— 若某符号的调用点**全在另一段死代码里**");
console.log("    （实例：`notRevoked` 的 2 个调用点都在零调用的 `assertNotRevoked` 内），它**不会出现在 A 段**。");
console.log("    这需要调用图/可达性分析 ⇒ 见 `BACKLOG.md` T10。");
console.log("");
console.log("**工具自身经标定**：node tools/audit-wiring.selftest.ts");
