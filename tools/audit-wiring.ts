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
import { collectComparisons, hasProducer, findOrphanComparisons, isProductionPath, countCallSites } from "./audit-wiring.lib.ts";

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
const testPaths = allTs.filter((f) => !isProductionPath(rel(f)));
const prod = prodPaths.map((f) => ({ file: rel(f), text: read(f) }));
const testText = testPaths.map((f) => read(f)).join("\n");

console.log(`生产源码 ${prod.length} 个 · 测试 ${testPaths.length} 个`);
console.log("");

// ═══════════ A. 导出但生产代码**无调用点** ═══════════
// **v3 收窄**：只对 **函数 / 类** 判「调用点」—— 常量的「调用点」概念不成立
//   （`SHADOW_ROOT + "/x"` 是当值用，没有括号），v2 因此把大批常量误报成「未接线」。
//   本仓真实案例 `ChangeSet` 是 **class**，收窄后仍会被抓到（见 selftest 的已知答案断言）。
const exportRe = /^export\s+(?:const\s+(\w+)\s*=\s*(?:async\s*)?\(|function\s+(\w+)|async\s+function\s+(\w+)|class\s+(\w+))/gm;
const rows = [];
for (const { file, text } of prod) {
  for (const m of text.matchAll(exportRe)) {
    const name = m[1] || m[2] || m[3] || m[4];
    if (!name) continue;
    const { sites } = countCallSites(prod, name);
    if (sites === 0) {
      const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
      rows.push({ name, file, mentions: (testText.match(re) || []).length });
    }
  }
}
rows.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
console.log("═".repeat(96));
console.log("A. 导出但**生产代码无调用点**（线索：仅测试消费 / 忘了接线 / 外部公开面）");
console.log("═".repeat(96));
if (!rows.length) console.log("  （无）");
for (const r of rows) console.log(`  ${r.name.padEnd(34)} ${r.file.padEnd(46)} 测试引用 ${r.mentions}`);
console.log(`  小计 ${rows.length} 个`);

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
console.log("  · A 类要逐个看：是「公开面/仅测试用」还是「忘了接线」——本仓已知 3 例属后者。");
console.log("  · B 类要确认「该值是否真无写入者」：可能来自**外部数据**（宿主载荷 / 读进来的 JSON /");
console.log("    审批服务的返回值），此时分支可达，只是不由本仓生产。**不得凭静态分析定罪**。");
console.log("  · 本工具只做**单行**窗口匹配，跨行的对象构造可能漏判 —— 命中项一律人工复核。");
console.log("");
console.log("**工具自身经标定**：node tools/audit-wiring.selftest.ts");
