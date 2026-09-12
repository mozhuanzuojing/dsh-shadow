#!/usr/bin/env node
// dsh-shadow —— test/proposal-firewall.test.ts：**语义防火墙**的闸（P1②，ADR-0082）。
//
// 这道闸防的是「**推断伪装成事实**」。它的失效方向只有一个且致命：
// **假事实进认知统计**（Pattern / M5 / 棘轮全都建立在事实之上）。
// 故**每一条不变量都必须有负例**，而且负例要覆盖用户点名的两种伪装：
//   ① `{type:"fact", source:"model-proposal"}`  ② `{type:"proposal", status:"validated"}`
import assert from "node:assert/strict";
import {
  validateRecord,
  projectFacts,
  factualOnly,
  candidateStats,
  type Proposal,
  type Confirmation,
} from "../dist/core/proposal.js";

const P = (over: Partial<Proposal> = {}): Proposal => ({
  type: "proposal",
  id: "p1",
  kind: "outcome",
  source: "model-proposal",
  model: "m-1",
  promptVersion: "v1",
  inputRefs: [{ file: "core/x.ts", line: 12 }],
  proposedRelation: "决策 A 的结果是 B",
  createdAt: "2026-09-01T00:00:00Z",
  ...over,
});

const C = (over: Partial<Confirmation> = {}): Confirmation => ({
  type: "confirmation",
  id: "c1",
  proposal: "p1",
  actor: "human",
  action: "confirm",
  timestamp: "2026-09-02T00:00:00Z",
  ...over,
});

// ① 正例：P + C(confirm) ⇒ 恰好 1 条事实，且链可追（P→C→F）
{
  const { facts, violations } = projectFacts([P(), C()]);
  assert.equal(violations.length, 0, "合法 P+C 不应有违规");
  assert.equal(facts.length, 1, "确认后必须恰好产生 1 条事实");
  assert.equal(facts[0].proposal, "p1", "事实必须指向 proposal（链可追）");
  assert.equal(facts[0].confirmation, "c1", "事实必须指向 confirmation（链可追）");
  assert.equal(facts[0].id, "fact-p1", "事实 id 必须确定性派生（同输入同结果）");
  console.log("✔ ① 正例：P+C(confirm) ⇒ 1 事实，P→C→F 三段可追，id 确定性");
}

// ② 负例（用户点名）：`type:"fact"` 一律拒收 —— **Proposal 冒充 Fact**
{
  const v = validateRecord({ type: "fact", source: "model-proposal", id: "f1" });
  assert.equal(v.length, 1);
  assert.ok(v[0].includes("一律拒收"), "必须是「一律拒收」而不是「字段有问题」——Fact 没有写入路径");
  const r = projectFacts([{ type: "fact", source: "model-proposal", id: "f1" }]);
  assert.equal(r.facts.length, 0, "冒充记录不得产生任何事实");
  assert.ok(r.violations.length >= 1);
  console.log("✔ ② `type:\"fact\"` 拒收（Fact 是投影，无写入路径 ⇒ 冒充在结构上不可能）");
}

// ③ 负例（用户点名）：`{type:"proposal", status:"validated"}` —— **改字段伪装**
{
  const v = validateRecord({ ...P(), status: "validated" });
  assert.equal(v.length, 1);
  assert.ok(v[0].includes("伪装字段"), `必须报「伪装字段」，实际：${v[0]}`);
  // 伪装记录被拒 ⇒ 即使再给一条 confirmation，也不得产生事实
  const r = projectFacts([{ ...P(), status: "validated" }, C()]);
  assert.equal(r.facts.length, 0, "被拒的 proposal 不得成为事实（哪怕有 confirmation）");
  console.log("✔ ③ `status` 等状态字段 = 伪装字段，拒收；且不得因「有 confirmation」而复活");
}

// ④ 负例：缺 `inputRefs`（「基于什么提议」不在场）⇒ 拒收
{
  const v = validateRecord({ ...P(), inputRefs: [] });
  assert.equal(v.length, 1);
  assert.ok(v[0].includes("inputRefs"));
  const noRefs = { ...P(), inputRefs: [] as never };
  assert.equal(projectFacts([noRefs, C()]).facts.length, 0, "没有输入引用的候选不得成为事实");
  console.log("✔ ④ 缺 inputRefs ⇒ 拒收（候选连被复核的资格都没有）");
}

// ⑤ 负例：confirmation 指向不存在的 proposal ⇒ 违规，且不产生事实
{
  const r = projectFacts([C({ proposal: "ghost" })]);
  assert.equal(r.facts.length, 0);
  assert.ok(r.violations.some((v) => v.includes("不存在的 proposal")));
  console.log("✔ ⑤ confirmation 指向不存在的 proposal ⇒ 违规（悬空引用不静默）");
}

// ⑥ 负例：**模型不能确认自己**（actor 无 model）
{
  const v = validateRecord({ ...C(), actor: "model" });
  assert.equal(v.length, 1);
  assert.ok(v[0].includes("模型不能确认自己"));
  console.log("✔ ⑥ actor=model ⇒ 拒收（模型可以提议，不能断言）");
}

