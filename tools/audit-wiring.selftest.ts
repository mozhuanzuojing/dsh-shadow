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
import { collectComparisons, hasProducer, findOrphanComparisons, isCallerCorpusPath, countCallSites, maskStrings, importedBy, exportsOf, pairedExport, bareMentions, bucketOf, isTestPath } from "./audit-wiring.lib.ts";
import { isProductModulePath } from "./audit-drift.lib.ts";

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
  assert.equal(isCallerCorpusPath(p), want, `isCallerCorpusPath(${JSON.stringify(p)}) 应为 ${want}`);
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
  .filter((f) => isCallerCorpusPath(f.slice(repoRoot.length).replace(/\\/g, "/")))
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

// ─────────────────────────────────────────────
// ⑨ **字符串里的 `Name(` 不得被算成调用点**（v1.15.36 修的真盲区）
//
// 背景（**实测推翻了原先的记账**）：ADR-0062 补记曾把 A 类噪声成因记为
// 「调用点只在**注释**里」。逐条实测后事实是：
//   · 注释里 `Foo(`      → 旧实现已得 0（`countCallSites` 早已 `stripComments`）⇒ **不是盲区**；
//   · **字符串里 `Foo(`** → 旧实现得 **1** ⇒ 把死代码看成活的 ⇒ **漏报**（比误报危险）；
//   · 块注释 / 行注释         → 0（已正确）。
// 故真正的盲区是**字符串**，方向是**漏报**，位置也与原记账不同。本组锁住修复。
// ─────────────────────────────────────────────
{
  const one = (text: string, name: string) => countCallSites([{ file: "f.ts", text }], name).sites;
  // ① 字符串字面量里的 `Foo(` 不得计入（**这就是修掉的那个盲区**）
  assert.equal(one(`export const s = "Foo(1)";\nexport const Foo = (x: number) => x;\n`, "Foo"), 0,
    "字符串里的 `Foo(` 不得算作调用点（旧实现算 1 ⇒ 漏报）");
  // ② 单引号同理
  assert.equal(one(`export const s = 'Foo(1)';\nexport const Foo = (x: number) => x;\n`, "Foo"), 0, "单引号字符串同理");
  // ③ 注释（原来就正确，作为**反向不变量**锁住，防回归）
  assert.equal(one(`// Foo(1)\nexport const Foo = (x: number) => x;\n`, "Foo"), 0, "行注释里不得计入");
  assert.equal(one(`/* Foo(1) */\nexport const Foo = (x: number) => x;\n`, "Foo"), 0, "块注释里不得计入");
  // ④ **反向不变量**：模板串 `${…}` 里的是**真调用**，抹掉它会制造新的漏报
  assert.equal(one("export const s = `v=${Foo(1)}`;\nexport const Foo = (x: number) => x;\n", "Foo"), 1,
    "模板串 ${…} 里的 `Foo(1)` 是**真调用**，必须仍计入（不得误伤）");
  // ⑤ 模板串的**字面部分**不算
  assert.equal(one("export const s = `Foo(1)`;\nexport const Foo = (x: number) => x;\n", "Foo"), 0,
    "模板串的字面部分不算调用点");
  // ⑥ 转义引号不破坏状态机
  assert.equal(one('export const s = "a\\"Foo(1)";\nexport const Foo = (x: number) => x;\n', "Foo"), 0,
    "转义引号不得让状态机提前闭合");
  // ⑦ **行号不漂移**：掩码必须保行数（命中位置要能回溯到真实行）
  const src = "/* 块\n注释 */\nconst a = \"x\";\n// 行注释\nconst b = 1;\n";
  assert.equal(maskStrings(src).split("\n").length, src.split("\n").length,
    "maskStrings 必须保持行数一致（否则报出的行号会漂）");
  console.log("✔ ⑨ 字符串里的 `Name(` 不再算调用点（真盲区已修）；注释仍不计；**模板 `${…}` 里的真调用未误伤**");
}

