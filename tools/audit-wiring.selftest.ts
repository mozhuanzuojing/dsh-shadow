// dsh-shadow —— tools/audit-wiring.selftest.ts：接线审计工具的**标定测试**。
//
// 为什么必须有它：本工具在真仓库上曾报「0 findings」，而我**确证过**至少有 3 处不可达分支。
// 一个不会报警的检测器，报「0」是**没有意义的** —— 必须先证明它抓得到已知缺陷，再用它下结论。
// （本仓纪律：先证工具，再用工具；与 v1.15.16 的检索评测同一态度。）
//
// 夹具 `tools/fixtures/wiring-fixture.ts` 有 5 个**已知答案**的字段-值组合：
//   可达：status=ok（直写）、status=bad（**三元写**）、kind=y（**赋值写**）
//   不可达：phase=ghost（无生产者）、kind=phantom（**有同名字面量但生产成别的字段** ← v2 漏报点）
//
// 期望：抓出且仅抓出那 2 个不可达。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { collectComparisons, hasProducer, findOrphanComparisons, isProductionPath, countCallSites } from "./audit-wiring.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(here, "fixtures", "wiring-fixture.ts");
const files = [{ file: "wiring-fixture.ts", text: readFileSync(fixturePath, "utf8") }];

// ─────────────────────────────────────────────
// ① 收集比较点：夹具里应恰好有 5 个
// ─────────────────────────────────────────────
const cmps = collectComparisons(files);
const keys = [...cmps.keys()].sort();
assert.deepEqual(keys, ["kind=phantom", "kind=y", "phase=ghost", "status=bad", "status=ok"],
  `比较点集合不对：${JSON.stringify(keys)}`);
console.log(`✔ ① 收集到 5 个比较点：${keys.join(" · ")}`);

// ─────────────────────────────────────────────
// ② 生产者判定：3 个可达必须**认出**有写入者（含**三元写**与**赋值写** —— v1 漏这几种）
// ─────────────────────────────────────────────
for (const [field, value, why] of [
  ["status", "ok", "直写"],
  ["status", "bad", "**三元写**（v1 误报点）"],
  ["kind", "y", "**赋值写**（三元）"],
]) {
  const hits = hasProducer(files, field, value);
  assert.ok(hits.length > 0, `${field}=${value}（${why}）应认出有生产者，实际 0 —— 检测器误报`);
  console.log(`✔ ② ${field}=${value} 认出生产者（${why}）：${hits.join(", ")}`);
}

// ─────────────────────────────────────────────
// ③ 不可达必须**认不出**生产者，且**不得**被同名字面量的跨字段生产所干扰
//    `kind=phantom` 是 v2 的漏报点：夹具里 `{ verdict: "phantom" }` 生产了同名**字面量**，
//    但字段是 `verdict` 不是 `kind` ⇒ v3 必须仍判 `kind` 无生产者。
// ─────────────────────────────────────────────
assert.equal(hasProducer(files, "phase", "ghost").length, 0, "phase=ghost 应无生产者");
assert.equal(hasProducer(files, "kind", "phantom").length, 0,
  "kind=phantom 应无生产者 —— 跨字段同名字面量（verdict: \"phantom\"）不得算作 kind 的写入者");
console.log("✔ ③ 两个不可达均正确判为无生产者（含**跨字段同名字面量**的干扰项）");

// ─────────────────────────────────────────────
// ④ 端到端：findOrphanComparisons 恰好报出那 2 个，不报那 3 个
// ─────────────────────────────────────────────
const orphans = findOrphanComparisons(files).map((o) => `${o.field}=${o.value}`).sort();
assert.deepEqual(orphans, ["kind=phantom", "phase=ghost"],
  `应恰好报出 2 个不可达，实际：${JSON.stringify(orphans)}`);
console.log(`✔ ④ 端到端：恰好报出 2 个不可达（${orphans.join(" · ")}），3 个可达全部未误报`);

// ─────────────────────────────────────────────
// ⑤ **调用点计数**：夹具里 2 个无调用点、2 个有（含类实例化与函数调用）
//    本仓真实案例：`ChangeSet` 有 `import type` + 接口签名提名字，却从不实例化 ——
//    v1「数名字出现」的判法漏掉它，故必须按**调用点**判。
// ─────────────────────────────────────────────
assert.equal(countCallSites(files, "Called").sites, 1, "Called 有 1 个调用点");
assert.equal(countCallSites(files, "Built").sites >= 1, true, "Built 有实例化点（new Built()）");
assert.equal(countCallSites(files, "NeverCalled").sites, 0, "NeverCalled 应无调用点");
assert.equal(countCallSites(files, "NeverBuilt").sites, 0,
  "NeverBuilt 应无调用点（只出现在**类型位置**，不得算作调用）");
