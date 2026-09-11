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
  assert.equal(await fsExists(fs, WS, p), true, `绝对路径存在却被判不存在（双前缀回归）：${p}`);
}
console.log(`✔ ① 绝对路径（存在）正确判 true：${absExisting.length} 条（修复前全为 false）`);

// ─────────────────────────────────────────────
// ② 工作区之外的绝对路径同样正确（跨项目引用是语料里的常见形态）
// ─────────────────────────────────────────────
const outside = resolve(REPO, "adr");                   // 目录也可（readText 会抛 → 见下）
const outsideFile = resolve(REPO, "README.md");
assert.ok(existsSync(outsideFile));
assert.equal(await fsExists(fs, WS, outsideFile), true, "工作区外的绝对路径存在 → true");
console.log("✔ ② 工作区外的绝对路径同样正确（跨项目引用不再被误判）");

// ─────────────────────────────────────────────
// ③ 绝对路径：确实不存在 → 必须判 false（修复不得把「不存在」也说成存在）
// ─────────────────────────────────────────────
const absMissing = [resolve(REPO, "definitely-__nope__", "x.ts"), "D:/__nope__/y.ts"];
for (const p of absMissing) {
  assert.ok(!existsSync(p), `夹具不应存在：${p}`);
  assert.equal(await fsExists(fs, WS, p), false, `不存在的绝对路径应判 false：${p}`);
}
console.log("✔ ③ 绝对路径（不存在）仍正确判 false（没有变成「一律为真」）");

// ─────────────────────────────────────────────
// ④ 相对路径：行为不变（拼工作区）
// ─────────────────────────────────────────────
const rel = "package.json";
assert.equal(await fsExists(fs, REPO, rel), true, "相对路径应按工作区解析（行为不变）");
assert.equal(await fsExists(fs, WS, "definitely/__nope__.ts"), false, "相对路径不存在 → false");
console.log("✔ ④ 相对路径行为不变（拼工作区）");

// ─────────────────────────────────────────────
// ⑤ 无法判定时不误伤（沿用原口径：视为存在）
//    注意：ws 缺失**不再**让绝对路径自动为真 —— 那正是修复点
// ─────────────────────────────────────────────
assert.equal(await fsExists(fs, "", rel), true, "无工作区 + 相对 → 无法判定，视为存在");
assert.equal(await fsExists(fs, "", outsideFile), true, "无工作区 + 绝对存在 → 仍可判 true");
assert.equal(await fsExists(fs, "", "D:/__nope__/z.ts"), false, "无工作区 + 绝对不存在 → 可判 false");
assert.equal(await fsExists(null, WS, rel), true, "无 fs → 视为存在");
console.log("✔ ⑤ 无法判定时不误伤；无工作区也能正确判绝对路径");

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
  assert.equal(await fsExists(fs, WS, d), true, `目录存在却被判缺失：${d}`);
}
assert.equal(await fsExists(fs, WS, "D:/__nope__/dir"), false, "不存在的目录应判 false");
assert.equal(await fsExists(fs, REPO, "evidence"), true, "相对目录名（拼工作区）应判 true");
assert.equal(await fsExists(fs, REPO, "__nope_dir__"), false, "相对目录不存在 → false");
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
console.log("ALL PASS ✅");