// ─────────────────────────────────────────────
// ⑩ **A 类分桶**（v1.15.36）：间接调用 / 平行 API 的判定面（结构上无法靠文本分析解决）
// ─────────────────────────────────────────────
{
  const inline = [
    { file: "g.ts", text: [
      "export const notRevoked = (c: any) => c.revoked !== true;",
      "export const assertNotRevoked = (c: any) => ({ ok: notRevoked(c) });",
      "export const indirect = (r: any) => r.ok;",
      "export const orphan = () => 1;",
    ].join("\n") },
    { file: "use.ts", text: [
      "import { indirect } from './g.ts';",
      "const guards = [indirect];",
      "export const run = (r: any) => { for (const g of guards) g(r); };",
    ].join("\n") },
  ];
  // 被 import 但无直接调用点 ⇒ A2（间接调用候选）
  assert.deepEqual(importedBy(inline, "indirect"), ["use.ts"], "indirect 应被判「被 use.ts import」");
  assert.equal(countCallSites(inline, "indirect").sites, 0, "indirect 无直接调用点（走了数组间接调用）");
  // 零引用 ⇒ A1
  assert.deepEqual(importedBy(inline, "orphan"), [], "orphan 未被 import");
  assert.equal(pairedExport(exportsOf(inline[0].text), "orphan"), undefined, "orphan 无配对导出");
  // 成对导出 ⇒ A3（双向）
  const names = exportsOf(inline[0].text);
  assert.deepEqual(names.sort(), ["assertNotRevoked", "indirect", "notRevoked", "orphan"], "应抽到 4 个导出");
  assert.equal(pairedExport(names, "assertNotRevoked"), "notRevoked", "assertX 应配到 X");
  assert.equal(pairedExport(names, "notRevoked"), "assertNotRevoked", "X 应反向配到 assertX");
  assert.equal(pairedExport(names, "orphan"), undefined, "无配对的不得硬凑");
  console.log("✔ ⑩ 分桶判定：被 import 且零裸提及→A2b、零引用→A1、被 import 且有提及→A2a、成对导出→A3（双向配对，不硬凑）");
}

