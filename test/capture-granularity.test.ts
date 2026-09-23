// dsh-shadow —— 记录粒度（`adr/0097`）的回归锁（v1.19.0）。
//
// 锁四件事：
//   ① **正对照**：含 `user` / `decision` / `assistant`（思维落点）的批 ⇒ **记忆**（不得降级）；
//   ② **负对照**：只有 `action` 的批（fs 的「改/读」与 tool 的「调用」）⇒ **审计流**；
//   ③ **控制变量**（不误降级）：出现**未知 kind** ⇒ 记忆（将来加一种记录类型不会被静默降级）；
//      空批 ⇒ 审计（`every` 对空为真：它无可记录正文，不该产生记忆文件）；配置逃生口按预期工作；
//   ④ **落点与读侧不冲突**：审计流 rel 以 `.jsonl` 结尾，且 **`isMemoryFileName` 必须为 false** ——
//      否则 `listMemories` 会把审计流当「记忆」收进索引与召回（**跨模块真断言**，不是同义反复）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isAuditBatch,
  echoToAudit,
  auditStreamRel,
  auditLinesOf,
  bodyLinesOf,
  materialOfAction,
  actionMaterials,
} from "../dist/core/retention/capture-granularity.js";
import { isMemoryFileName } from "../dist/persistence/files.js";

const action = (text: string) => ({ kind: "action", text, comp: "x", time: "10:00:00" });

// ── ① 正对照：含线索的批必须是记忆 ──
const memoryBearing: [string, any][] = [
  ["user", { kind: "user", text: "用户：做这个", sub: "instruction" }],
  ["decision", { kind: "decision", text: "决定 改用 A", statement: "改用 A" }],
  ["assistant", { kind: "assistant", text: "我：分析一下" }],
];
for (const [label, rec] of memoryBearing) {
  assert.equal(isAuditBatch([action("改/读 a.ts"), rec]), false, `含 ${label} 的批不得被降级（那是线索）`);
}

// ── ② 负对照：只有 action ⇒ 审计流 ──
assert.equal(isAuditBatch([action("改/读 a.ts"), action("调用 edit")]), true, "只有动作的批必须落审计流");

// ── ③ 控制变量 ──
assert.equal(isAuditBatch([{ kind: "future-kind", text: "?" }]), false, "未知 kind 必须保守当记忆（将来加记录类型不得被静默降级）");
assert.equal(isAuditBatch([]), true, "空批 ⇒ 审计（无可记录正文 ⇒ 不该产生记忆文件）");
assert.equal(echoToAudit({}), true, "默认落审计流");
assert.equal(echoToAudit({ capture: { echo: "audit" } }), true, "显式 audit");
assert.equal(echoToAudit({ capture: { echo: "memory" } }), false, "显式 memory = 旧行为逃生口");

// ── ④ 落点与读侧不冲突 ──
assert.equal(auditStreamRel("2026-09-21"), ".shadow/audit/2026-09-21.jsonl");
assert.equal(isMemoryFileName("2026-09-21.jsonl"), false, "审计流**不得**被 isMemoryFileName 认成记忆（否则审计流会进索引与召回）");
assert.equal(isMemoryFileName("2026-09-21--100000-shadow.md"), true, "正对照：真记忆文件仍要认");

// ── 字段不丢：审计行保住原正文的字段（一字不丢，只是不再各占一个 inode/样板头）──
const traces: any = [{ seq: 1, at: "10:00:00", kind: "action", actor: "a1", comp: "core/x.ts", text: "改/读 core/x.ts", source: "fs" }];
const obj = JSON.parse(auditLinesOf(traces, { agent: "a1", project: "dsh1" })[0]);
for (const k of ["at", "kind", "comp", "text", "source", "agent", "project"]) assert.ok(k in obj, `审计行丢了字段 ${k}`);
assert.equal(obj.text, "改/读 core/x.ts", "审计行必须保留原文");

// ── 正文归一化：记忆正文与审计流共用同一份（否则两条路径会各自演化出不同的安全判据）──
assert.deepEqual(bodyLinesOf(traces, "shadow"), ["- [10:00:00] [core/x.ts] 改/读 core/x.ts"]);

// ── 材料抽取：判据收一处（`core/retention/memory.ts` 与审计流材料折叠共用）──
assert.equal(materialOfAction("改/读 core/x.ts"), "core/x.ts");
assert.equal(materialOfAction("调用 edit"), undefined, "非 fs 动作不是材料（否则「调用 X」会被当路径）");
assert.deepEqual(actionMaterials([action("改/读 a.ts"), action("调用 edit"), action("改/读 a.ts")]), ["a.ts", "a.ts"], "去重交给调用方（core/retention/memory.ts 的 addMat）");

// ── ⑤ 静态接线守卫：判据不得「只存在、从不执行」──
// 由来：本仓有过这种失效形态（`core/types.ts:52` 自陈 `knowledgeEngine.enabled` **生产零读取**；
// A1「导出但生产无直接调用点」桶就是为它设的）。行为面已由上面的单元断言锁住，
// 这里只证明「`flush` 的生产路径**确实**问了粒度判据，且审计分支在写记忆文件**之前**」。
// ⚠ 能力边界：**静态检查，不证明运行时行为**；真正的端到端（假 fs 驱动 `makeMaterialize`）见 `BACKLOG` T22。
{
  const src = readFileSync(new URL("../core/writer/materialize.ts", import.meta.url), "utf8");
  const iGuard = src.indexOf("isAuditBatch(arr)");
  const iGuardCfg = src.indexOf("echoToAudit(core.config)");
  const iAuditWrite = src.indexOf("appendJsonlLine(");
  const iMemoryWrite = src.indexOf("await fs.writeText(t, `${head}${clue}${body}");
  assert.ok(iGuard > 0, "flush 必须调用 isAuditBatch（否则判据只是模块里的死代码）");
  assert.ok(iGuardCfg > 0, "flush 必须尊重配置逃生口 echoToAudit");
  assert.ok(iAuditWrite > 0, "flush 必须真的把审计批写进审计流");
  assert.ok(iMemoryWrite > 0, "记忆落盘那一行必须还在（否则是「删了功能」而不是「降级」）");
  assert.ok(iGuard < iMemoryWrite, "粒度判据必须出现在记忆落盘**之前**（顺序反了 = 先写文件再判，等于没改）");
}

console.log(
  "✔ capture-granularity：① 正对照（含线索不降级）· ② 负对照（纯动作降级）· ③ 控制变量（未知 kind 保守 / 空批 / 配置逃生口）· ④ 落点与读侧不冲突（isMemoryFileName 跨模块断言）· ⑤ 静态接线守卫（判据在生产路径上、且在落盘之前）—— 全部通过",
);
