#!/usr/bin/env node
// dsh-shadow —— test/decision-outcome.test.ts：**M1 确定性结果归属**的闸（ADR-0081 + ADR-0082）。
//
// 这道闸守三件事：
//   ① 归属规则**确定性且保守**（并列不归属、窗内取最晚前驱、与输入顺序无关）；
//   ② **结果事实只能经原语产生**（本模块不返回事实；冒充 fact 仍被拒）；
//   ③ **年龄只暴露风险，不改变状态**（换 `now` 不改变归属与事实）。
import assert from "node:assert/strict";
import {
  attributeOutcomes,
  toPrimitiveRecords,
  outcomeReadout,
  renderOutcomeReadout,
  p90,
  ATTRIBUTION_RULE,
  type DecisionRecord,
  type OutcomeObservation,
} from "../dist/core/decision-outcome.js";
import { projectFacts } from "../dist/core/proposal.js";

const D = (over: Partial<DecisionRecord> = {}): DecisionRecord => ({
  id: "d1",
  key: "api-sync",
  at: "2026-01-01T00:00:00Z",
  action: "拆成两个接口",
  ...over,
});
const O = (over: Partial<OutcomeObservation> = {}): OutcomeObservation => ({
  id: "o1",
  key: "api-sync",
  at: "2026-01-10T00:00:00Z",
  actual: "返工下降",
  source: "user",
  inputRefs: [{ file: ".shadow/2026-01-01/x.md", line: 3 }],
  ...over,
});

// ① 正例：同 key + 窗内 ⇒ 1 归属；且**事实必须经原语**产生
{
  const r = attributeOutcomes({ decisions: [D()], observations: [O()], windowDays: 30 });
  assert.equal(r.attributions.length, 1);
  assert.equal(r.attributions[0].decision, "d1");
  assert.equal(r.attributions[0].lagDays, 9);
  assert.equal(r.attributions[0].rule, ATTRIBUTION_RULE);
  const { proposals, confirmations } = toPrimitiveRecords(r, [O()]);
  const { facts, violations } = projectFacts([...proposals, ...confirmations]);
  assert.equal(violations.length, 0);
  assert.equal(facts.length, 1, "归属必须经 Proposal+Confirmation 才能变成 1 条事实");
  assert.equal(facts[0].kind, "outcome");
  assert.equal(facts[0].statement, "返工下降");
  console.log("✔ ① 同 key 窗内 ⇒ 1 归属 · 经原语 ⇒ 1 事实（本模块不返回事实）");
}

// ② 负例：不同 key ⇒ 不归属，且**可见**（unattributed，不静默丢弃）
{
  const r = attributeOutcomes({ decisions: [D()], observations: [O({ key: "other" })], windowDays: 30 });
  assert.equal(r.attributions.length, 0);
  assert.equal(r.unattributed.length, 1);
  console.log("✔ ② 不同 key ⇒ 不归属（且可见）");
}

// ③ 负例：超出时间窗 ⇒ 不归属
{
  const r = attributeOutcomes({ decisions: [D()], observations: [O({ at: "2026-02-15T00:00:00Z" })], windowDays: 30 });
  assert.equal(r.attributions.length, 0);
  assert.equal(r.unattributed.length, 1);
  console.log("✔ ③ 超窗 ⇒ 不归属（窗由调用方给，不是硬编码）");
}

// ④ 负例（**保守性的核心**）：最晚前驱并列 ⇒ 不归属，且计入 ambiguous
{
  const r = attributeOutcomes({
    decisions: [D({ id: "d1", at: "2026-01-01T00:00:00Z" }), D({ id: "d2", at: "2026-01-01T00:00:00Z" })],
    observations: [O()],
    windowDays: 30,
  });
  assert.equal(r.attributions.length, 0, "并列最晚前驱必须**不归属**（宁可少归属，不可错归属）");
  assert.equal(r.ambiguous.length, 1);
  assert.deepEqual([...r.ambiguous[0].candidates], ["d1", "d2"]);
  console.log("✔ ④ 最晚前驱并列 ⇒ 不归属 + 计入 ambiguous（保守且可见）");
}

// ⑤ 取**最晚前驱**（两个都在窗内时，归给更近的那个）
{
  const r = attributeOutcomes({
    decisions: [D({ id: "d1", at: "2026-01-01T00:00:00Z" }), D({ id: "d2", at: "2026-01-08T00:00:00Z" })],
    observations: [O()],
    windowDays: 30,
  });
  assert.equal(r.attributions.length, 1);
  assert.equal(r.attributions[0].decision, "d2", "必须归给最晚前驱");
  console.log("✔ ⑤ 窗内多个前驱 ⇒ 归最晚前驱（确定性）");
}

