// dsh-shadow —— 「可准入」判据**只有一个源头**（v1.15.32 / ADR-0070 T5）。
//
// 背景（T5 第 4 次复核产出的**真漂移**，与 ADR-0063 / D5 同族)：
//   `Representation 只接受 supported RealityClaim` 这条判据在**三处**被表达，而
//   `world/guard/claim-admission.ts` 里**早就写好了唯一判据源** `isAdmissibleClaim`：
//     · world/guard/claim-admission.ts:6   `isAdmissibleClaim = (c) => c?.status === "supported"`  ← 唯一判据源
//     · world/builder/representation-builder.ts:9  手写 `c.status === "supported"`（**同文件已 import 该模块！**）
//     · query/world.ts:42                  手写 `c.status === "supported"`
//   审计工具当时**漏报了第三处**（`claim-admission.ts` 自己）—— 因为它的正则字符集不含 `?`，
//   `c?.status` 只能从 `status` 起匹配 ⇒ 键退化成 `status=supported`，与另两处归不到一起。
//   本测试同时锁住两件事：① 判据不再分叉；② **检测器真的会报警**（正对照 ④）。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isAdmissibleClaim } from "../dist/world/guard/claim-admission.js";
import { buildRepresentationGraph } from "../dist/world/builder/representation-builder.js";
// **复用审计工具自己的注释剥离器**，不另写一份。
// 为什么必须复用（本条是自曝）：本测试第一版自己写了 `line.replace(/\/\/.*$/, "")`，
//   而仓库的 `.ts` 是 **CRLF** —— JS 的 `.` **不匹配 `\r`**，故 `.*` 在 `\r` 前停住、`$` 匹配不上，
//   整个替换**静默失败**（不报错、不生效），于是注释里的代码被当成真判据 ⇒ 测试假红。
//   更根本的问题：那样做等于把「注释剥离」这条判据**又写了一份** —— 与 ADR-0063/0070 反复记录的
//   「同一逻辑多处表达、其中一处会漂移」同族。工具里那份是**字符状态机**（正确处理 CRLF / 字符串 /
//   正则字面量），且它保证**行号不漂移**（`audit-drift.selftest.ts` ① 有断言）。
import { stripComments } from "../tools/audit-drift.lib.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 生产源码 = 排除编译产物 / 测试面 / 工具面（与 audit-drift 的 EXCLUDE 同口径）。 */
const isProductionPath = (rel: string): boolean =>
  !rel.split("/").some((s) => ["node_modules", "dist", "test", "tests", "fixtures", "__tests__", "tools"].includes(s));

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

/** 扫「把 status 与 supported 做等值比较」的位置。**返回 `文件:行`**，便于漂移时直接定位。
 *  注释剥离交给工具的那一份（`stripComments`），本函数只负责逐行匹配。 */
const scanSupportedComparisons = (files: { file: string; text: string }[]): string[] => {
  const hits: string[] = [];
  for (const { file, text } of files) {
    // 先整体剥注释（保持行号），再按行匹配 —— 不自己写正则去 `//`。
    stripComments(text).split(/\r?\n/).forEach((line, i) => {
      if (/status\s*===\s*"supported"/.test(line)) hits.push(`${file}:${i + 1}`);
    });
  }
  return hits;
};

const prod = walk(repoRoot)
  .map((f) => f.slice(repoRoot.length + 1).replace(/\\/g, "/"))
  .filter(isProductionPath)
  .map((rel) => ({ file: rel, text: readFileSync(join(repoRoot, rel), "utf8") }));

// ── ① 唯一判据源的语义（含「没有对象」的边界）──
{
  assert.equal(isAdmissibleClaim({ status: "supported" }), true, "supported 可准入");
  for (const s of ["candidate", "unstable", "rejected"]) {
    assert.equal(isAdmissibleClaim({ status: s }), false, `${s} 不得准入`);
  }
  assert.equal(isAdmissibleClaim(null), false, "null 不得准入（可选链，不抛）");
  assert.equal(isAdmissibleClaim(undefined), false, "undefined 不得准入（可选链，不抛）");
  console.log("✔ ① 判据语义：仅 supported 准入；candidate/unstable/rejected 与 null/undefined 均拒绝");
}

