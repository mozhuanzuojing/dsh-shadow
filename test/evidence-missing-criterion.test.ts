// dsh-shadow —— 证据「缺失」判定的**双条件**必须在**所有**消费者上成立（ADR-0070）。
//
// 背景（由 `tools/audit-drift.ts` 的检测 B 抓到，第 7 处同类缺陷）：
// ADR-0059 定的判据是**双条件** —— 只有「① 引用是**可检查的具体路径**（排除 glob / git ref）
// **且** ② 它确实解析不到」才算「证据缺失」（借 CASCADE/FSE 2026）。
//
// 同一判据在两个消费点上被表达：
//   · `observer/arbitrate.ts:92`  `.filter(isPathLike).filter(isConcreteLocator)` —— **正确**
//   · `observer/judgment.ts:26`   `.filter(isPathLike)`                        —— **漏了 ①**
// 而 `evidence/paths.ts:22-24` 的注释明文写着：*「`isPathLike` **故意不收窄** …… 需要「可检查」
// 语义的地方用 `isConcreteLocator`」* —— 契约被违反在一处。
//
// 后果（实测真语料）：`judgment.ts` 对 glob（`scripts/*.ps1`）与 git ref（`origin/main`）也做
// 存在性检查 ⇒ 必然 `not_found` ⇒ `conflictCount++` ⇒ 结论**假降为 `evidence_stale`**、置信度假降。
// 真语料实测受影响 **12 条（0.49%）**、非具体 locator 17 处。
//
// 本测试用**已知答案**：通配符引用**不得**被判冲突；真实不存在的具体路径**必须**被判冲突。
import assert from "node:assert/strict";
import { judgmentOfClaim } from "../dist/observer/judgment.js";
import { conflictOf } from "../dist/observer/arbitrate.js";

/** 按「磁盘上有没有这条路径」作答的假 Gateway（只认具体路径）。 */
const fakeGateway = async (ref: any) => {
  const onDisk = new Set(["src/real.ts", "docs/guide.md"]);
  const found = onDisk.has(String(ref.path));
  return { status: found ? "verified" : "not_found", source: "fs", matches: [], confidence: found ? 0.99 : 0.01 };
};

/** 让 `readRel` 能取到被测记忆文本（`judgmentOfClaim` 内部会读它）。 */
const mkFs = (memText: string): any => ({
  async resolve(p: string) { return { targetKey: p, displayPath: p }; },
  async readText() { return memText; },
  async writeText() { return { version: "v1" }; },
  async listDir() { return []; },
});

const mem = (evidence: string) =>
  `# comp-a\n\n> 完整线索\n> 摘要：改了 comp-a\n> 背景/材料：${evidence}\n> 决策：〔user〕做 A\n> 概况：1 动作 · 0 用户消息 · 1 决策\n\n- [10:00:00] [comp-a] 改/读 src/real.ts\n`;
const mm = { rel: ".shadow/2026-09-11/2026-09-11--100000-comp-a.md", date: "2026-09-11", time: "100000", name: "2026-09-11--100000-comp-a.md" };
const observer = { observerId: "ob-1" };

// ── ① 通配符引用：**不得**被判「证据缺失」（这是本测试要锁的核心） ──
{
  const text = mem("scripts/*.ps1");
  const j = await judgmentOfClaim(mkFs(text), "D:/ws", mm, observer, fakeGateway as any);
  assert.ok(j, "应产出 Judgment");
  assert.equal(j!.conclusion, "evidence_live",
    `通配符 \`scripts/*.ps1\` 不是「可检查的具体路径」，不得判 evidence_stale；实际 ${j!.conclusion}（rationale: ${j!.rationale}）`);
  console.log("✔ ① 通配符 locator 不产生假冲突（conclusion = evidence_live）");
}

// ── ② git ref：同样不得被判冲突 ──
{
  const text = mem("origin/main");
  const j = await judgmentOfClaim(mkFs(text), "D:/ws", mm, observer, fakeGateway as any);
  assert.equal(j!.conclusion, "evidence_live", `git ref \`origin/main\` 不是可检查路径；实际 ${j!.conclusion}`);
  console.log("✔ ② git ref 不产生假冲突");
}

// ── ③ **反向不变量**：真实不存在的**具体**路径**必须**仍被判冲突（别把门修没了） ──
{
  const text = mem("src/missing.ts");
  const j = await judgmentOfClaim(mkFs(text), "D:/ws", mm, observer, fakeGateway as any);
  assert.equal(j!.conclusion, "evidence_stale", `具体路径 \`src/missing.ts\` 确实不存在 ⇒ 必须判冲突；实际 ${j!.conclusion}`);
  assert.ok(/缺失/.test(j!.rationale), "rationale 应说明缺失");
  console.log("✔ ③ 反向不变量：真实缺失的**具体**路径仍判冲突（门没被修没）");
}

// ── ④ 存在的具体路径 → evidence_live ──
{
  const text = mem("src/real.ts");
  const j = await judgmentOfClaim(mkFs(text), "D:/ws", mm, observer, fakeGateway as any);
  assert.equal(j!.conclusion, "evidence_live", "存在的具体路径应判 evidence_live");
  console.log("✔ ④ 存在的具体路径 → evidence_live");
}

// ── ⑤ **跨消费者一致性锁**：同一批引用，`judgment.ts` 与 `arbitrate.ts` 的「缺失」判定必须一致 ──
//    这正是病根所在：两处表达同一判据、口径不同。用一个混合证据串同时喂两边。
{
  const cases: [string, number][] = [
    ["scripts/*.ps1", 0],            // glob → 不是缺失
    ["origin/main", 0],              // git ref → 不是缺失
    ["src/real.ts", 0],              // 存在 → 不是缺失
    ["src/missing.ts", 1],           // 不存在且具体 → 缺失 1 处
    ["scripts/*.ps1、src/missing.ts", 1], // 混合 → 只算具体那条
    ["docs/*.md、origin/main", 0],   // 全非具体 → 0
  ];
  for (const [evidence, want] of cases) {
    const text = mem(evidence);
    const j = await judgmentOfClaim(mkFs(text), "D:/ws", mm, observer, fakeGateway as any);
    const a = await conflictOf(mkFs(text), "D:/ws", text, fakeGateway as any);
    const fromJudgment = j!.conclusion === "evidence_stale" ? 1 : 0;
    const fromArbitrate = a.missing.length ? 1 : 0;
    assert.equal(fromArbitrate, want, `arbitrate 对 ${JSON.stringify(evidence)} 应判 ${want} 处缺失；实际 ${a.missing.length}`);
    assert.equal(fromJudgment, want, `judgment 对 ${JSON.stringify(evidence)} 应判 ${want} 处冲突；实际 ${j!.conclusion}`);
    assert.equal(fromJudgment, fromArbitrate, `两个消费者对 ${JSON.stringify(evidence)} 的判定必须一致（这是病根）`);
  }
  console.log(`✔ ⑤ 跨消费者一致性：${cases.length} 组混合证据上，judgment 与 arbitrate 判定完全一致`);
}

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机 Evidence Gateway（zg / fs）的 `not_found` 语义 —— 本测试用按契约写的假 Gateway；");
console.log("  · 影响面读数（12 条 / 0.49%）来自离线探针 `_research/judgment-locator-drift.ts`，不放进单元测试；");
console.log("  · `slice(0, 6)`（judgment）与 `slice(0, 12)`（arbitrate）的**候选数上限不同**是有意的，未做统一。");
console.log("ALL PASS ✅");
