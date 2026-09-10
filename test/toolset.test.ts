// dsh-shadow —— core/toolset.ts：能力台账 + 缺件处置（ADR-0049 延伸，v1.15.8）
// 口径：缺件不只报 unavailable，还要给**可执行的确切命令**；但**插件绝不代装**
//   （边界依据见 core/toolset.ts 文件头：安全边界表 + inv 178 Authority ≠ Ownership + inv 182 scope 不可扩大）。
import assert from "node:assert/strict";
import { CAPABILITIES, capabilityOf, remedyFor, unavailableHint } from "../dist/core/toolset.js";
import { createIndexEngine } from "../dist/core/index-engine.js";

// ─────────────────────────────────────────────
// ① 台账自洽：每项必须有 id/label/provides/degradesTo/doc，且至少有一条 default 处置
// ─────────────────────────────────────────────
for (const c of CAPABILITIES) {
  assert.ok(c.id && c.label && c.provides && c.degradesTo && c.doc, `台账项字段不齐：${JSON.stringify(c)}`);
  assert.ok(c.remedy.default && c.remedy.default.cmd, `台账项缺 default 处置：${c.id}`);
}
assert.ok(CAPABILITIES.some((c) => c.id === "zg"), "应登记 zg");
assert.ok(CAPABILITIES.some((c) => c.id === "semble"), "应登记 semble");
console.log(`✔ ① 台账自洽：${CAPABILITIES.length} 项（${CAPABILITIES.map((c) => c.id).join(" / ")}），各有 default 处置`);

// ─────────────────────────────────────────────
// ② 未登记的 provider **不编造命令**（不认识就什么都不说）
// ─────────────────────────────────────────────
assert.equal(capabilityOf("nope"), undefined, "未登记的 id → undefined");
assert.equal(remedyFor("nope"), undefined, "未登记的 id 无处置");
assert.equal(unavailableHint("nope"), undefined, "未登记的 id 不产出提示（不编造）");
assert.equal(unavailableHint(""), undefined, "空 id → undefined");
assert.equal(unavailableHint(undefined), undefined, "undefined → undefined");
console.log("✔ ② 未登记 provider → 不产出提示（不编造命令）");

// ─────────────────────────────────────────────
// ③ 处置内容：必须含命令、平台回退、原因与文档锚
// ─────────────────────────────────────────────
const zgWin = remedyFor("zg", "win32");
assert.ok(zgWin, "win32 应回退到 default（本仓未按平台分叉）");
assert.ok(zgWin.cmd.includes("npm install -g @zvec/zvec-grep"), `zg 处置命令：${zgWin.cmd}`);
const smHint = unavailableHint("semble", "semble_not_installed");
assert.ok(smHint.includes("uv tool install semble"), `semble 提示应含命令：${smHint}`);
assert.ok(smHint.includes("semble_not_installed"), `提示应含原因：${smHint}`);
assert.ok(smHint.includes("README"), `提示应含文档锚：${smHint}`);
// 无 reason 时不显示空的原因段（也不显示占位的 "unavailable"）
const bare = unavailableHint("zg");
assert.ok(bare.includes("npm install"), "无 reason 也给命令");
assert.ok(!bare.includes("· 原因："), `无 reason 不应有原因段：${bare}`);

// ─────────────────────────────────────────────
// ④ 端到端：index 模式在 provider 缺件时**输出里带上处置命令**
//    （这是本轮的目的：把「一句 unavailable」变成「一条命令」）
// ─────────────────────────────────────────────
const fakeRead = async () => {
  const eng = createIndexEngine({ indexEngine: { provider: "semble" } }, undefined, async () => ({ unavailable: true, reason: "semble_not_installed", refs: [] }));
  return eng.generateCandidates("q", { ws: "D:/ws", workspace: "D:/ws" });
};
const r = await fakeRead();
assert.equal(r.unavailable, true, "缺件应 unavailable");
assert.equal(r.reason, "semble_not_installed", "缺件原因应随候选结果透出（供处置使用）");
const hint = unavailableHint(r.provider, r.reason);
assert.ok(hint && hint.includes("uv tool install semble"), "index 缺件时应能据此产出处置命令");
console.log("✔ ④ index 缺件路径：unavailable 结果带 reason → 可产出处置命令");

// 未登记的 provider（如配置写错成别的名字）→ 无提示，且不报 verified
const unknown = createIndexEngine({ indexEngine: { provider: "fs" } });
const ur = await unknown.generateCandidates("q", { ws: "D:/ws", workspace: "D:/ws" });
assert.equal(ur.unavailable, undefined, "fs 不是缺件");
assert.equal(unavailableHint(ur.provider, ur.reason), undefined, "fs 不产出缺件提示");
console.log("✔ ⑤ 默认 fs 路径不产出缺件提示（无副作用）");

console.log("ALL PASS ✅");
