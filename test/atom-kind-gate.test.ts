// dsh-shadow —— 认知门（AtomKind gate）的一致性锁（ADR-0063 分诊 → ADR-0066 定稿）。
//
// **本文件锁的是「两条判准必须给出同一答案」这一不变量**，不是某一次的读数。
// 背景：本仓曾有**三份口径互不相同的实现**（`isCognitiveAtom` 按 kind、
// `isMetadataMemoryText` 按文本、`deriveAtomKind` 的旧判准），而**生效的只有第三份**，
// 且第三份的精度实测仅 **9.8%**（判 4744 条 metadata，其中 4279 条其实有工作痕迹），
// 把 **66.9% 的库**挡在 `shadow_query` 之外 ⇒ 主题召回与 `shadow_query` 可见性相差 66.9%（漂移）。
//
// ADR-0066 定稿：判据收敛到 `isSessionMetadataAtom`（精度 100%、只挡 1.3%）；
// `isCognitiveAtom` 已删除（规则与 `validateAtomProjection` 完全重复）。
// 本文件保证「字段口径」与「文本口径」不会再次分叉。
import assert from "node:assert/strict";
import { deriveAtomKind, isSessionMetadataAtom, isMetadataMemoryText, parseMemory, type ParsedMemory } from "../dist/core/episode.js";
import type { AtomKind } from "../dist/core/lineage.js";
import { validateAtomProjection } from "../dist/core/lineage-validator.js";
import { deriveShadowNodes } from "../dist/core/node.js";

// ── ① 判据本体：只在「有用户要点 + 无材料 + 无决策 + entry 是兜底字面量」时成立 ──
const M = (o: Partial<{ entry: string; materials: string[]; decisions: string[]; userMessages: string[] }>) =>
  isSessionMetadataAtom({ entry: "shadow", materials: [], decisions: [], userMessages: [], ...o } as any);

assert.equal(M({ userMessages: ["用户打开项目"] }), true, "有用户要点、无材料无决策 → 会话元数据");
assert.equal(M({ userMessages: [] }), false, "无用户要点 → 不是元数据（哪怕 entry=shadow）");
assert.equal(M({ userMessages: ["x"], materials: ["a.ts"] }), false, "有材料 → 有可执行内容，不是元数据");
assert.equal(M({ userMessages: ["x"], decisions: ["d"] }), false, "有决策 → 不是元数据");
assert.equal(M({ entry: "src/a.ts", userMessages: ["x"] }), false, "entry 不是兜底字面量 → 不是元数据");
console.log("✔ ① 判据本体：四条同时成立才算会话元数据（有用户要点 / 无材料 / 无决策 / entry=shadow）");

// ── ② AtomKind 可达性：声明 5 值，生产者仍只出 3 值（`session`/`artifact` 无生产者） ──
const probes = [
  { entry: "shadow", materials: [], decisions: [], goal: "", userMessages: ["x"] },   // → metadata
  { entry: "shadow", materials: [], decisions: [], goal: "", userMessages: [] },      // → experience
  { entry: "src/a.ts", materials: ["p"], decisions: [], goal: "", userMessages: [] }, // → experience
  { entry: "x", materials: [], decisions: ["d"], goal: "", userMessages: [] },        // → experience
  { entry: "x", materials: [], decisions: [], goal: "g", userMessages: [] },          // → experience
  { entry: "x", materials: [], decisions: [], goal: "", userMessages: ["todo"] },     // → task
];
const produced = new Set(probes.map((p) => deriveAtomKind(p as any)));
assert.deepEqual([...produced].sort(), ["experience", "metadata", "task"], "deriveAtomKind 只产出 experience/task/metadata");
for (const k of ["session", "artifact"]) {
  assert.ok(!produced.has(k as any), `AtomKind 声明了 ${k}，但 deriveAtomKind 永不产出它（已在 lineage-validator 注释标明）`);
}
console.log("✔ ② AtomKind 可达性：生产者只出 3 值（session / artifact 无生产者，该分支永不可达）");