// ─────────────────────────────────────────────
// ⑪ 分桶判据**真的在判**（v1.15.58 重写）
//
// 旧版这一节是**同义反复**：它在测试内重写了一遍产品侧的分桶 ternary，再断言
// 「四桶之和 = A 段总数」—— 分桶值由同一段代码赋出，和必然成立；各桶断言也逐字复述那几个条件。
// 于是**把产品侧的分桶改成任何东西，本测试照样全绿**（它验证的是自己那份拷贝）。
// 一条「改坏了也不会红」的标定测试比没有测试更坏：它给的是**虚假的确定性**。
//
// 现在改为直接调用产品判据 `bucketOf`（从 CLI 搬进 lib，两边共用），并且**用反例证明它在判**：
// 每个桶不仅验「分到该桶的符合条件」，还验「条件不满足的**不会**被分进去」。
// ─────────────────────────────────────────────
{
  // ① 判据本身：四个桶各有正例，且**互斥**（同一输入只能落一个桶）
  assert.equal(bucketOf({ pair: "x", imports: ["f"], bare: 0 }), "A3", "有配对 ⇒ A3（优先级最高）");
  assert.equal(bucketOf({ pair: undefined, imports: [], bare: 0 }), "A1", "零引用 ⇒ A1");
  assert.equal(bucketOf({ pair: undefined, imports: ["f"], bare: 0 }), "A2b", "被 import 且零裸提及 ⇒ A2b");
  assert.equal(bucketOf({ pair: undefined, imports: ["f"], bare: 3 }), "A2a", "被 import 且有裸提及 ⇒ A2a");

  // ② **反例：判据被改坏会红**（这是旧版完全缺失的部分）
  //    A1 的条件是「零引用」——`imports` 非空时**不得**落 A1（若实现把条件写反，这里立即红）
  assert.notEqual(bucketOf({ imports: ["f"], bare: 1 }), "A1", "★ 有 import 不得被判 A1");
  //    A2b 的条件是「被 import **且** bare === 0」——bare > 0 时必须落 A2a
  assert.notEqual(bucketOf({ imports: ["f"], bare: 5 }), "A2b", "★ bare>0 不得被判 A2b（否则 A2b 这桶失去意义）");
  //    A3 只在**真配对**时成立
  assert.notEqual(bucketOf({ imports: [], bare: 0 }), "A3", "★ 无配对不得被判 A3");
  //    桶名必须落在四桶之一（防未来加桶却忘了更新统计）
  const all = new Set(["A3", "A1", "A2b", "A2a"]);
  assert.ok(all.has(bucketOf({ pair: "p", imports: [], bare: 0 })), "桶名必须在四桶集合内");

  // ③ 真仓库：每个 A 段条目落桶后**自洽**，且桶内条件与实际数据一致（用产品判据判定）
  const aRows: { name: string; bucket: string; imports: string[]; bare: number }[] = [];
  const exportRe = /^export\s+(?:const\s+(\w+)\s*=\s*(?:async\s*)?\(|function\s+(\w+)|async\s+function\s+(\w+)|class\s+(\w+))/gm;
  for (const { file, text } of prod) {
    for (const m of text.matchAll(exportRe)) {
      const name = m[1] || m[2] || m[3] || m[4];
      if (!name) continue;
      if (countCallSites(prod, name).sites !== 0) continue;
      const imports = importedBy(prod, name);
      const pair = pairedExport(exportsOf(text), name);
      const bare = bareMentions(prod, name, file).count;
      aRows.push({ name, imports, bare, bucket: bucketOf({ pair, imports, bare }) });
    }
  }
  // **语料非空**（ADR-0049：扫描范围错了也要红，而不是「0 条 ⇒ 0 违规 ⇒ 全绿」）
  assert.ok(aRows.length > 0, "★ 真仓库 A 段不得为空（取错根/递归没跟随都会让它变空，那时「全绿」是假的）");
  const cnt = (k: string) => aRows.filter((r) => r.bucket === k).length;
  assert.equal(cnt("A2b") + cnt("A1") + cnt("A2a") + cnt("A3"), aRows.length, "四桶之和必须等于 A 段总数（不得丢线索）");
  // 各桶**互斥性**：桶内不得出现与该桶判据矛盾的条目（这一条若红，说明 bucketOf 与数据口径不一致）
  for (const r of aRows.filter((x) => x.bucket === "A2b")) assert.ok(r.imports.length > 0 && r.bare === 0, `${r.name} 分到 A2b，必须「被 import 且零裸提及」`);
  for (const r of aRows.filter((x) => x.bucket === "A1")) assert.ok(r.imports.length === 0, `${r.name} 分到 A1，必须未被 import`);
  for (const r of aRows.filter((x) => x.bucket === "A2a")) assert.ok(r.imports.length > 0 && r.bare > 0, `${r.name} 分到 A2a，必须「被 import 且有裸提及」`);
  console.log(`✔ ⑪ 分桶判据：四桶正例 + **三条反例**（改坏会红）；真仓库 ${aRows.length} 条全部落桶且自洽`
    + `（A2b ${cnt("A2b")} · A1 ${cnt("A1")} · A2a ${cnt("A2a")} · A3 ${cnt("A3")}）⇒ 需逐条查的 ${cnt("A2b") + cnt("A1")} 个`);
}

// ─────────────────────────────────────────────
// ⑫ **裸提及判据**（盲区 ② 的真判据）：把「导入即闲置」与「间接调用」分开
//    实测（真仓库 A2 候选 4 个）它**恰好切开**：`ledgerMismatch` 裸提及 0（唯一可疑），
//    而 `ChangeSet`/`renderExperience`/`sembleCandidates` 各 1（类型位置 / 回调 / 默认参数，全正当）。
// ─────────────────────────────────────────────
{
  const files = [
    { file: "def.ts", text: "export const used = (x: number) => x;\nexport const idle = (x: number) => x;\n" },
    { file: "use.ts", text: [
      "import { used, idle } from './def.ts';",
      "const guards = [used];",
      "export const run = (r: number) => guards.map((g) => g(r));",
    ].join("\n") },
  ];
  // `used` 在导入行之外**有**裸提及 ⇒ 间接调用候选（正当）
  assert.ok(bareMentions(files, "used", "def.ts").count > 0, "used 在导入之外有提及 ⇒ 不得判为「导入即闲置」");
  // `idle` 除导入行外**零提及** ⇒ 导入即闲置（可疑）
  assert.equal(bareMentions(files, "idle", "def.ts").count, 0,
    "idle 除导入行外零提及 ⇒ 必须判为「导入即闲置」（这是盲区 ② 的真判据）");
  // 定义处那一次不得被算成「使用」
  const onlyDef = [{ file: "d.ts", text: "export const nothing = () => 1;\n" }];
  assert.equal(bareMentions(onlyDef, "nothing", "d.ts").count, 0,
    "只有定义、无人引用 ⇒ 必须为 0（定义处那一次要减掉）");
  console.log("✔ ⑫ 裸提及判据：间接调用（有提及）与导入即闲置（零提及）被正确分开；定义处不计入");
}

// ─────────────────────────────────────────────
// ⑬ `isTestPath`：**这条判据本身**必须被锁住（v1.15.58 从 CLI 搬进 lib + 补标定）
//    它由 v1.15.43 的真缺陷修来（旧写法 `!isCallerCorpusPath(p)` 把 `dist/`、`node_modules/`
//    的 `.d.ts` 也算成「测试引用」⇒ A 段那一列**虚高**，分诊时会把「零测试引用」读成
//    「已被测试覆盖」）。此前它定义在 **CLI**、不在任何 selftest 的覆盖面上 ⇒ 改坏也全绿。
// ─────────────────────────────────────────────
{
  assert.equal(isTestPath("test"), true, "顶层 test 目录自身算测试面");
  assert.equal(isTestPath("test/x.test.ts"), true, "test/ 下算测试面");
  assert.equal(isTestPath("core/x.ts"), false, "生产源码不算测试面");
  assert.equal(isTestPath("dist/core/x.d.ts"), false, "★ 产物**不算**测试面（旧写法在这里虚高）");
  assert.equal(isTestPath("node_modules/pkg/x.d.ts"), false, "★ 依赖**不算**测试面");
  // **反例：必须与旧写法在这些路径上分开**（否则等于没修）
  const legacy = (p: string) => !isCallerCorpusPath(p);
  assert.notEqual(isTestPath("dist/core/x.d.ts"), legacy("dist/core/x.d.ts"),
    "★ 新判据必须与 `!isCallerCorpusPath` 在「产物」上给出不同答案");
  assert.notEqual(isTestPath("node_modules/pkg/x.d.ts"), legacy("node_modules/pkg/x.d.ts"),
    "★ 同上（依赖）");
  console.log("✔ ⑬ isTestPath：test/ 命中 · 产物与依赖**不**命中（与旧写法 `!isCallerCorpusPath` 明确分开）");
}

// ─────────────────────────────────────────────
// ⑭ **两个「路径分类」判据的差异是**刻意**的（v1.15.60 判定 + 锁住）
//
// 事实：`audit-wiring.lib.ts` 的 `isCallerCorpusPath` 与 `audit-drift.lib.ts` 的 `isProductModulePath`
// 差异**只有一处**：`tools/`（wiring 算进「谁可能调用它」，drift 不算「产品模块」）。
// **这不是缺陷而是两种问题**（详见两个 lib 的注释）：问「谁调用它」必须含 CLI；问「产品模块间有无重复判据」必须排除工具。
// 其**已知副作用**是 drift 看不见 `tools/` 内部的分叉（包括它与 wiring 的这处差异本身）。
// 本组断言把这个**约定**锁住：任何一侧的口径漂移都会红。
// ─────────────────────────────────────────────
{
  const probe = [
    "core/x.ts", "query/y.ts", "tools/audit-wiring.ts", "tools/audit-wiring.selftest.ts",
    "test/x.test.ts", "dist/core/x.js", "node_modules/pkg/index.ts", "tools/fixtures/f.ts",
  ];
  const diff = probe.filter((p) => isCallerCorpusPath(p) !== isProductModulePath(p));
  assert.deepEqual(diff, ["tools/audit-wiring.ts", "tools/audit-wiring.selftest.ts"],
    "★ 两份 `isCallerCorpusPath` 的差异必须**恰好**是 `tools/` 下的路径（出现新差异 ⇒ 有人改了一侧口径；改之前请先读两个 lib 的注释）");
  // 无分歧的部分也要锁住：两边都必须排除测试面与产物（防「修一侧时改坏」）
  for (const p of ["test/x.test.ts", "dist/core/x.js", "node_modules/pkg/index.ts"]) {
    assert.equal(isCallerCorpusPath(p), false, `wiring 侧必须排除 ${p}`);
    assert.equal(isProductModulePath(p), false, `drift 侧必须排除 ${p}`);
  }
  console.log("✔ ⑭ 两个路径分类判据：差异恰好是 tools/（两种问题、刻意不同；任一侧漂移即红）");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 工具只做**单行 200 字符窗口**匹配 —— **跨行**构造的对象（字段与字面量不在同一行）可能漏判；");
console.log("  · 不区分「哪个对象」的字段（无类型分析）：同名字段挂在不同对象上时会混判；");
console.log("  · **A 类精度低**：本仓有意导出了大量**面向测试的包装/便利 API**（如 `assert*` 包装函数，");
console.log("    其底层判定在生产里确有被使用）——故 A 类命中多数是「仅测试消费」，属误报；");
console.log("  · 故命中项一律**人工复核**，不得据工具输出直接定罪。");
console.log("ALL PASS ✅");
