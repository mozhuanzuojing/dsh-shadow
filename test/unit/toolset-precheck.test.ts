// dsh-shadow v2 — 能力预检：把「需要什么能力」翻译成「本机是否就位 / 缺了退到哪」。
//
// 本测试锁住的**不是**渲染文案，而是三条硬边界——少任何一条，输出就会被误读：
//   ① 不是闸门（reference 不影响插件行为）
//   ② 装完本进程内不可见（PATH 是启动时快照）+ 由此得出「不要按先装再派做计划」
//   ③ 缺件只能上报不能自装（委派范围不得在执行中隐式扩大）
// 另外钉住「只读」：预检绝不安装、绝不执行安装命令。
import assert from "node:assert/strict";
import { CAPABILITIES, findCapabilities } from "../../dist/engine/toolset/catalog.js";
import { precheckCapabilities } from "../../dist/engine/toolset/probe.js";
import { PROCESS_LOCAL_VISIBILITY, renderPrecheck } from "../../dist/engine/toolset/render.js";
import type { Runner } from "../../dist/engine/toolset/types.js";

/** 假 runner：按调用序号决定是否「可用」，并记录所有命令（用来断言没跑安装器）。 */
const recordingRunner = (behaviour: (i: number) => boolean = () => false) => {
  const calls: string[] = [];
  const runner: Runner = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return behaviour(calls.length - 1)
      ? { ok: true, code: 0, out: `${cmd} 1.2.3`, err: "" }
      : { ok: false, code: "ENOENT", out: "", err: "" };
  };
  return { calls, runner };
};

// ─────────────────────────────────────────────
// ① 反查/precheck：按能力词命中台账；命中项真的被探测；多命中逐条探
// ─────────────────────────────────────────────
{
  const { calls, runner } = recordingRunner();
  const rows = await precheckCapabilities(["全文搜索", "jadx"], { runner });
  assert.equal(rows.length, 2, "预检一行对应一个需求");
  assert.ok(rows[0].hit && rows[0].capability?.id === "rg", `「全文搜索」应命中 rg（实际 ${rows[0].capability?.id}）`);
  assert.equal(rows[0].available, false, "假 runner 未检出时 available=false");
  assert.ok(rows[1].hit && rows[1].capability?.id === "jadx", `"jadx" 应命中 jadx（实际 ${rows[1].capability?.id}）`);
  assert.deepEqual(calls, ["rg --version", "jadx --version"], "只探测命中项，探测命令来自台账 probe");
}
console.log("✔ ① 反查/precheck：能力词命中台账并真的探测（只探测、顺序来自台账）");

// ─────────────────────────────────────────────
// ② 未命中：零命中、不探测、不编造命令
// ─────────────────────────────────────────────
{
  assert.equal(findCapabilities("完全不存在的能力xyzzy").length, 0, "未登记 → 零命中");
  const { calls, runner } = recordingRunner();
  const rows = await precheckCapabilities(["完全不存在的能力xyzzy"], { runner });
  assert.equal(rows[0].hit, false, "未命中应标 hit:false");
  assert.equal(rows[0].capability, undefined, "未命中不得给出条目");
  assert.equal(rows[0].available, null, "未命中不探测（null=未探测，不是 false=未检出）");
  assert.deepEqual(calls, [], "未命中不得发起任何探测");
  const out = renderPrecheck(rows);
  assert.ok(out.includes("台账未登记"), "未命中应如实说未登记");
  assert.ok(!out.includes("winget"), "未命中不得编造安装命令");
}
console.log("✔ ② 不编造：未登记的需求零命中，预检只说「未登记」、不给命令、不探测");

