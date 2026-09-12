#!/usr/bin/env node
// dsh-shadow —— tools/retrieval-eval.selftest.ts：**确定性基准门**的标定测试（T14）。
//
// 为什么必须有：hl_mem 的 `compare_core_v1.py` **在整个 workflows 里零调用**（references §6.6 的洞之一）
// —— 门禁的比较函数没有负例测试、也没人执行它，**静默失效也没人知道**。
// 本文件用合成夹具逐条验证「门的每一类判据都会红」，并在 `--check-baseline` / `--determinism-check`
// 两条真仓库命令之外，保证**判据本身**可测。
import assert from "node:assert/strict";
import {
  stableStringify,
  sha256Hex,
  datasetHash,
  checkProtocol,
  checkAggregateOnly,
  compareEval,
  HASH_ALGORITHM,
  RESULT_FIELDS,
  type EvalProtocol,
} from "./retrieval-eval.lib.ts";

const PROTO = "8".repeat(64);
const DATA = "9".repeat(64);

const protocol: EvalProtocol = {
  protocol_version: "selftest-v1",
  baseline_tag: "selftest",
  gated_metrics: ["recall_mean", "noise_offtopic_mean", "avg_returned_mean"],
  metric_directions: { recall_mean: "higher", noise_offtopic_mean: "lower", avg_returned_mean: "exact" },
  tolerances: { recall_mean: 0.25, noise_offtopic_mean: 0.25, avg_returned_mean: 0 },
  required_external_model_calls: 0,
  k: 5,
  seeds: [1, 2, 3],
  max_docs: 1500,
};

const read = (recall: number, noise: number, budget: number) => ({
  recall_mean: recall,
  recall_range: 0,
  ndcg_mean: 0.5,
  avg_returned_mean: budget,
  noise_offtopic_mean: noise,
});

const doc = (metrics: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  protocol_version: "selftest-v1",
  baseline_tag: "selftest",
  provenance: "local_dev_aggregate_only",
  dataset_hash_algorithm: HASH_ALGORITHM,
  dataset_sha256: DATA,
  protocol_sha256: PROTO,
  case_count: 210,
  on_topic_count: 150,
  off_topic_count: 60,
  docs: 100,
  source_files: 100,
  k: 5,
  max_docs: 1500,
  seeds: [1, 2, 3],
  external_model_calls: 0,
  metrics,
  ...extra,
});

const baseline = doc({ S: read(0.5, 0.0, 3.5) });
const runCompare = (candidate: Record<string, unknown>) =>
  compareEval({ candidate, baseline, protocol, candidateProtocolSha256: PROTO, baselineProtocolSha256: PROTO });

// ① 正对照：完全相同的候选必须通过（否则后面所有负例都没意义）
{
  const r = runCompare(doc({ S: read(0.5, 0.0, 3.5) }));
  assert.equal(r.comparable, true);
  assert.equal(r.violations.length, 0, "同源同值必须零违规（正对照）");
  console.log("✔ ① 正对照：同源 + 指标相同 ⇒ 通过");
}

// ② 语料变了 ⇒ **不可比**（第三种结论，不是通过也不是失败），且理由必须说清「为什么」
{
  const r = runCompare(doc({ S: read(0.5, 0.0, 3.5) }, { dataset_sha256: "a".repeat(64), docs: 101, source_files: 101 }));
  assert.equal(r.comparable, false, "语料哈希不同必须判不可比");
  assert.ok(r.reason.includes("不可比"), "理由必须显式写出「不可比」");
  assert.ok(r.reason.includes("活"), "理由必须解释本仓语料是活的（为什么哈希钉死的基线不适用）");
  console.log("✔ ② 语料变化 ⇒ 不可比（显式第三结论 + 说明原因）");
}

// ③ case_count 变化同样触发不可比
{
  const r = runCompare(doc({ S: read(0.5, 0.0, 3.5) }, { case_count: 211, on_topic_count: 151 }));
  assert.equal(r.comparable, false);
  console.log("✔ ③ case_count 变化 ⇒ 不可比");
}