// ── ③ 判据与 kind 的绑定是**有向**的：kind=metadata ⟹ 判据成立；反之**不必然** ──
// 原因（本测试实测得出）：`task` 分支（`/todo|plan|待办|任务|尚未|未完成|next|backlog/`，
// 且它扫的是 `entry + materials + userMessages + goal` 拼成的文本）**优先于** metadata 分支。
// 故一条「用户只说了句『记下待办』」的记忆会被判 `task`，而不是 `metadata`。
// **这不是缺陷**：`task` 不被投影门挡（可见性完全不受影响），且标成 task 语义更准。
// 但它是「判据 ⟺ kind」这个双向等价的**反例**，必须显式钉住，否则以后有人会误以为两者等价。
for (const p of probes) {
  const kind = deriveAtomKind(p as any);
  if (kind === "metadata") assert.equal(isSessionMetadataAtom(p as any), true, "kind=metadata 时判据必须成立（有向）");
}
const taskProbe = { entry: "shadow", materials: [], decisions: [], goal: "", userMessages: ["记下待办"] };
assert.equal(isSessionMetadataAtom(taskProbe), true, "判据成立：这条确实是「有用户要点、无材料无决策」");
assert.equal(deriveAtomKind(taskProbe), "task", "但 kind 是 task —— task 分支优先（有向绑定，不是等价）");
assert.equal(validateAtomProjection({ type: "memory", kind: "task" }).allowed, true, "task **不被门挡** ⇒ 优先级不影响可见性");
console.log("✔ ③ 绑定是**有向**的：kind=metadata ⟹ 判据成立；`task` 分支优先（task 不被门挡，可见性不受影响）");