console.log("✔ ⑤ 调用点计数正确：Called/Built 有调用点，NeverCalled/NeverBuilt 判为 0（含仅类型位置的情形）");

// ─────────────────────────────────────────────
// ⑥ **分类器**必须在**相对路径**下也排除测试（这是本轮抓到的第 3 个工具缺陷）
//    背景：v1 用 `/[\\/]test[\\/]/` 判 —— 要求前导斜杠，而相对路径 `test/x.ts` 无前导斜杠，
//    于是**顶层 test/ 从未被排除**，测试夹具里的 `status: "superseded"` 被当成生产写入者，
//    **恰好掩盖**了本轮要抓的真缺陷。故此处专门锁住分类器行为。
// ─────────────────────────────────────────────
const CASES = [
  ["test/foo.test.ts", false], ["./test/foo.test.ts", false], ["tools/fixtures/x.ts", false],
  ["core/lifecycle.ts", true], ["query/query.ts", true], ["tools/audit-wiring.ts", true],
  ["node_modules/x/y.ts", false], ["dist/core/x.js", false], ["a/test/b.ts", false],
];
for (const [p, want] of CASES) {
  assert.equal(isProductionPath(p), want, `isProductionPath(${JSON.stringify(p)}) 应为 ${want}`);
}
console.log(`✔ ⑥ 分类器正确（${CASES.length} 例，含**顶层 test/** 这个曾漏掉、会掩盖真缺陷的形态）`);

// ─────────────────────────────────────────────
// ⑦ 在**真仓库**上跑一次（结果数不做断言：真仓库命中需人工复核）
// ─────────────────────────────────────────────
import { readdirSync } from "node:fs";
const walk = (d, out = []) => {
  let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of es) { const p = join(d, e.name); if (e.isDirectory()) walk(p, out); else if (e.name.endsWith(".ts")) out.push(p); }
  return out;
};
const repoRoot = join(here, "..");
const allTs = walk(repoRoot, []);
const prod = allTs
  .filter((f) => isProductionPath(f.slice(repoRoot.length).replace(/\\/g, "/")))
  .map((f) => ({ file: f.slice(repoRoot.length).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));
const real = findOrphanComparisons(prod);

// **已知答案的真仓库断言**：v1.15.18 确证 `meta.status === "superseded"` 在生产中无写入者
// （唯一写入者是测试夹具）。分类器修好后，工具**必须**把它报出来 —— 否则说明又被掩盖。
const realKeys = real.map((o) => `${o.field}=${o.value}`);
assert.ok(realKeys.includes("status=superseded"),
  `工具应报出已知的 status=superseded（本轮确证的无写入者分支）；实际 keys=${JSON.stringify(realKeys.slice(0, 40))}`);
console.log(`✔ ⑦ 真仓库（B 类）：${prod.length} 个生产文件 → ${real.length} 条线索；**含已知的 status=superseded**（证明不被掩盖）`);

// ─────────────────────────────────────────────
// ⑧ 真仓库的 **A 类已知答案**：`ChangeSet` 有 `import type` + 接口签名提名字，但**从不实例化**
//    （唯一消费者是测试）。按**调用点**判必须报出来 —— 这正是 v1「数名字出现」漏掉的那个。
// ─────────────────────────────────────────────
assert.equal(countCallSites(prod, "ChangeSet").sites, 0,
  `ChangeSet 应无生产调用点；实际 ${countCallSites(prod, "ChangeSet").sites}`);
// 反例：真在用的符号不得被误报
assert.ok(countCallSites(prod, "invalidateProjection").sites > 0, "invalidateProjection 有调用点，不得误报");
assert.ok(countCallSites(prod, "createJsonlProjectionStore").sites > 0, "createJsonlProjectionStore 有调用点，不得误报");
console.log("✔ ⑧ 真仓库（A 类）：ChangeSet 判为无调用点；invalidateProjection / createJsonlProjectionStore 不误报");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 工具只做**单行 200 字符窗口**匹配 —— **跨行**构造的对象（字段与字面量不在同一行）可能漏判；");
console.log("  · 不区分「哪个对象」的字段（无类型分析）：同名字段挂在不同对象上时会混判；");
console.log("  · **A 类精度低**：本仓有意导出了大量**面向测试的包装/便利 API**（如 `assert*` 包装函数，");
console.log("    其底层判定在生产里确有被使用）——故 A 类命中多数是「仅测试消费」，属误报；");
console.log("  · 故命中项一律**人工复核**，不得据工具输出直接定罪。");
console.log("ALL PASS ✅");