// ─────────────────────────────────────────────
// ③ 多命中如实列出（coreutils 变体），任一可用即算就位
// ─────────────────────────────────────────────
{
  const hits = findCapabilities("coreutils");
  assert.ok(hits.length >= 2, `coreutils 应命中多变体（实际 ${hits.length}）`);
  const allFail = recordingRunner(() => false);
  const failRows = await precheckCapabilities(["coreutils"], { runner: allFail.runner });
  assert.equal(failRows[0].hit, true);
  assert.equal(failRows[0].available, false, "全部未检出 → available=false");
  assert.equal(failRows[0].hits.length, hits.length, "多命中须全量列入 hits");
  assert.ok(renderPrecheck(failRows).includes("同能力多条目"), "多命中应提示「同能力多条目…择一即可」");

  const secondOk = recordingRunner((i) => i === 1);
  const okRows = await precheckCapabilities(["coreutils"], { runner: secondOk.runner });
  assert.equal(okRows[0].available, true, "多命中里任一可用即算就位");
  assert.equal(secondOk.calls.length, 2, "逐条探测到可用为止（coreutils 两个变体）");
}
console.log("✔ ③ 多命中如实列出：coreutils 变体全量入 hits，任一可用即就位");

// ─────────────────────────────────────────────
// ④ 三条硬边界 + 不给主体打分（少一条即红）
// ─────────────────────────────────────────────
{
  const { runner } = recordingRunner();
  const rows = await precheckCapabilities(["全文搜索", "jadx"], { runner });
  const out = renderPrecheck(rows);
  assert.ok(out.includes("预检不是闸门"), "边界①：必须说清预检不是闸门");
  assert.ok(out.includes("不影响插件行为"), "边界①：必须说清 reference 不影响插件行为");
  assert.ok(out.includes(PROCESS_LOCAL_VISIBILITY), "边界②：必须披露 PROCESS_LOCAL_VISIBILITY（装完本进程内不可见）");
  assert.ok(out.includes("重启宿主"), "边界②：必须说清要重启宿主才可见");
  assert.ok(out.includes("只上报、不自装"), "边界③：必须写明被委派者只能上报");
  assert.ok(out.includes("委派范围不得在执行中隐式扩大"), "边界③：必须挂到「委派范围不可扩大」");
  for (const banned of ["评分", "得分", "score", "rank", "capabilityLevel", "能力等级", "优先派", "更信任"]) {
    assert.ok(!out.toLowerCase().includes(banned.toLowerCase()), `预检输出不得含「${banned}」——那会滑向给主体打分`);
  }
  const row = rows.find((r) => r.need === "全文搜索");
  assert.ok(row && !("score" in row) && !("rank" in row) && !("level" in row), "预检行不得带评分/等级字段");
}
console.log("✔ ④ 三条硬边界齐备：不是闸门 / 装完进程内不可见 / 缺件只能上报；且无评分语义");

// ─────────────────────────────────────────────
// ⑤ 只读：预检只探测，绝不安装、绝不执行安装命令
// ─────────────────────────────────────────────
{
  const before = CAPABILITIES.length;
  const { calls, runner } = recordingRunner(() => true);
  const rows = await precheckCapabilities(["全文搜索"], { runner });
  const out = renderPrecheck(rows);
  assert.equal(CAPABILITIES.length, before, "预检不得改动台账");
  assert.ok(calls.every((c) => !c.includes("install")), `预检只应调用探测命令，不得执行安装：${calls.join(" | ")}`);
  assert.ok(!out.includes("✅ 已安装"), "预检输出不得出现安装结果措辞（预检不装）");
  assert.ok(out.includes("只探测、不安装"), "预检输出必须自报「只读」");
}
console.log("✔ ⑤ 只读：预检只探测、绝不安装、不改台账");

// ─────────────────────────────────────────────
// ⑥ 上限：一次最多 12 条需求（不静默处理无限列表）
// ─────────────────────────────────────────────
{
  const needs = Array.from({ length: 13 }, (_, i) => `未登记需求${i}`);
  const rows = await precheckCapabilities(needs);
  assert.equal(rows.length, 12, `预检应限制 12 条上限（实际 ${rows.length}）；超过部分由 engine 显式拒绝`);
}
console.log("✔ ⑥ 上限：单次预检最多 12 条");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 各 reference 条目 probe 旗标正确性（可能某工具不支持该旗标 → 只会显示「未检出」，不会误报可用）；");
console.log("  · 真机上「装了工具但本进程看不见」的实测复现——本测试只断言该约束被写进输出；");
console.log("    代码依据是 install.ts 的失败分支与运行期 PATH 快照事实。");
console.log("ALL PASS ✅");
