// dsh-shadow —— evidence/zg.ts：① spawn 解析（Windows ENOENT/EINVAL 修复）② zg 0.2.2 输出解析（v1.15.7）
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseZgMatches, zgVerify, resolveZgInvocation, resetZgInvocationCache } from "../dist/evidence/zg.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// ─────────────────────────────────────────────
// ① 纯函数：zg 0.2.2 `--rg` 的**真实两行格式**（取自本机实测 stdout）
//    「文件路径单独一行 + 缩进的 `起-止 [heading 面包屑] 行号:\t内容`」
// ─────────────────────────────────────────────
const REAL = [
  "CHANGELOG.md",
  "  223-240 [heading Changelog > [v1.14.0] 新增第 6 个 NodeType `resource`] 231:\t- **证据门同门**（两道…）",
  "  433-446 [heading Changelog > [v1.8.0] Evidence Lineage Layer] 439:\t- **Validation Gate**…",
  "core/lineage-validator.ts",
  "  17:export const validateAtomProjection = (atom: AtomLike): AtomProjectionVerdict => {",
].join("\n");

const ref = { path: "core/lineage-validator.ts", query: "validateAtomProjection", kind: "symbol" as const };
const m = parseZgMatches(REAL, ref);
assert.equal(m.length, 3, "应解析出 3 条命中");
assert.equal(m[0].path, "CHANGELOG.md", "路径取自「上一行不缩进行」，不是 ref.path");
assert.equal(m[0].startLine, 231, "行号取**命中行** 231，不是分块起始 223");
assert.ok(m[0].matchedText.includes("证据门同门"), "命中文本保留");
assert.equal(m[2].path, "core/lineage-validator.ts", "换文件后路径正确切换");
assert.equal(m[2].startLine, 17, "无 [heading] 的命中行也要解析");
assert.equal(m[2].matchedText.startsWith("export const"), true, "无面包屑时文本完整");

// 空 / 无结构 → 空（不抛；**不得**因为 stdout 里出现 path 或 query 文本就造命中）
assert.deepEqual(parseZgMatches("", ref), [], "空 stdout → 空");
assert.deepEqual(parseZgMatches("query validateAtomProjection appeared but no structure", ref), [], "仅文本出现 query → 不编造命中（ADR-0043）");
// 关键回归：zg 对**不存在**的路径会打印 `missing: <path>`，stdout 含该路径 —— 旧版兜底据此造了一条命中，
// 把「路径不存在」判成 verified（本机实测复现）。现在必须 0 命中。
assert.deepEqual(
  parseZgMatches("No searchable files.\nmissing: no/such/file.ts", { path: "no/such/file.ts", kind: "path" }),
  [],
  "`missing: <path>` 不得被当成命中（旧兜底的误报源）",
);
// 真正无缩进路径行但**没有**命中行 → 也算不出证据（不猜）
assert.deepEqual(parseZgMatches("core/only-path-no-hit.ts", { path: "core/only-path-no-hit.ts" }), [], "只有路径行、无命中行 → 空");

// limit 生效
const many = Array.from({ length: 20 }, (_, i) => `  ${i + 1}:line ${i}`).join("\n");
assert.equal(parseZgMatches("f.ts\n" + many, { path: "f.ts" }).length, 8, "默认上限 8 条");
console.log("✔ ① parseZgMatches：解析 zg 真实两行格式（路径切换/命中行号/无面包屑）+ 不编造（含 missing 误报回归）+ limit");

// ─────────────────────────────────────────────
// ② spawn：DSH_SHADOW_ZG_CLI 覆盖 → 用 `node <cli.js>` 起（Windows 唯一可用路径）
//    这条锁住 v1.15.7 修的根因：execFile("zg") 在 Windows 必 ENOENT、execFile("zg.cmd") 必 EINVAL。
// ─────────────────────────────────────────────
const dir = mkdtempSync(join(tmpdir(), "dsh-zg-"));
const fakeCli = join(dir, "fake-cli.mjs");
writeFileSync(fakeCli, 'process.stdout.write("core/fake.ts\\n  12:hit line\\n")\n');
process.env.DSH_SHADOW_ZG_CLI = fakeCli;
resetZgInvocationCache();
const inv = resolveZgInvocation();
assert.equal(inv.cmd, process.execPath, "覆盖后必须用 node 起 CLI JS（不是裸 zg / .cmd）");
assert.deepEqual(inv.prefix, [fakeCli], "node 的第一个参数是 CLI JS 路径");
const r = await zgVerify({ path: "core/fake.ts", query: "hit", kind: "symbol" }, { ws: dir });
assert.equal(r.status, "verified", "spawn 到 fake CLI 应 verified");
assert.equal(r.matches[0].path, "core/fake.ts", "spawn 路径的解析结果正确");
assert.equal(r.matches[0].startLine, 12, "行号正确");
console.log("✔ ② resolveZgInvocation 覆盖 → node 起 CLI JS；端到端 verified（锁住 Windows ENOENT/EINVAL 根因）");