// ④ 协议不同源 ⇒ 违规（响亮失败，而不是悄悄跳过）
{
  const r = compareEval({
    candidate: doc({ S: read(0.5, 0.0, 3.5) }),
    baseline,
    protocol,
    candidateProtocolSha256: PROTO,
    baselineProtocolSha256: "7".repeat(64),
  });
  assert.equal(r.violations.filter((v) => v.rule === "协议同源").length, 1);
  console.log("✔ ④ 协议不同源 ⇒ 违规（先证同源、再比数值）");
}

// ⑤ 容差边界：恰好等于容差 ⇒ 通过；超出 ⇒ 违规，且报文**同时**给实测退化与允许量
//    注意：这里的数值刻意选**二进制可精确表示**的（0.5 / 0.25）—— 十进制直觉的 `0.5-0.01` 在 IEEE754 下
//    是 `-0.010000000000000009`，会让「恰好等于容差」这条断言**假红**（我第一版就踩了）。
{
  assert.equal(runCompare(doc({ S: read(0.25, 0.0, 3.5) })).violations.length, 0, "退化正好等于容差 ⇒ 必须通过");
  const bad = runCompare(doc({ S: read(0.2, 0.0, 3.5) }));
  assert.equal(bad.violations.length, 1);
  assert.ok(bad.violations[0].why.includes("退化"), "退化报文要写明退化量");
  assert.ok(bad.violations[0].why.includes("允许 0.25"), "退化报文要写明允许量");
  console.log("✔ ⑤ 容差边界：=容差通过、>容差违规，报文含退化量与允许量");
}

// ⑥ 反向指标（越低越好）：上涨超容差 ⇒ 违规
{
  assert.equal(runCompare(doc({ S: read(0.5, 0.25, 3.5) })).violations.length, 0, "上涨正好等于容差 ⇒ 通过");
  const bad = runCompare(doc({ S: read(0.5, 0.3, 3.5) }));
  assert.equal(bad.violations.filter((v) => v.rule === "noise_offtopic_mean 上涨").length, 1);
  console.log("✔ ⑥ 反向指标：上涨=容差通过、>容差违规");
}

// ⑦ `exact` 方向：差 1e-9 也违规（预算对照是「同候选预算」的硬约束）
{
  const bad = runCompare(doc({ S: read(0.5, 0.0, 3.5 + 1e-9) }));
  assert.equal(bad.violations.filter((v) => v.rule.includes("逐字相等")).length, 1);
  console.log("✔ ⑦ exact 方向：1e-9 差异即违规（预算对照不得漂）");
}

// ⑧ 缺 slice：基线里的策略在候选里不存在 ⇒ 违规（不是跳过）；策略内缺字段同样违规
{
  const missingStrategy = runCompare(doc({ T: read(0.5, 0.0, 3.5) }));
  assert.equal(missingStrategy.violations.filter((v) => v.rule === "缺 slice").length >= 1, true);
  const missingField = runCompare(doc({ S: { recall_mean: 0.5, noise_offtopic_mean: 0 } }));
  assert.ok(
    missingField.violations.some((v) => v.rule === "缺 slice" && v.where.startsWith("S.")),
    "策略内缺**门控**字段（这里缺 avg_returned_mean）必须报「缺 slice」",
  );
  console.log("✔ ⑧ 缺 slice（策略缺 / 字段缺）⇒ 违规，不跳过");
}

// ⑨ 「外部调用即失败」：计数非 0 ⇒ 违规
{
  const bad = runCompare(doc({ S: read(0.5, 0.0, 3.5) }, { external_model_calls: 1 }));
  assert.equal(bad.violations.filter((v) => v.rule === "外部调用即失败").length, 1);
  console.log("✔ ⑨ 外部调用数非 0 ⇒ 违规（零 LLM/零网络基准）");
}

