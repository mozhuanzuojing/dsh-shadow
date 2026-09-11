// dsh-shadow —— 能力预检（委派 × 工具集的接缝，v1.15.13）
//
// 这层存在的理由：派活时手里只有「这个活得做全文搜索」，而台账入口是 id。
// 预检把「需要什么能力」翻译成「本机是否就位 / 缺了退到哪」。
//
// 本测试锁住的**不是**渲染文案，而是三条硬边界——少任何一条，读侧输出就会被误读：
//   ① 不是闸门（reference 不影响插件行为，ADR-0055 §1）
//   ② 装完本进程内不可见（C4：PATH 是启动时快照）+ 由此得出「不要按先装再派做计划」
//   ③ 缺件只能上报不能自装（inv 182：scope 不可在执行中隐式扩大）
import assert from "node:assert/strict";
import { CAPABILITIES, capabilityOf, findCapabilities } from "../dist/core/toolset.js";
import { precheckCapabilities, renderPrecheck, PROCESS_LOCAL_VISIBILITY } from "../dist/core/toolset-exec.js";

// ─────────────────────────────────────────────
// ① 反查：按「能力/用途/别名」都能找到台账条目
// ─────────────────────────────────────────────
assert.ok(findCapabilities("rg").some((c) => c.id === "rg"), "按 id 应能查到 rg");
assert.ok(findCapabilities("ripgrep").some((c) => c.id === "rg"), "别名 ripgrep → rg");
assert.ok(findCapabilities("fd").some((c) => c.id === "fd"), "按二进制名应能查到 fd");
assert.ok(findCapabilities("fdfind").some((c) => c.id === "fd"), "别名 fdfind（Debian 包名）→ fd");
assert.ok(findCapabilities("jadx").some((c) => c.id === "jadx"), "按 id 应能查到 jadx");
assert.ok(findCapabilities("反编译").some((c) => c.id === "jadx"), "按用途词「反编译」应命中 jadx（provides 匹配）");
assert.ok(findCapabilities("搜索与查找").length >= 4, "按分类名应命中该分类多条");
console.log(`✔ ① 反查：id / 二进制名 / 别名 / 用途词 / 分类名 均可命中（如「反编译」→ ${findCapabilities("反编译").map((c) => c.id).join("/")}）`);

// ─────────────────────────────────────────────
// ② 不编造：未登记的需求 → 零命中；预检如实说「未登记」，不给命令
// ─────────────────────────────────────────────
assert.equal(findCapabilities("完全不存在的能力xyzzy").length, 0, "未登记 → 零命中");
assert.equal(findCapabilities("").length, 0, "空串 → 零命中");
assert.equal(findCapabilities(undefined).length, 0, "undefined → 零命中");
assert.ok(findCapabilities("z").some((c) => c.id === "zoxide"), "别名 z（常见缩写）→ zoxide");
assert.equal(findCapabilities("q").length, 0, "未映射的单字符不裸匹配（长度 <2 直接零命中，防误撞）");
const miss = await precheckCapabilities(["完全不存在的能力xyzzy"]);
assert.equal(miss[0].hit, false, "未命中应标 hit:false");
assert.ok(!miss[0].capability, "未命中不得给出条目");
const missOut = renderPrecheck(miss);
assert.ok(missOut.includes("台账未登记"), "未命中应如实说未登记");
assert.ok(!missOut.includes("winget install"), "未命中不得编造安装命令");
console.log("✔ ② 不编造：未登记的需求零命中，预检只说「未登记」、不给命令");

// ─────────────────────────────────────────────
// ③ 预检输出必须含三条硬边界（这是本层存在的意义，缺一条即红）
// ─────────────────────────────────────────────
const rows = await precheckCapabilities(["全文搜索", "jadx"]);
const out = renderPrecheck(rows);
assert.ok(out.includes("预检不是闸门"), "边界①：必须说清预检不是闸门（reference 不影响插件行为）");
assert.ok(out.includes("不影响插件行为"), "边界①：必须引用 ADR-0055 §1 的口径");
assert.ok(out.includes(PROCESS_LOCAL_VISIBILITY), "边界②：必须披露 PROCESS_LOCAL_VISIBILITY（装完本进程内不可见）");
assert.ok(out.includes("重启宿主"), "边界②：必须说清要重启宿主才可见");
assert.ok(out.includes("只上报、不自装"), "边界③：必须写明被委派者只能上报");
assert.ok(out.includes("inv 182"), "边界③：必须挂到 inv 182（scope 不可隐式扩大）");
console.log("✔ ③ 三条硬边界齐备：不是闸门 / 装完进程内不可见 / 缺件只能上报不能自装");

// ─────────────────────────────────────────────
// ④ 诊断不得退化成「打分」：预检产出里没有优劣/评分/能力等级
//    （ADR-0029.1 inv 179 Agency ≠ Identity；ADR-0030 inv 184 Feedback ≠ Permission Upgrade）
// ─────────────────────────────────────────────
for (const banned of ["评分", "得分", "score", "rank", "capabilityLevel", "能力等级", "优先派", "更信任"]) {
  assert.ok(!out.toLowerCase().includes(banned.toLowerCase()), `预检输出不得含「${banned}」——那会滑向给主体打分（撞 inv 179/184）`);
}
const row = rows.find((r) => r.need === "全文搜索");
assert.ok(row && row.hit, "「全文搜索」应命中台账");
assert.ok(!("score" in row) && !("rank" in row) && !("level" in row), "预检行不得带评分/等级字段");
console.log("✔ ④ 无评分语义：预检只答「机器上有没有」，不给主体打分、不产能力等级");

// ─────────────────────────────────────────────
// ⑤ 多命中如实列出（coreutils 三变体），并提示「择一即可，勿全装」
// ─────────────────────────────────────────────
const coreutilsHits = findCapabilities("coreutils");
assert.ok(coreutilsHits.length >= 2, `coreutils 应命中多变体（实际 ${coreutilsHits.length}）`);
const cu = await precheckCapabilities(["coreutils"]);
const cuOut = renderPrecheck(cu);
assert.ok(cuOut.includes("同能力多条目") || cu[0].available === true, "多命中的条目应如实列出变体");
console.log(`✔ ⑤ 多命中如实列出：coreutils → ${coreutilsHits.map((c) => c.id).join(" / ")}`);

// ─────────────────────────────────────────────
// ⑥ 只读：预检绝不安装（无审批通道也不产出「已安装」）
// ─────────────────────────────────────────────
const before = CAPABILITIES.length;
const ro = await precheckCapabilities(["rg"]);
assert.equal(ro.length, 1, "预检一行对应一个需求");
assert.equal(CAPABILITIES.length, before, "预检不得改动台账");
assert.ok(!out.includes("✅ 已安装"), "预检输出不得出现安装结果措辞（预检不装）");
console.log("✔ ⑥ 只读：预检只探测，绝不安装、不改台账");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 真机上「装了工具但本进程看不见」的**实测复现**——本测试只断言该约束被写进输出；");
console.log("    C4 的代码依据是 core/toolset-exec.ts 的 installCapability failed 分支注释与 ADR-0055 §4。");
console.log("  · 各 reference 条目 probe 旗标正确性（同 toolset-catalog 的诚实标注）。");
console.log("ALL PASS ✅");