// ⑥ 与输入顺序无关（同输入不同排列 ⇒ 输出逐字相同）
{
  const ds = [D({ id: "d1" }), D({ id: "d2", at: "2026-01-08T00:00:00Z" })];
  const os = [O({ id: "o1" }), O({ id: "o2", at: "2026-01-11T00:00:00Z" })];
  const a = attributeOutcomes({ decisions: ds, observations: os, windowDays: 30 });
  const b = attributeOutcomes({ decisions: [...ds].reverse(), observations: [...os].reverse(), windowDays: 30 });
  assert.deepEqual(a, b, "归属结果必须与输入顺序无关");
  console.log("✔ ⑥ 与输入顺序无关");
}

// ⑦ 未给 key 的决策/观察：默认**跳过**（保守），也可显式放开
{
  const skip = attributeOutcomes({ decisions: [D({ key: "" })], observations: [O({ key: "" })], windowDays: 30 });
  assert.equal(skip.attributions.length, 0);
  assert.equal(skip.unattributed.length, 1);
  const lenient = attributeOutcomes({ decisions: [D({ key: "" })], observations: [O({ key: "" })], windowDays: 30, unkeyed: "include-as-unkeyed" });
  assert.equal(lenient.attributions.length, 1, "显式放开时才允许空键参与比对");
  console.log("✔ ⑦ 空键默认跳过（保守），可显式放开");
}

// ⑧ **只有事实进统计**：候选（Attribution）本身不得被当成事实；冒充 fact 仍被拒
{
  const r = attributeOutcomes({ decisions: [D()], observations: [O()], windowDays: 30 });
  assert.equal("facts" in r, false, "本模块**不得**返回事实 —— 事实只能来自 projectFacts");
  const forged = projectFacts([{ type: "fact", id: "f1", source: "tool" }]);
  assert.equal(forged.facts.length, 0, "直接写 fact 仍被拒（P1 的防火墙在这里照样生效）");
  assert.ok(forged.violations.length >= 1);
  console.log("✔ ⑧ 候选≠事实：本模块不返回 facts；直接写 fact 仍被拒");
}

// ⑨ pending 读数：条数 + 年龄分布 + 最老 + p90；**不可测报 null 而非 0**
{
  const decisions = [
    D({ id: "d1", at: "2026-09-11T00:00:00Z" }), // 1d
    D({ id: "d2", at: "2026-09-01T00:00:00Z" }), // 11d
    D({ id: "d3", at: "2026-08-01T00:00:00Z" }), // 42d
    D({ id: "d4", at: "2026-01-01T00:00:00Z" }), // 254d
  ];
  const settled = attributeOutcomes({ decisions, observations: [O({ key: "api-sync", at: "2026-01-05T00:00:00Z" })], windowDays: 30 });
  const r = outcomeReadout({ decisions, result: settled }, "2026-09-12T00:00:00Z");
  assert.equal(r.decisions, 4);
  assert.equal(r.settled, 1, "d4 有结果 ⇒ 已结算（**年龄不改变状态**）");
  assert.equal(r.pending, 3);
  assert.equal(r.pendingOpen, 3, "缺省 disposition = open ⇒ 全部是「在等」");
  assert.equal(r.pendingDeferred, 0);
  assert.equal(r.unconsidered, 0, "本次 result 覆盖全部决策 ⇒ 无「未参与归属」");
  assert.deepEqual(r.buckets, { lt7: 1, d7to30: 1, d30to90: 1, ge90: 0 });
  assert.equal(r.oldest?.id, "d3");
  assert.equal(r.oldest?.ageDays, 42);
  assert.equal(r.pendingAgeP90, 42, "3 个年龄 [1,11,42] 的 nearest-rank p90 = 42");
  const line = renderOutcomeReadout(r);
  assert.ok(line.includes("待结算 3") && line.includes("p90 42d") && line.includes("最老"));
  console.log("✔ ⑨ pending 读数：分布 / 最老 / p90（nearest-rank）");

  const none = outcomeReadout({ decisions: [decisions[0]], result: attributeOutcomes({ decisions: [decisions[0]], observations: [O({ at: "2026-09-15T00:00:00Z" })], windowDays: 30 }) }, "2026-09-12T00:00:00Z");
  assert.equal(none.pending, 0);
  assert.equal(none.pendingAgeP90, null, "无 pending ⇒ p90 报 null（**不可测，不报 0**）");
  console.log("✔ ⑨b 无 pending ⇒ p90 = null（不可测不报 0）");
}