// ⑩ 「基线只含聚合面」白名单：多一个键、或读数里多一个字段，都要被抓
{
  assert.equal(checkAggregateOnly(doc({ S: read(0.5, 0.0, 3.5) }), "b").length, 0, "合法基线必须零违规");
  const leak1 = checkAggregateOnly(doc({ S: read(0.5, 0.0, 3.5) }, { note: "某条记忆的原文" }), "b");
  assert.equal(leak1.length, 1, "未白名单的顶层字段必须违规");
  const leak2 = checkAggregateOnly(doc({ S: { ...read(0.5, 0.0, 3.5), raw_text: "记忆原文" } }), "b");
  assert.equal(leak2.length, 1, "读数里混入非读数面字段必须违规");
  const leak3 = checkAggregateOnly(doc({ S: read(0.5, 0.0, 3.5) }, { dataset_sha256: "not-a-hash" }), "b");
  assert.equal(leak3.length, 1, "哈希形状不符（可能夹带内容）必须违规");
  assert.ok(RESULT_FIELDS.length === 5, "读数面字段集是判据的一部分，改了要同步这里");
  console.log("✔ ⑩ 白名单：多键 / 读数混入 / 哈希形状不符 都会红（「可公开」被做成形状约束）");
}

// ⑪ 协议自检：空门控清单、外部调用常量非 0、空种子 都必须红
{
  assert.equal(checkProtocol(protocol).length, 0, "合法协议零违规");
  assert.equal(checkProtocol({ ...protocol, gated_metrics: [] }).some((v) => v.rule === "协议不得为空"), true);
  assert.equal(checkProtocol({ ...protocol, required_external_model_calls: 1 }).some((v) => v.rule === "零外部调用"), true);
  assert.equal(checkProtocol({ ...protocol, seeds: [] }).some((v) => v.rule === "种子不得为空"), true);
  const noDir = checkProtocol({ ...protocol, metric_directions: {} });
  assert.ok(noDir.some((v) => v.rule === "门控指标必须声明方向"));
  const noTol = checkProtocol({ ...protocol, tolerances: {} });
  assert.ok(noTol.some((v) => v.rule === "门控指标必须声明容差"));
  console.log("✔ ⑪ 协议自检：门控清单/方向/容差/种子/零外部调用 缺一即红");
}

// ⑫ 确定性序列化与哈希：键序无关、尾换行固定、路径与机器无关
{
  assert.equal(stableStringify({ b: 1, a: 2 }), stableStringify({ a: 2, b: 1 }), "键序不得影响序列化");
  assert.ok(stableStringify({ a: 1 }).endsWith("\n"), "必须带尾换行（逐字可比的前提）");
  assert.equal(sha256Hex("x").length, 64);
  const h1 = datasetHash([{ path: ".shadow/2026-09-01/a.md", text: "A" }]);
  const h2 = datasetHash([{ path: ".shadow/2026-09-01/a.md", text: "A" }]);
  assert.equal(h1.hex, h2.hex, "同输入同哈希");
  assert.equal(h1.algorithm, HASH_ALGORITHM);
  assert.notEqual(h1.hex, datasetHash([{ path: ".shadow/2026-09-01/a.md", text: "B" }]).hex, "内容变必须换哈希");
  // 顺序无关（内部按 path 排序）
  const two = [
    { path: ".shadow/b.md", text: "B" },
    { path: ".shadow/a.md", text: "A" },
  ];
  assert.equal(datasetHash(two).hex, datasetHash([...two].reverse()).hex, "文件顺序不得影响语料指纹");
  assert.equal(h1.fileCount, 1);
  console.log("✔ ⑫ 序列化与语料指纹：键序无关 / 尾换行 / 内容变即换 / 顺序无关");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · `--update-baseline` 的**拒绝覆盖**是 CLI 行为，本文件不 spawn 子进程验证（已人工实测一次）；");
console.log("  · `--determinism-check` 的**双跑逐字比**同样是 CLI 行为，已在真仓库手工跑过（通过），但未做成自动断言；");
console.log("  · 「聚合数字本身是否泄露语料」**不是形状问题**，本文件只能证明基线**不含语料原文/路径/日期**这一类内容；");
console.log("  · 语料指纹用「相对路径 + 全文」；**不代表**「语料分布」相同（同样的哈希只在逐字节相同时成立）。");
console.log("ALL PASS ✅");
