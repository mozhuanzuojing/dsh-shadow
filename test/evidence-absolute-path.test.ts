// dsh-shadow —— 证据存在性检查：**绝对 locator 不得被拼上工作区前缀**（v1.15.15 真 bug 回归）
//
// 缺陷（实测）：`fsExists` 无条件做 `${ws}/${rel}`。绝对 locator 因此变成双前缀
//   `D:/project/dsh1/D:/project/wslc1/scripts/x.ps1` → `fs.resolve` 得到不存在的路径 → 判 false。
// 后果：**磁盘上确实存在的文件被判「证据失效」**，进而在召回里 score×0.5 + stale=true、
//   并在 mode:"context" / verifyEvidence 里报「已过时/证据缺失」——**假漂移**。
//
// 为什么这个测试必须存在：本机记忆语料里绝对路径证据很常见（跨项目引用），
//   而该缺陷**不会报错、不会抛异常**，只是安静地把存在的东西说成不存在——
//   既有 41/42 场景测试用的都是相对路径，所以一路全绿。
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { fsExists } from "../dist/evidence/filesystem.js";
import { isAbsoluteLocator } from "../dist/evidence/paths.js";

const here = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(here, "..");                       // dsh-shadow 仓库根
const WS = resolve(here, "..", "..", "..");             // 模拟工作区（D:/project/dsh1）

// 严格 fs：不存在的路径 readText 抛（贴近真实文件系统，才能判 false）
const fs = {
  async resolve(p) { return resolve(p); },
  async readText(p) { return readFileSync(p, "utf8"); },
  async listDir(p) { return readdirSync(p, { withFileTypes: true }); },
};

// ─────────────────────────────────────────────
// ① 绝对路径：磁盘上存在 → 必须判 true（**修复前此断言红**）
// ─────────────────────────────────────────────
const absExisting = [
  resolve(REPO, "package.json"),                        // 本仓库（工作区之内）
  resolve(REPO, "evidence", "filesystem.ts"),
];
for (const p of absExisting) {
  assert.ok(existsSync(p), `夹具应存在：${p}`);
  assert.equal(await fsExists(fs, WS, p), "exists", `绝对路径存在却被判不存在（双前缀回归）：${p}`);
}
console.log(`✔ ① 绝对路径（存在）正确判 true：${absExisting.length} 条（修复前全为 false）`);

// ─────────────────────────────────────────────
// ② 工作区之外的绝对路径同样正确（跨项目引用是语料里的常见形态）
// ─────────────────────────────────────────────
const outside = resolve(REPO, "adr");                   // 目录也可（readText 会抛 → 见下）
const outsideFile = resolve(REPO, "README.md");
assert.ok(existsSync(outsideFile));
assert.equal(await fsExists(fs, WS, outsideFile), "exists", "工作区外的绝对路径存在 → true");
console.log("✔ ② 工作区外的绝对路径同样正确（跨项目引用不再被误判）");

// ─────────────────────────────────────────────
// ③ 绝对路径：确实不存在 → 必须判 false（修复不得把「不存在」也说成存在）
// ─────────────────────────────────────────────
const absMissing = [resolve(REPO, "definitely-__nope__", "x.ts"), "D:/__nope__/y.ts"];
for (const p of absMissing) {
  assert.ok(!existsSync(p), `夹具不应存在：${p}`);
  assert.equal(await fsExists(fs, WS, p), "missing", `不存在的绝对路径应判 false：${p}`);
}
console.log("✔ ③ 绝对路径（不存在）仍正确判 false（没有变成「一律为真」）");

// ─────────────────────────────────────────────
// ④ 相对路径：行为不变（拼工作区）
// ─────────────────────────────────────────────
const rel = "package.json";
assert.equal(await fsExists(fs, REPO, rel), "exists", "相对路径应按工作区解析（行为不变）");
assert.equal(await fsExists(fs, WS, "definitely/__nope__.ts"), "missing", "相对路径不存在 → false");
console.log("✔ ④ 相对路径行为不变（拼工作区）");

// ─────────────────────────────────────────────
// ⑤ **判不了 ≠ 存在**（v1.15.57 改口径）
//    旧口径把「无 fs / 无工作区」都 `return true`，于是 provider 报
//    `verified / confidence 0.99 / fresh` —— **缺件被伪装成已核实**（而且是最高置信度那档）。
//    现在报 `undecidable` ⇒ provider 返回 `status:"unavailable"`（消费方打印 reason、不计入 missing）。
//    注意：ws 缺失**不再**让绝对路径自动为真 —— 那正是修复点
// ─────────────────────────────────────────────
assert.equal(await fsExists(fs, "", rel), "undecidable", "无工作区 + 相对 → **判不了**（不再伪装成存在）");
assert.equal(await fsExists(fs, "", outsideFile), "exists", "无工作区 + 绝对存在 → 仍可判 exists");
assert.equal(await fsExists(fs, "", "D:/__nope__/z.ts"), "missing", "无工作区 + 绝对不存在 → 可判 missing");
assert.equal(await fsExists(null, WS, rel), "undecidable", "无 fs → **判不了**（不再伪装成存在）");
console.log("✔ ⑤ 判不了 ⇒ undecidable（不再伪装成存在）；无工作区也能正确判绝对路径");