// ⑫ F6（M1-A′ dry run 发现）：**「刻意不做」与「忘了做」必须可分** —— 否则年龄读数把两者一起报成积压
{
  const decisions = [
    D({ id: "open-1", at: "2026-06-01T00:00:00Z" }), // 在等，103d
    D({ id: "open-2", at: "2026-09-10T00:00:00Z" }), // 在等，2d
    D({ id: "defer-1", at: "2026-01-01T00:00:00Z", disposition: "deliberate-deferral" }), // 刻意推迟，254d
  ];
  const r = outcomeReadout({ decisions, result: attributeOutcomes({ decisions, observations: [], windowDays: 30 }) }, "2026-09-12T00:00:00Z");
  assert.equal(r.pending, 3, "pending 仍是三段之和");
  assert.equal(r.pendingOpen, 2);
  assert.equal(r.pendingDeferred, 1);
  assert.equal(r.pending, r.pendingOpen + r.pendingDeferred, "pending = open + deferred（可机械断言）");
  assert.equal(r.oldest?.id, "open-1", "最老**只看 open**：刻意推迟的 254d 不算积压");
  assert.equal(r.buckets.ge90, 1, "★ 只有 open-1（103d）进 ≥90d —— 刻意推迟的 254d **不进任何桶**");
  assert.equal(r.buckets.d30to90, 0);
  assert.equal(r.buckets.lt7, 1, "open-2（2d）");
  assert.equal(r.buckets.lt7 + r.buckets.d7to30 + r.buckets.d30to90 + r.buckets.ge90, r.pendingOpen,
    "四个桶之和必须等于 pendingOpen（刻意推迟不进桶，但它在 pending 里）");
  assert.equal(r.pendingAgeP90, 103, "p90 只吃 open 的年龄 [103, 2] ⇒ 取较大者");
  const line = renderOutcomeReadout(r);
  assert.ok(line.includes("刻意推迟 1（不计入积压）"), "渲染必须显式说明「不计入积压」");
  console.log("✔ ⑫ F6：刻意推迟单独计数，年龄/最老/p90 **只统计 open**");
}

// ⑬ 无键 / 未参与归属的决策**不是「在等」**，且差额必须叫响（缺件不静默）
{
  const decisions = [D({ id: "no-key", key: "" }), D({ id: "keyed" })];
  const result = attributeOutcomes({ decisions, observations: [], windowDays: 30 });
  assert.deepEqual(result.considered, ["keyed"], "无键决策不参与归属");
  const r = outcomeReadout({ decisions, result }, "2026-09-12T00:00:00Z");
  assert.equal(r.pending, 1, "只有 keyed 在等");
  assert.equal(r.unconsidered, 1, "无键的必须单独报，不得混进 pending");
  assert.ok(renderOutcomeReadout(r).includes("未参与归属 1"));

  // 调用方拿**子集**算的 result 配**全集** decisions ⇒ 差额同样叫响（不猜、不静默）
  const subset = attributeOutcomes({ decisions: [decisions[1]], observations: [], windowDays: 30 });
  assert.equal(outcomeReadout({ decisions, result: subset }, "2026-09-12T00:00:00Z").unconsidered, 1);
  console.log("✔ ⑬ 无键/未参与 ⇒ 不计入 pending，且差额叫响");
}

// ⑭ F7：`lagDays` 是整日粒度**会丢分辨率** ⇒ 同时给 `lagHours`（同日晚 5 小时 vs 5 分钟都能区分）
{
  const r = attributeOutcomes({
    decisions: [D({ id: "d1", at: "2026-09-01T08:00:00Z" })],
    observations: [
      O({ id: "o-5min", at: "2026-09-01T08:05:00Z" }),
      O({ id: "o-5h", at: "2026-09-01T13:00:00Z" }),
    ],
    windowDays: 30,
  });
  assert.equal(r.attributions.length, 2);
  assert.deepEqual(r.attributions.map((a) => a.lagDays), [0, 0], "整日粒度下两者都是 0d（**这就是分辨率丢失**）");
  assert.deepEqual(r.attributions.map((a) => a.lagHours), [5, 0], "输出按观察 id 排序（`o-5h` 在前）：5 小时=5h、5 分钟=0h（floor，不插值）");
  console.log("✔ ⑭ F7：lagHours 补上整日粒度丢失的分辨率（floor，不插值）");
}

