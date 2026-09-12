#!/usr/bin/env node
// dsh-shadow —— tools/audit-ratchet.selftest.ts：**分诊报告棘轮**的标定测试（V6）。
//
// 为什么必须有：棘轮如果自己判定错了，后果是**双向**的 —— 判松了（该红不红）等于没有门；
// 判紧了（下降也当违规）会让人习惯性 `--force`，那才是把门变成装饰品的正路。故每一类判据都要有负例。
import assert from "node:assert/strict";
import { ratchetCounts, serializeBaselines } from "./audit-ratchet.lib.ts";

const B = { a_total: 31, a2b: 0, b_keys: 103 };

// ① 正对照：逐桶相等 ⇒ 通过
{
  const r = ratchetCounts("t", { ...B }, B);
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  assert.ok(r.lines[0].includes("通过"));
  console.log("✔ ① 逐桶相等 ⇒ 通过");
}

// ② 线索变多 ⇒ 违规（这是棘轮存在的理由）
{
  const r = ratchetCounts("t", { ...B, b_keys: 104 }, B);
  assert.equal(r.ok, false);
  assert.equal(r.exitCode, 1);
  assert.ok(r.lines.some((l) => l.includes("变多") && l.includes("103 → 104")), "报文要给新旧数与增量");
  console.log("✔ ② 变多 ⇒ 违规（报文含 旧 → 新）");
}

// ③ **下降不是违规**（但要提示收紧基线）—— 判紧会让门被绕过
{
  const r = ratchetCounts("t", { ...B, b_keys: 90 }, B);
  assert.equal(r.ok, true, "下降必须判通过（否则人会习惯性绕过这道门）");
  assert.equal(r.exitCode, 0);
  assert.ok(r.lines.some((l) => l.includes("--update-ratchet")), "下降要提示可收紧基线");
  console.log("✔ ③ 下降 ⇒ 通过 + 提示收紧基线");
}

// ④ 桶**消失** ⇒ 违规（缺件不静默：可能是工具坏了，不是问题没了）
{
  const r = ratchetCounts("t", { a_total: 31, b_keys: 103 }, B); // a2b 消失
  assert.equal(r.ok, false);
  assert.ok(r.lines.some((l) => l.includes("消失") && l.includes("a2b")));
  console.log("✔ ④ 桶消失 ⇒ 违规（缺件不静默）");
}

// ⑤ 出现**新桶** ⇒ 违规（否则整类新线索会被棘轮漏掉）
{
  const r = ratchetCounts("t", { ...B, a_total: 32, a4: 1 }, B);
  assert.equal(r.ok, false);
  assert.ok(r.lines.some((l) => l.includes("新桶") && l.includes("a4")));
  console.log("✔ ⑤ 新桶 ⇒ 违规（新类线索必须记账）");
}

// ⑥ 基线缺失 ⇒ 违规（缺件不得静默通过）
{
  const r = ratchetCounts("t", { ...B }, undefined);
  assert.equal(r.ok, false);
  assert.ok(r.lines.some((l) => l.includes("基线缺失")));
  console.log("✔ ⑥ 基线缺失 ⇒ 违规");
}

// ⑦ 两表都空 ⇒ **不是通过**，是「没有判据」
{
  const r = ratchetCounts("t", {}, {});
  assert.equal(r.ok, false);
  assert.ok(r.lines.some((l) => l.includes("没有判据")));
  console.log("✔ ⑦ 空表 ⇒ 违规（「通过」不能靠没有判据换来）");
}

// ⑧ 序列化：键序无关 + 尾换行（基线可比的前提；实现复用 retrieval-eval 的 stableStringify）
{
  const a = serializeBaselines({ wiring: { b: 1, a: 2 } });
  const b = serializeBaselines({ wiring: { a: 2, b: 1 } });
  assert.equal(a, b, "键序不得影响基线序列化");
  assert.ok(a.endsWith("\n"));
  console.log("✔ ⑧ 基线序列化：键序无关 + 尾换行（复用同一份 stableStringify）");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 两个 CLI 的 `--ratchet` / `--update-ratchet` **接线**靠真实运行验证（已手工跑过：两段基线均录制成功、两段棘轮均通过）；");
console.log("  · **零文件语料必须非零退出**这条闸（v1.15.45 踩到：漏根参数 ⇒ ROOT 取到旗标 ⇒ 0 文件 ⇒ 假全绿）");
console.log("    已在两个 CLI 里实现并手工验证（exit 2），但未做成自动断言（要 spawn 子进程）；");
console.log("  · 棘轮只覆盖**计数**，答不了「同一计数但线索换了一批」——那需要逐条 diff（未做）。");
console.log("ALL PASS ✅");