// ── ④ **跨实现一致性锁**：字段口径 vs 文本口径，对同一份记忆必须同答 ──
// 这是本文件的核心不变量 —— 两份实现曾相差 37 倍（4137 vs 110），正是那次分叉造成了漂移。
// **两个口径**（都表达「会话元数据」这一判据，只是数据来源不同）必须同答；
// `kind` 另受 `task` 分支优先级影响，故它的期望值单独给。
//
// **实测暴露的表层差异（本测试钉住）**：两份实现读的**不是同一个表面** ——
//   · `isMetadataMemoryText` 读**线索头** `> 用户要点：`（整行正则）；
//   · `parseMemory.userMessages` 读**正文行** `- [..] [entry] 用户：…`。
// 真记忆**两者都写**（`buildClueHeader` 写头 + trace 写正文），故在真语料上一致；
// 只写头、不写正文的文本会让两份分叉。真语料不会那样 ⇒ 记为**已知边界**（见 ④b），不是缺陷。
const CASES: Array<[string, boolean, string]> = [
  // [文本, 判据期望（两个口径都必须同答）, kind 期望]
  ["# shadow\n\n> 完整线索\n> 用户要点：「先记录这条」\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [10:00:00] [shadow] 用户：先记录这条\n", true, "metadata"],
  ["# shadow\n\n> 完整线索\n> 用户要点：「x」\n> 背景/材料：a.ts\n\n- [10:00:00] [shadow] 用户：x\n", false, "experience"],
  ["# src/a.ts\n\n> 完整线索\n> 用户要点：「x」\n\n- [10:00:00] [src/a.ts] 用户：x\n", false, "experience"],
  ["# shadow\n\n> 完整线索\n> 用户要点：「x」\n> 决策：〔user〕做 A\n\n- [10:00:00] [shadow] 用户：x\n", false, "experience"],
  // 关键回归：**有工作痕迹但无用户要点** —— 旧判准把它当 metadata（精度 9.8% 的来源），新判准不是
  ["# shadow\n\n> 完整线索\n> 概况：0 动作 · 0 用户消息 · 0 决策\n\n- [10:00:00] [shadow] 改/读 core/x.ts\n", false, "experience"],
  ["# shadow\n\n> 完整线索\n> 概况：0 动作 · 0 用户消息 · 0 决策\n\n- [10:00:00] [shadow] 我在想这件事\n", false, "experience"],
  // 分支优先级：判据成立（有用户要点、无工作），但 kind 是 task（用户话里含待办词）
  ["# shadow\n\n> 完整线索\n> 用户要点：「记下待办」\n\n- [10:00:00] [shadow] 用户：记下待办\n", true, "task"],
];
for (const [text, wantMeta, wantKind] of CASES) {
  const parsed = parseMemory(text, "2026-09-11/2026-09-11--100000-shadow.md", "2026-09-11--100000-shadow.md");
  const byFields = isSessionMetadataAtom({ entry: parsed.entry, materials: parsed.materials, decisions: parsed.decisions, userMessages: parsed.userMessages });
  const byText = isMetadataMemoryText(text);
  const label = JSON.stringify(text.replace(/^# \w+/, "# …").slice(0, 32));
  assert.equal(byFields, wantMeta, `字段口径不符：${label} → ${byFields}`);
  assert.equal(byText, wantMeta, `文本口径不符：${label} → ${byText}`);
  assert.equal(parsed.kind, wantKind, `kind 不符：${label} → kind=${parsed.kind}`);
}
console.log(`✔ ④ 跨实现一致性：两个口径 + kind 在 ${CASES.length} 例上同答（含 2 例旧误判回归 + 1 例 task 优先级）`);

// ④b **已知边界**（钉住表层差异，不是缺陷）：只写线索头、不写正文行的文本，两份会分叉。
const headerOnly = "# shadow\n\n> 完整线索\n> 用户要点：「只有头，没有正文行」\n";
const parsedHeaderOnly = parseMemory(headerOnly, "2026-09-11/2026-09-11--100000-shadow.md", "2026-09-11--100000-shadow.md");
assert.equal(parsedHeaderOnly.userMessages.length, 0, "parseMemory 的用户话只来自正文行 ⇒ 头里的用户要点不进 userMessages");
assert.equal(isMetadataMemoryText(headerOnly), true, "文本口径读头 ⇒ 判为元数据");
// 先读一次 kind 进局部量：下一行 assert.equal 的断言签名会把 `parsedHeaderOnly.kind` 收窄成字面量
// "experience"，用被收窄的属性去比 "metadata" 会误报 TS2367。读到的仍是同一个值，判据不变。
const headerOnlyKind: AtomKind = parsedHeaderOnly.kind;
assert.equal(parsedHeaderOnly.kind, "experience", "字段口径读正文 ⇒ 判 experience");
assert.notEqual(
  isMetadataMemoryText(headerOnly), headerOnlyKind === "metadata",
  "两者在「只有头、无正文行」时**确实分叉** —— 真记忆两者都写，故此边界在真语料上不出现"
);
console.log("✔ ④b 已知边界已钉住：头口径 vs 正文口径（真记忆两者都写 ⇒ 真语料不分叉）");

// ── ⑤ 投影门：只有 metadata 被挡，且门后可见性大幅恢复 ──
const asAtom = (kind: any, userMessages: string[] = ["x"]): ParsedMemory => ({
  rel: "x", date: "2026-09-11", time: "100000", entry: "shadow", project: "", agent: "", goal: "",
  decisions: [], decisionEvents: [], userMessages, materials: [], actions: [], thinkLines: [], body: "",
  kind, lineage: { source: "s", createdBy: "agent", evidence: [], createdAt: "2026-09-11 10:00:00" },
});
assert.equal(deriveShadowNodes([asAtom("metadata")]).length, 0, "会话元数据不产出节点");
assert.equal(deriveShadowNodes([asAtom("experience")]).length, 1, "experience 产出节点");
assert.equal(validateAtomProjection({ type: "memory", kind: "metadata" }).allowed, false, "metadata 被门挡住（可达）");
assert.equal(validateAtomProjection({ type: "memory", kind: "session" }).allowed, false, "session 被挡（但该 kind 无生产者）");
assert.equal(validateAtomProjection({ type: "memory", kind: "experience" }).allowed, true, "experience 放行");
console.log("✔ ⑤ 投影门：metadata 被挡 / experience 放行（session 分支可达性见 ②）");

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真语料上的精度/遮挡率读数（100% / 1.3%）来自探针 `_research/d5-signal-experiment.ts`，");
console.log("    那需要真 `.shadow` 语料，不适合放进单元测试（测试不许依赖机器状态）；");
console.log("  · 本文件只锁**判据一致性与可达性**，不锁语料统计量。");
console.log("ALL PASS ✅");
