// dsh-shadow —— 认知门（AtomKind gate）的可达性与接线事实锁定（ADR-0063）。
//
// 本测试锁的是**当前已实测的现状**，不是「期望的正确行为」——目的是让任何改动
// `deriveAtomKind` / `validateAtomProjection` / 两个 `isCognitiveAtom` 式函数的动作
// **必然触发本测试变红**，从而被迫去读 ADR-0063 与待办 D5，而不是悄悄改掉一门行为。
//
// ⚠ **D5 裁决落地后，请同步改本文件**（它是决策锁，不是不变量）。
import assert from "node:assert/strict";
import { deriveAtomKind, isCognitiveAtom, isMetadataMemoryText, parseMemory } from "../dist/core/episode.js";
import { validateAtomProjection } from "../dist/core/lineage-validator.js";
import { deriveShadowNodes } from "../dist/core/node.js";

// ── ① AtomKind 声明的 5 个值里，deriveAtomKind 只能产出 3 个 ──
// 探针覆盖所有分支（决策/目标/todo 词/无材料且 entry=shadow/无材料且有用户话/有材料）
const probes = [
  { entry: "shadow", materials: [], decisions: [], goal: "", userMessages: [] },
  { entry: "shadow", materials: [], decisions: [], goal: "", userMessages: ["x"] },
  { entry: "src/a.ts", materials: [], decisions: [], goal: "", userMessages: [] },
  { entry: "src/a.ts", materials: ["p"], decisions: [], goal: "", userMessages: [] },
  { entry: "x", materials: [], decisions: ["d"], goal: "", userMessages: [] },
  { entry: "x", materials: [], decisions: [], goal: "g", userMessages: [] },
  { entry: "x", materials: [], decisions: [], goal: "", userMessages: ["todo"] },
  { entry: "session", materials: [], decisions: [], goal: "", userMessages: [] },
  { entry: "artifact", materials: [], decisions: [], goal: "", userMessages: [] },
];
const produced = new Set(probes.map((p) => deriveAtomKind(p as any)));
assert.deepEqual([...produced].sort(), ["experience", "metadata", "task"], "deriveAtomKind 只能产出 experience/task/metadata");

// ── ② `kind === "session"` 分支因此不可达；`metadata` 分支可达 ──
const sessionAtom = { type: "memory" as const, kind: "session" as any };
assert.equal(validateAtomProjection(sessionAtom).allowed, false, "session 分支被拒（但该 kind 无生产者）");
assert.equal(validateAtomProjection({ type: "memory", kind: "metadata" }).allowed, false, "metadata 分支被拒（可达）");
assert.equal(validateAtomProjection({ type: "memory", kind: "experience" }).allowed, true, "experience 放行");

// 类型声明层：AtomKind 有 5 个值（其中 2 个无生产者）—— 锁定「声明与生产者不一致」这一事实
import type { AtomKind } from "../dist/core/lineage.js";
const ALL_KINDS: AtomKind[] = ["experience", "metadata", "session", "task", "artifact"];
assert.equal(ALL_KINDS.length, 5, "AtomKind 声明 5 个值");
for (const k of ["session", "artifact"] as AtomKind[]) {
  assert.ok(!produced.has(k), `AtomKind 声明了 ${k}，但 deriveAtomKind 永不产出它`);
}

// ── ③ 两个「认知门」函数在生产中零调用点（本测试是它们唯一的引用） ──
// 判据：它们的**行为**仍可调用（非报错），但接线事实是「无调用者」。
// 这里只锁行为，接线事实由 `npm run audit:wiring` 的 A 段报告（ADR-0062/0063）。
assert.equal(isCognitiveAtom({ kind: "metadata" }), false, "isCognitiveAtom：metadata → 排除");
assert.equal(isCognitiveAtom({ kind: "experience" }), true, "isCognitiveAtom：experience → 放行");
assert.equal(isMetadataMemoryText("# shadow\n\n> 用户要点：「x」\n"), true, "文本启发式：entry=shadow + 用户要点 + 无材料无决策 → metadata");
assert.equal(isMetadataMemoryText("# shadow\n\n> 背景/材料：a.ts\n> 用户要点：「x」\n"), false, "有材料 → 不算会话元数据");
assert.equal(isMetadataMemoryText("# src/a.ts\n\n> 用户要点：「x」\n"), false, "entry 非 shadow → 不算会话元数据");

// ③b **两份实现口径不一致**（实测 4137 vs 110，窄 37 倍）——用一对具体输入钉住分歧：
const bothProbe = "# src/a.ts\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n\n- [10:00:00] [src/a.ts] 改/读 src/a.ts\n";
const parsedProbe = parseMemory(bothProbe, "2026-09-11/2026-09-11--100000-src-a.ts.md", "2026-09-11--100000-src-a.ts.md");
assert.equal(parsedProbe.kind, "experience", "有材料行 → experience");
const noComp = "# shadow\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n\n- [10:00:00] [shadow] 改/读 a.ts\n";
const parsedNoComp = parseMemory(noComp, "2026-09-11/2026-09-11--100001-shadow.md", "2026-09-11--100001-shadow.md");
assert.equal(parsedNoComp.kind, "metadata", "entry=shadow 且无材料无决策 → deriveAtomKind 判 metadata（即使有动作行）");
assert.equal(isMetadataMemoryText(noComp), false, "同一份文本，文本启发式**不**判 metadata（它要求有用户要点）⇒ 两份实现口径确实不一致");

// ── ④ 投影路径确实按 kind 拦人（driving 事实） ──
const asAtom = (kind: any) => ({
  rel: "x", date: "2026-09-11", time: "100000", entry: "shadow", project: "", agent: "", goal: "",
  decisions: [], decisionEvents: [], userMessages: [], materials: [], actions: [], thinkLines: [], body: "",
  kind, lineage: { source: "s", createdBy: "agent", evidence: [], createdAt: "2026-09-11 10:00:00" },
});
assert.equal(deriveShadowNodes([asAtom("metadata")]).length, 0, "metadata 原子不产出节点");
assert.equal(deriveShadowNodes([asAtom("experience")]).length, 1, "experience 原子产出节点");

console.log("✔ atom-kind-gate：AtomKind 可达性(3/5) + session 分支不可达 + metadata 分支可达 + 两份认知门实现口径分歧 + 投影按 kind 拦人");
console.log("   ⚠ 本文件是**决策锁**（ADR-0063 / 待办 D5）：D5 裁决后请同步改本文件，不要删掉这些断言。");

console.log("ALL PASS ✅");
