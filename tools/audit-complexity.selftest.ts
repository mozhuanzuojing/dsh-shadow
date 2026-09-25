#!/usr/bin/env node
// dsh-shadow —— tools/audit-complexity.selftest.ts：**复杂度预算门**的标定（T13 后半，v1.21.29）。
//
// 为什么必须有（与 `audit-layers` 同一条教训）：上一版把层边写错时**门恒绿而毫无迹象** ——
// 一个「永远通过」的门比没有门更坏（它让人以为查过了）。本文件给每一类判据都配**负对照**。
import assert from "node:assert/strict";
import { hardCapVerdict, hotspotVerdict, scanHealthVerdict, type FileMetric } from "./audit-complexity.lib.ts";

const f = (rel: string, lines: number): FileMetric => ({ rel, lines });

// ─────────────────────────────────────────────
// ① 硬上限
// ─────────────────────────────────────────────
{
  assert.equal(hardCapVerdict([f("a.ts", 10), f("b.ts", 800)], 800).ok, true, "恰好等于上限 ⇒ **通过**（边界是 `>`，与 AGENTS「≤800」一致）");
  const over = hardCapVerdict([f("a.ts", 801), f("b.ts", 900), f("c.ts", 10)], 800);
  assert.equal(over.ok, false, "**负对照**：超过上限 ⇒ 不通过");
  assert.deepEqual(over.over.map((x) => x.rel), ["b.ts", "a.ts"], "违规清单按行数降序（先看最长的）");
  assert.equal(hardCapVerdict([], 800).ok, true, "空语料在**本判据**下通过（「扫不到文件」由 scanHealthVerdict 拦，别混）");
  console.log("✔ ① 硬上限：`<= cap` 通过 / `> cap` 拒绝（按行数降序列出）");
}

// ─────────────────────────────────────────────
// ② 语料健康（**防假绿**：扫不到文件也是「没有超限文件」）
// ─────────────────────────────────────────────
{
  assert.equal(scanHealthVerdict(219, undefined).ok, true, "首次录基线（无基线）⇒ 不拦");
  assert.equal(scanHealthVerdict(219, 219).ok, true, "持平 ⇒ 通过");
  assert.equal(scanHealthVerdict(230, 219).ok, true, "变多 ⇒ 通过（新增文件是正常的）");
  assert.equal(scanHealthVerdict(197, 219).ok, true, "≈90% 边界 ⇒ 通过（容差是刻意的）");
  assert.equal(scanHealthVerdict(0, 219).ok, false, "**负对照**：扫到 0 个 ⇒ 拒绝（否则会报「全部合规」）");
  assert.ok(String(scanHealthVerdict(100, 219).note).includes("219"), "拒绝理由要带基线数字（可诊断）");
  assert.equal(scanHealthVerdict(5, 0).ok, true, "基线文件数异常（0）⇒ 不据此拦截");
  assert.equal(scanHealthVerdict(5, Number.NaN).ok, true, "基线文件数 NaN ⇒ 不据此拦截");
  console.log("✔ ② 语料健康：骤降拒绝（防「扫不到⇒全部合规」的假绿）；持平/增多/边界通过；异常基线值不拦");
}

// ─────────────────────────────────────────────
// ③ 热点棘轮的三分类（**与 audit-wiring 的棘轮刻意不同**）
// ─────────────────────────────────────────────
{
  const base = { "core/a.ts": 400, "core/b.ts": 320 };
  const now = [f("core/a.ts", 400), f("core/b.ts", 350), f("core/c.ts", 999), f("core/d.ts", 10)];
  const v = hotspotVerdict(now, base, 300);
  assert.deepEqual(v.risen.map((x) => x.rel), ["core/b.ts"], "**上涨 ⇒ 违规**（只列上涨的）");
  assert.deepEqual(v.fresh.map((x) => x.rel), ["core/c.ts"], "**新热点 ⇒ 记账但不算违规**（否则每加一个大文件就红＝假闸门）");
  assert.deepEqual(v.gone, [], "本夹具没有退出热点的");

  const after = hotspotVerdict([f("core/a.ts", 310)], base, 300);
  assert.deepEqual(after.risen.map((x) => x.rel), [], "降下来不是违规");
  assert.deepEqual(after.gone, ["core/b.ts"], "**退出热点 ⇒ 提示收紧基线**（降下去是好事）");

  const same = hotspotVerdict([f("core/a.ts", 400)], { "core/a.ts": 400 }, 300);
  assert.deepEqual([same.risen.length, same.fresh.length, same.gone.length], [0, 0, 0], "**正对照**：持平 ⇒ 三类都空");

  const first = hotspotVerdict(now, undefined, 300);
  assert.equal(first.risen.length, 0, "无基线（首录）⇒ 没有「上涨」可言");
  assert.deepEqual(first.fresh.map((x) => x.rel).sort(), ["core/a.ts", "core/b.ts", "core/c.ts"], "无基线 ⇒ 所有热点都是「新热点」");
  console.log("✔ ③ 热点棘轮：上涨=违规 / 新热点=记账 / 退出=收紧提示；持平三类皆空；无基线不误报上涨");
}

// ─────────────────────────────────────────────
// ④ 阈值边界
// ─────────────────────────────────────────────
{
  const v = hotspotVerdict([f("x.ts", 300), f("y.ts", 299)], {}, 300);
  assert.deepEqual(v.fresh.map((x) => x.rel), ["x.ts"], "**恰好等于阈值 ⇒ 算热点**（边界是 `>=`）");
  assert.deepEqual(hotspotVerdict([f("y.ts", 299)], {}, 300).fresh, [], "阈值下一行 ⇒ 不算热点");
  console.log("✔ ④ 阈值边界：`>= threshold` 算热点，`threshold-1` 不算");
}

console.log("ALL PASS ✅");