// ── ② 棘轮：生产源码里 `status === "supported"` 的**唯一**比较点必须是判据源自己 ──
{
  const hits = scanSupportedComparisons(prod);
  const SOURCE = "world/guard/claim-admission.ts";
  const offenders = hits.filter((h) => !h.startsWith(SOURCE));
  assert.equal(offenders.length, 0,
    `「只接受 supported」的判据必须只存在于 ${SOURCE}；以下位置又分叉了一份：\n  ${offenders.join("\n  ")}\n` +
    `（改用 \`isAdmissibleClaim\` —— 它是这条判据的唯一源头）`);
  assert.ok(hits.some((h) => h.startsWith(SOURCE)),
    `判据源自身应有一条比较（否则本测试是空转：扫描函数可能根本没工作）；实际 ${JSON.stringify(hits)}`);
  console.log(`✔ ② 棘轮：全仓生产源码里该判据只剩 ${hits.length} 处，即判据源自身（${hits[0]}）`);
}

// ── ③ 行为：Representation 只收 supported（反向不变量 + subject 去重）──
{
  const claim = (over: any) => ({
    id: "rc-x", subject: "S", status: "candidate",
    confidence: { alternativeSurvival: 0.6 }, temporalContext: "2026-09", validationHistory: [],
    ...over,
  });
  const claims = [
    claim({ id: "rc-1", subject: "A", status: "supported" }),
    claim({ id: "rc-2", subject: "B", status: "candidate" }),
    claim({ id: "rc-3", subject: "C", status: "unstable" }),
    claim({ id: "rc-4", subject: "D", status: "rejected" }),
    claim({ id: "rc-5", subject: "A", status: "supported" }), // 同 subject ⇒ 只产出一个 object
  ];
  const g: any = buildRepresentationGraph(claims as any, []);
  assert.deepEqual(g.sourceClaims, ["rc-1", "rc-5"], "**只有** supported 的 claim 进 sourceClaims");
  assert.equal(g.objects.length, 1, "objects 按 subject 去重（同 subject 只产一个 Representation）");
  // 反向不变量：非 supported 一条都不得混进来（否则本测试测的是「凡 claim 都收」）
  for (const id of ["rc-2", "rc-3", "rc-4"]) {
    assert.ok(!g.sourceClaims.includes(id), `${id} 非 supported，不得进 Representation`);
  }
  assert.deepEqual(g.relations, [], "关系绝不自动生成（需显式 RelationHypothesis）");
  console.log("✔ ③ 行为：channel 只收 supported（反向不变量：candidate/unstable/rejected 一条不进；同 subject 去重）");
}

// ── ④ 正对照：证明 ② 的扫描器**真的会报警**（否则那是一条永远绿的断言）──
{
  const fake = [
    { file: "world/guard/claim-admission.ts", text: `export const isAdmissibleClaim = (c: any) => c?.status === "supported";` },
    { file: "world/builder/other.ts", text: `const ok = claims.filter((c) => c.status === "supported");` },
    { file: "query/other.ts", text: `const ok = claims.find((c) => c?.status === "supported");` },
    { file: "notes.ts", text: `// 说明：这里曾写 status === "supported"（注释不算判据）` },
  ];
  const hits = scanSupportedComparisons(fake);
  assert.deepEqual(hits, ["world/guard/claim-admission.ts:1", "world/builder/other.ts:1", "query/other.ts:1"],
    "正向对照：分叉两处 + 判据源一处都应被抓到；**行注释不算判据**");
  const offenders = hits.filter((h) => !h.startsWith("world/guard/claim-admission.ts"));
  assert.equal(offenders.length, 2, "正向对照：两处分叉必须被判为 offenders");
  console.log("✔ ④ 正对照：扫描器能抓到分叉（含 `?.` 写法），且不把注释误当判据");
}

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · ② 是**源码级棘轮**（正则），不是类型级 —— 换个写法（如 `\"supported\" === c.status`、变量间接比较）会漏；");
console.log("    它挡的是「同一判据再被手写一份」这一最可能的回归，而不是全部可能形态；");
console.log("  · `query/world.ts` 的 subject 选择走的是同一判据源，但它的端到端（read_shadow mode:\"world\"）未在本文件覆盖。");
console.log("ALL PASS ✅");