// ⑦ **核心不变量**：只有 FACT 能改变认知统计 —— 候选一条也不得进入统计入口
{
  assert.equal(factualOnly([P()]).length, 0, "只有候选、无确认 ⇒ 统计入口必须看到 0 条");
  assert.equal(factualOnly([P(), C()]).length, 1, "确认后 ⇒ 1 条");
  assert.equal(factualOnly([P(), C(), C({ id: "c2", action: "revoke", timestamp: "2026-09-03T00:00:00Z" })]).length, 0,
    "撤销后 ⇒ 事实消失（历史保留在 records 里，但事实为 0）");
  console.log("✔ ⑦ 只有 FACT 能进认知统计：候选=0 · 确认=1 · 撤销=0");
}

// ⑧ 撤销/拒绝是**授权事件**，不是事实状态：历史保留、可追
{
  const records = [P(), C(), C({ id: "c2", action: "revoke", timestamp: "2026-09-03T00:00:00Z" })];
  const r = projectFacts(records);
  assert.equal(r.facts.length, 0);
  assert.equal(records.filter((x) => (x as { type: string }).type === "confirmation").length, 2,
    "两条授权事件都必须保留（Confirmation 是事件，不是状态）");
  // 同刻并列时按 id 升序取最后一条 ⇒ 确定性（不依赖插入顺序）
  const a = projectFacts([P(), C({ id: "c1", action: "reject", timestamp: "2026-09-03T00:00:00Z" }), C({ id: "c9", action: "confirm", timestamp: "2026-09-03T00:00:00Z" })]);
  const b = projectFacts([P(), C({ id: "c9", action: "confirm", timestamp: "2026-09-03T00:00:00Z" }), C({ id: "c1", action: "reject", timestamp: "2026-09-03T00:00:00Z" })]);
  assert.deepEqual(a.facts.map((f) => f.id), b.facts.map((f) => f.id), "同刻并列必须与插入顺序无关");
  console.log("✔ ⑧ Confirmation 是事件（历史保留、撤销即失事实），同刻裁决与插入顺序无关");
}

// ⑨ 候选可见性（防 Silent Candidate Graveyard）：不污染主认知，但**必须可见**
{
  const records = [
    P({ id: "p1", createdAt: "2026-09-01T00:00:00Z" }),
    P({ id: "p2", createdAt: "2026-08-01T00:00:00Z" }),
    P({ id: "p3", createdAt: "2026-09-10T00:00:00Z" }),
    C({ id: "c1", proposal: "p1", action: "confirm" }),
    C({ id: "c2", proposal: "p2", action: "reject", timestamp: "2026-09-02T00:00:00Z" }),
  ];
  const s = candidateStats(records, "2026-09-12T00:00:00Z");
  assert.equal(s.candidates, 3);
  assert.equal(s.confirmed, 1);
  assert.equal(s.rejected, 1);
  assert.equal(s.pendingConfirmation, 1, "p3 无人看 ⇒ 待确认（**不计入分母**）");
  assert.equal(s.oldestCandidateDays, 42, "最老候选年龄（2026-08-01 → 09-12）");
  assert.equal(s.acceptanceRate, 0.5, "acceptance = 1/(1+1)");
  assert.equal(s.rejectionRate, 0.5);
  console.log("✔ ⑨ 候选可见性：条数/最老年龄/待确认/接受率（待确认不入分母）");
}

// ⑩ 分母为 0 ⇒ **报「不可测」（null），不报 0**（本仓既有纪律）
{
  const s = candidateStats([P({ id: "p1" })], "2026-09-12T00:00:00Z");
  assert.equal(s.acceptanceRate, null, "无人裁决时 acceptanceRate 必须为 null（不可测），不得是 0");
  assert.equal(s.rejectionRate, null);
  assert.equal(s.oldestCandidateDays, 11);
  console.log("✔ ⑩ 分母为 0 ⇒ 报不可测（null），不报 0");
}

// ⑪ 严格白名单：未列出的字段一律拒收（防未来偷偷加字段绕过语义）
{
  const v = validateRecord({ ...P(), extra: 1 });
  assert.equal(v.length, 1);
  assert.ok(v[0].includes("未白名单字段"));
  console.log("✔ ⑪ 严格白名单：未列出字段拒收");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · **本闸只覆盖内存中的记录校验与投影**，不涉及落盘（存储位置/格式未定，见 `adr/0082` §6）；");
console.log("  · **没有真实 LLM 产生者**（P1③ 未做），故「模型为什么会提这个候选」只验到 `inputRefs` 在场，未验其内容可信；");
console.log("  · **没有 Confirmation 入口**（载体刻意延迟决定），故 actor 只能是 human/tool/ci 这三个枚举值，无法验证真实调用方；");
console.log("  · `factualOnly` 是**约定的唯一统计入口**，但**尚无强制手段阻止**未来某个统计直接吃 records ——");
console.log("    该强制留给 P1 接入 M3 时做（届时可加「统计模块不得 import projectFacts 之外的读取面」的门）。");
console.log("ALL PASS ✅");