// ─────────────────────────────────────────────
// ⑥ isAbsoluteLocator：单一来源判定（filesystem 与 semble 共用）
// ─────────────────────────────────────────────
const abs = ["D:/x", "D:\\x", "/x", "C:/a/b.ts", "//server/share/x"];
const notAbs = ["vendor/x.ts", "C:x", "./x", "x", "", null, undefined, "a/b"];
for (const p of abs) assert.equal(isAbsoluteLocator(p), true, `应判绝对：${JSON.stringify(p)}`);
for (const p of notAbs) assert.equal(isAbsoluteLocator(p), false, `不应判绝对：${JSON.stringify(p)}`);
console.log(`✔ ⑥ isAbsoluteLocator 单一来源：绝对 ${abs.length} 例 / 非绝对 ${notAbs.length} 例`);

// ─────────────────────────────────────────────
// ⑧ 同一类缺陷之二：**目录引用**不得被判缺失
//    `readText` 对目录必失败 → 目录会被判「证据失效」。实测语料里
//    `D:\project\wslc1`(11×)、`D:\project\dsh1\vendor\dsh-shadow`(8×) 都真实存在却被判缺失。
// ─────────────────────────────────────────────
const dirs = [REPO, resolve(REPO, "evidence"), WS];
for (const d of dirs) {
  assert.ok(existsSync(d), `夹具目录应存在：${d}`);
  assert.equal(await fsExists(fs, WS, d), "exists", `目录存在却被判缺失：${d}`);
}
assert.equal(await fsExists(fs, WS, "D:/__nope__/dir"), "missing", "不存在的目录应判 false");
assert.equal(await fsExists(fs, REPO, "evidence"), "exists", "相对目录名（拼工作区）应判 true");
assert.equal(await fsExists(fs, REPO, "__nope_dir__"), "missing", "相对目录不存在 → false");
console.log("✔ ⑧ 目录引用正确判存在（修复前全为 false）");

// ─────────────────────────────────────────────
// ⑨ isConcreteLocator：通配符 / git ref **不是**可检查的具体路径
//    （ADR-0059 双条件第①条；「通配符还在不在」不是良构问题）
// ─────────────────────────────────────────────
const { isConcreteLocator } = await import("../dist/evidence/paths.js");
for (const p of ["**/*.Tests.ps1", "scripts/*.ps1", "src/**/x.ts", "a?.ts", "origin/main", "feature/foo"]) {
  assert.equal(isConcreteLocator(p), false, `不应视为具体路径：${p}`);
}
for (const p of ["src/a.ts", "D:/x/y.ts", "README.md", "origin/main.md", "a/b.ts"]) {
  assert.equal(isConcreteLocator(p), true, `应视为具体路径：${p}`);
}
console.log("✔ ⑨ isConcreteLocator 排除通配符与 git ref（具体路径仍通过）");

// ─────────────────────────────────────────────
// ⑩ 端到端：Evidence Provider 的 verify 对绝对路径给 verified（不是 not_found）
// ─────────────────────────────────────────────
const { fsEvidenceProvider } = await import("../dist/evidence/filesystem.js");
const okRes = await fsEvidenceProvider.verify({ path: outsideFile, kind: "path" }, { fs, ws: WS });
assert.equal(okRes.status, "verified", `绝对路径存在 → verify 应 verified，实际 ${okRes.status}`);
assert.equal(okRes.freshness, "fresh", "freshness 应 fresh（修复前为 stale）");
const missRes = await fsEvidenceProvider.verify({ path: "D:/__nope__/q.ts", kind: "path" }, { fs, ws: WS });
assert.equal(missRes.status, "not_found", "不存在 → not_found");
assert.equal(missRes.freshness, "stale", "不存在 → stale");
console.log("✔ ⑩ 端到端：verify 对绝对路径给 verified/fresh（修复前 not_found/stale）");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · `[object Object]` 类脏 locator 的处理（属证据清洗，不在本修复范围）；");
console.log("  · 真机 DSH 内 host.fs 的 resolve 语义（本测试用 node:path + 真实磁盘模拟）。");
// ─────────────────────────────────────────────
// ⑪ **判不了 ⇒ unavailable，不得报 verified**（v1.15.57）
//    「缺件伪装成已核实」是本仓最贵的一类错：它给的是 0.99 置信度 + fresh，
//    直接决定召回打分（×0.5）与 stale 裁决，而它依据的其实是一次「没读到」。
// ─────────────────────────────────────────────
{
  const { fsEvidenceProvider } = await import("../dist/evidence/filesystem.js");
  const ctx = (fsv) => ({ fs: fsv, ws: "" }); // 无工作区 ⇒ 相对 locator 判不了
  const und = await fsEvidenceProvider.verify({ path: "some/rel.ts" }, ctx(fs));
  assert.equal(und.status, "unavailable", "★ 判不了必须是 unavailable，不是 verified");
  assert.equal(und.confidence, 0, "判不了不得给置信度");
  assert.equal(und.freshness, "stale", "判不了不得报 fresh");
  assert.equal(und.provenance.reason, "undecidable_input", "原因必须可见（ADR-0049）");

  // 对照：绝对路径存在 ⇒ 仍然 verified（修复不能把「真能判」的那些也降级）
  const ok = await fsEvidenceProvider.verify({ path: outsideFile }, ctx(fs));
  assert.equal(ok.status, "verified");
  assert.equal(ok.confidence, 0.99);
  // 对照：确认不存在 ⇒ not_found
  const nf = await fsEvidenceProvider.verify({ path: "D:/__nope__/zz.ts" }, ctx(fs));
  assert.equal(nf.status, "not_found");
  console.log("✔ ⑪ fsEvidenceProvider：判不了 ⇒ unavailable(0/stale) · 存在 ⇒ verified(0.99) · 不存在 ⇒ not_found");
}

console.log("ALL PASS ✅");