// ─────────────────────────────────────────────
// ⑤ 路径语义：ref.path 有值时，**别的文件**命中不得冒充该路径 verified
//    （与 fsEvidenceProvider「只答这条路径还在不在」同义；否则会把 stale 证据判成 fresh）
// ─────────────────────────────────────────────
const otherCli = join(dir, "other-cli.mjs");
writeFileSync(otherCli, 'process.stdout.write("other/file.ts\\n  5:hit line\\n")\n');
process.env.DSH_SHADOW_ZG_CLI = otherCli;
resetZgInvocationCache();
const rOther = await zgVerify({ path: "core/fake.ts", query: "hit", kind: "path" }, { ws: dir });
assert.equal(rOther.status, "not_found", "只有别的文件命中 → 该路径必须 not_found（不得冒充 verified）");
assert.equal(rOther.freshness, "stale", "该路径无证据 → stale");
const rWs = await zgVerify({ path: "", query: "hit", kind: "query" }, { ws: dir });
assert.equal(rWs.status, "verified", "path 为空（index-engine 工作区级发现）时保持发现语义");
assert.ok(rWs.matches.length > 0, "工作区级发现应有命中");

// 绝对路径 vs zg 相对路径：应按后缀判同一条
const absCli = join(dir, "abs-cli.mjs");
writeFileSync(absCli, 'process.stdout.write("core/fake.ts\\n  7:hit line\\n")\n');
process.env.DSH_SHADOW_ZG_CLI = absCli;
resetZgInvocationCache();
const rAbs = await zgVerify({ path: "D:/ws/core/fake.ts", query: "hit", kind: "path" }, { ws: dir });
assert.equal(rAbs.status, "verified", "证据记绝对路径、zg 回相对路径 → 应判为同一条（后缀匹配）");
assert.equal(rAbs.matches[0].startLine, 7, "同路径匹配保留行号");
console.log("✔ ⑤ 路径语义：别的文件命中不冒充；path 空保持发现语义；绝对/相对路径后缀匹配");

// ─────────────────────────────────────────────
// ③ 配置写错必须**可见地失败**，不得静默回退到另一个 zg（ADR-0049）
// ─────────────────────────────────────────────
process.env.DSH_SHADOW_ZG_CLI = join(dir, "definitely-missing.mjs");
resetZgInvocationCache();
const bad = resolveZgInvocation();
assert.equal(bad.cmd, process.execPath, "错误的覆盖仍走 node（不静默回退到裸 zg）");
assert.equal(bad.prefix[0], join(dir, "definitely-missing.mjs"), "保留用户给错的路径，让失败可见");
const badRes = await zgVerify({ path: "core/fake.ts", query: "hit" }, { ws: dir });
assert.notEqual(badRes.status, "verified", "指向不存在的 CLI 时**不得**报 verified");
assert.ok(badRes.provenance.reason, `失败原因必须可见（ADR-0049），实际 provenance=${JSON.stringify(badRes.provenance)}`);
console.log("✔ ③ 覆盖写错 → 不静默回退、不报 verified、provenance.reason 可见");

// ─────────────────────────────────────────────
// ④ 真机：本机装了 zg 才跑；没装**明确跳过**，不假装通过
// ─────────────────────────────────────────────
delete process.env.DSH_SHADOW_ZG_CLI;
resetZgInvocationCache();
const real = resolveZgInvocation();
if (real.cmd === process.execPath && real.prefix[0]) {
  const rr = await zgVerify({ path: "core/lineage-validator.ts", query: "validateAtomProjection", kind: "symbol" }, { ws: repoRoot });
  assert.notEqual(rr.status, "unavailable", "zg 已就位却报 unavailable → spawn 修复失效");
  assert.equal(rr.status, "verified", `限定路径后应 verified（实测：不限定会被 40 条命中/16 文件的全局 top-N 截掉），实际 ${rr.status}`);
  assert.ok(rr.matches.length > 0, "verified 必须有命中");
  assert.equal(rr.matches[0].path, "core/lineage-validator.ts", "命中路径就是被验的那条");
  assert.ok(rr.matches[0].startLine, "命中带行号");
  console.log(`✔ ④ 真机 zg：status=${rr.status}，${rr.matches.length} 条命中，首条 ${rr.matches[0].path}:${rr.matches[0].startLine}`);
  // 不存在的路径 → not_found（zg 对它返回 exit 0 + 0 命中，不报错）
  const rrMissing = await zgVerify({ path: "no/such/file.ts", query: "validateAtomProjection", kind: "path" }, { ws: repoRoot });
  assert.equal(rrMissing.status, "not_found", "不存在的路径必须 not_found");
  assert.equal(rrMissing.freshness, "stale", "不存在的路径 → stale");
  console.log("✔ ④b 真机 zg：不存在路径 → not_found/stale（不报错、不误判 verified）");
} else {
  console.log(`⚠ ④ 跳过真机 zg：未在本机定位到 @zvec/zvec-grep 的 CLI JS（invocation=${real.cmd}）。装法见 README「可选外部 CLI」。`);
}
console.log("ALL PASS ✅");