// ⑯ **枚举外的 `disposition` 不得落回默认值**（审查发现：我自己新加的这个字段原先没有校验点）
{
  const decisions = [
    D({ id: "ok", at: "2026-09-01T00:00:00Z" }),
    D({ id: "defer", at: "2026-09-01T00:00:00Z", disposition: "deliberate-deferral" }),
    D({ id: "bogus", at: "2026-01-01T00:00:00Z", disposition: "deferred" as never }), // 枚举外（少写了 deliberate-）
  ];
  const r = outcomeReadout({ decisions, result: attributeOutcomes({ decisions, observations: [], windowDays: 30 }) }, "2026-09-12T00:00:00Z");
  assert.equal(r.pending, 3);
  assert.equal(r.pendingOpen, 1, "只有明确的 open 才算「在等」");
  assert.equal(r.pendingDeferred, 1);
  assert.equal(r.invalidDisposition, 1, "★ 枚举外的值必须**单独报**，不得静默落进 open 桶");
  assert.equal(r.pendingOpen + r.pendingDeferred + r.invalidDisposition, r.pending, "三段之和 = pending（可机械断言）");
  assert.equal(r.oldest?.id, "ok", "★ 非法值那条（2026-01-01，254d）**不得**成为「最老」污染积压读数");
  assert.equal(r.buckets.ge90, 0, "★ 非法值不得进任何年龄桶");
  assert.ok(renderOutcomeReadout(r).includes("disposition 非法 1"));
  console.log("✔ ⑯ 枚举外的 disposition 单列，不污染 buckets / 最老 / p90");
}

// ⑮ `missing`：归属引用了、调用方没传的观察 ⇒ **报出来**，不静默少一条事实
{
  const decisions = [D({ id: "d1" })];
  const obs = [O({ id: "o1" })];
  const result = attributeOutcomes({ decisions, observations: obs, windowDays: 30 });
  const ok = toPrimitiveRecords(result, obs);
  assert.equal(ok.missing.length, 0);
  assert.equal(ok.proposals.length, 1);
  const lost = toPrimitiveRecords(result, []);
  assert.equal(lost.proposals.length, 0, "观察没传 ⇒ 造不出事实（**不猜、不编**）");
  assert.deepEqual(lost.missing, ["o1"], "但必须**报出缺了哪条**（ADR-0049：缺件不静默）");
  assert.ok(lost.missing.length > 0, "曾经这里是 `continue` 静默跳过 —— 注释写了要报，代码没报");
  console.log("✔ ⑮ toPrimitiveRecords 报 `missing`：观察缺失时不少一条事实还不出声");
}

// ⑩ **年龄不改变状态**：换 `now` 不改变归属，只改变读数
{
  const decisions = [D({ id: "d1", at: "2026-01-01T00:00:00Z" })];
  const result = attributeOutcomes({ decisions, observations: [], windowDays: 30 });
  const t1 = outcomeReadout({ decisions, result }, "2026-02-01T00:00:00Z");
  const t2 = outcomeReadout({ decisions, result }, "2027-02-01T00:00:00Z");
  assert.equal(t1.pending, t2.pending, "年龄不得把 pending 变成别的状态");
  assert.equal(t1.settled, t2.settled);
  assert.notEqual(t1.pendingAgeP90, t2.pendingAgeP90, "只有读数随 now 变");
  assert.equal(result.attributions.length, 0, "归属不受 now 影响（本模块不读时钟）");
  console.log("✔ ⑩ 年龄只暴露风险：换 now 只改读数，不改状态");
}

// ⑪ p90 自身：空 ⇒ null；单元素 ⇒ 该值；nearest-rank 不插值
{
  assert.equal(p90([]), null);
  assert.equal(p90([5]), 5);
  assert.equal(p90([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 9, "nearest-rank：ceil(0.9*10)-1 = 8 ⇒ 第 9 个 = 9");
  console.log("✔ ⑪ p90 nearest-rank（不插值，不造出不存在的年龄）");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · **归属键 `key` 由调用方显式传入** —— 本模块**不推断** entry/subject（`ObservationTrace` 里没有 `entry` 字段）；");
console.log("    因此「key 从哪来」这条链**未接**（属 M1③ 的显式入口设计）；");
console.log("  · **没有落盘**：结果事实目前只存在于内存记录里（存储位置未定，见 `adr/0082` §6）；");
console.log("  · **没有接进任何读路径**（`read_shadow` 尚未渲染这些事实/读数）⇒ 目前没有生产消费者；");
console.log("  · `windowDays` 由调用方给，**取多少未定**（须走 config，见 `adr/0081` §5）。");
console.log("ALL PASS ✅");
