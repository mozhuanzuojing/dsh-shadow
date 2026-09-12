#!/usr/bin/env node
// dsh-shadow —— tools/corpus-health.selftest.ts：**语料健康门**的标定测试（V7）。
//
// 为什么必须有：这道闸的唯一职责是「**别让假绿通过**」。它自己判错的方向是**双向致命**的 ——
// 判松了（PARTIAL 放行）⇒ 工具坏了会被写进基线（假绿自我固化）；
// 判紧了（正常波动当骤降）⇒ 人会习惯性 `--update-ratchet --force`，门就变成装饰品。故每一档都要有正反例。
import assert from "node:assert/strict";
import { classifyCorpus, type CorpusObservation } from "./corpus-health.lib.ts";

const obs = (o: Partial<CorpusObservation> = {}): CorpusObservation => ({
  files: 210,
  dirs: 30,
  findingsA: 31,
  findingsB: 103,
  fingerprint: "a".repeat(64),
  ...o,
});

// ① NORMAL：规模与线索都在带内 ⇒ 放行
{
  const r = classifyCorpus("t", obs(), obs());
  assert.equal(r.health, "NORMAL");
  assert.equal(r.ok, true);
  assert.equal(r.exitCode, 0);
  console.log("✔ ① 规模在带内 ⇒ NORMAL / 放行");
}

// ② EMPTY：0 文件 ⇒ 拒绝（V6 已有的那条，保留）
{
  const r = classifyCorpus("t", obs({ files: 0, dirs: 0, findingsA: 0, findingsB: 0 }), obs());
  assert.equal(r.health, "EMPTY");
  assert.equal(r.exitCode, 2);
  console.log("✔ ② 0 文件 ⇒ EMPTY / exit 2");
}

// ③ **PARTIAL（本闸存在的理由）**：语料骤降但**不是 0** ⇒ 拒绝
{
  const r = classifyCorpus("t", obs({ files: 7, dirs: 2, findingsA: 21, findingsB: 21 }), obs());
  assert.equal(r.health, "PARTIAL");
  assert.equal(r.exitCode, 2);
  assert.ok(r.lines.some((l) => l.includes("7")), "报文要给出实际数字");
  console.log("✔ ③ 语料骤降（非 0）⇒ PARTIAL / exit 2 —— 这正是 V6 漏掉的形态");
}

// ④ **工具坏了导致线索骤降**也必须判 PARTIAL（否则棘轮会把「下降」当「修好了」并收紧基线）
{
  const r = classifyCorpus("t", obs({ findingsB: 21 }), obs()); // 文件数正常，线索跌 80%
  assert.equal(r.health, "PARTIAL");
  assert.ok(r.lines.some((l) => l.includes("B 段线索")));
  console.log("✔ ④ 文件正常但线索骤降 ⇒ PARTIAL（防「工具坏了被当成修好了」）");
}

// ⑤ 小跌幅**不算** PARTIAL（否则正常收益会被误判，人会习惯性绕闸）
{
  const r = classifyCorpus("t", obs({ findingsB: 90 }), obs()); // 跌 < 20%
  assert.equal(r.health, "NORMAL", "20% 以内的下降应放行，交给棘轮的「下降不是违规」处理");
  console.log("✔ ⑤ 小跌幅（<20%）⇒ NORMAL（把「正常收益」与「工具故障」分开）");
}

// ⑥ 目录数**掉到近乎没有** ⇒ PARTIAL（专防「递归没跟随 junction / 漏了根」这一类静默截断）
{
  // v1.15.55 起这条判据分两档（见 lib 的 `catastrophicDirRatio`）：
  //   · 目录掉 <10% 且文件健康 ⇒ **物理上解释不通**（语料不可能这么浅）⇒ 照旧 PARTIAL；
  //   · 目录掉 10%~90% 且文件健康 ⇒ 更可能是**遍历口径变化**（空目录、`.git` 打包）⇒ NORMAL + 印理由。
  const r = classifyCorpus("t", obs({ dirs: 2 }), obs()); // 基线 30 → 2（6.7% < 10%）
  assert.equal(r.health, "PARTIAL", "目录几乎没了而文件健康 ⇒ 必须拦（否则门成了瞎的）");
  assert.ok(r.lines.some((l) => l.includes("目录数")));
  // 边界显式化：**恰好 10% 不算 catastrophic**（判据是 `<`，不是 `<=`）——
  // 界线上的夹具必须用二分精确值，别用十进制近似（本仓踩过：0.5-0.01 的浮点假红）。
  assert.equal(classifyCorpus("t", obs({ dirs: 3 }), obs()).health, "NORMAL", "3/30 = 10% 恰在界内 ⇒ 归入「口径变化」那一档");
  console.log("✔ ⑥ 目录数掉到近乎没有 ⇒ PARTIAL（比文件数更早暴露递归被截断）");
}

// ⑦ 哨兵缺失 ⇒ PARTIAL，**无基线也能发现**「走错目录」
{
  const r = classifyCorpus("t", obs(), undefined, ["core/paths.ts"]);
  assert.equal(r.health, "PARTIAL");
  assert.ok(r.lines.some((l) => l.includes("core/paths.ts")));
  console.log("✔ ⑦ 哨兵缺失 ⇒ PARTIAL（不需要基线就能判「扫的范围不对」）");
}

// ⑧ 无基线 ⇒ UNKNOWN / exit 2（缺件不得静默放行）
{
  const r = classifyCorpus("t", obs(), undefined);
  assert.equal(r.health, "UNKNOWN");
  assert.equal(r.exitCode, 2);
  console.log("✔ ⑧ 无基线 ⇒ UNKNOWN / exit 2");
}

// ⑨ 指纹变了但规模在带内 ⇒ 仍 NORMAL，但**必须印警告**（规模类判据不覆盖内容变化）
{
  const r = classifyCorpus("t", obs({ fingerprint: "b".repeat(64) }), obs());
  assert.equal(r.health, "NORMAL");
  assert.ok(r.lines.some((l) => l.includes("指纹") && l.includes("不")), "内容变了要显式提示判据边界");
  console.log("✔ ⑨ 指纹变化 ⇒ 仍放行但显式提示「规模类判据不覆盖内容变化」");
}

// ⑩ 阈值是**可注入的**（判据可在调用点调整，不是埋死的魔数）
{
  const strict = classifyCorpus("t", obs({ files: 160 }), obs(), [], { minFileRatio: 0.99 });
  assert.equal(strict.health, "PARTIAL");
  const loose = classifyCorpus("t", obs({ files: 160 }), obs(), [], { minFileRatio: 0.5 });
  assert.equal(loose.health, "NORMAL");
  console.log("✔ ⑩ 阈值可注入（同一次观测在严/松两档下结论不同 ⇒ 判据不在暗处）");
}

// ⑪ **目录数骤降但文件面健康 ⇒ 不判 PARTIAL**（v1.15.55 修假阳性；这条闸曾把自己的修正堵死）
{
  // 旧实现：只看目录数 ⇒ 修一次遍历口径（或 `git gc` 打包 `.git` 松散对象）就报 PARTIAL，
  // 而 PARTIAL 又**拒绝录基线** ⇒ 口径修正永远录不进去。
  const dirsDown = obs({ dirs: 168 }); // 基线 400 目录 → 168（降 58%）
  const r1 = classifyCorpus("t", dirsDown, obs({ dirs: 400 }), []);
  assert.equal(r1.health, "NORMAL", "★ 文件面健康（210→210）时，目录数降**不构成**语料不健康");
  assert.ok(r1.lines.some((l) => l.includes("目录数") && l.includes("不是")), "★ 但必须**印出理由**，不得静默放过");

  // 反例：**递归真被截断**时文件数必然一起掉 ⇒ 此时必须 PARTIAL
  const truncated = obs({ files: 120, dirs: 168 });
  const r2 = classifyCorpus("t", truncated, obs({ dirs: 400 }), []);
  assert.equal(r2.health, "PARTIAL", "★ 文件面也掉 ⇒ 那是真截断，照旧拦");
  assert.ok(r2.lines.some((l) => l.includes("目录数")), "两条判据都要报");

  // 边界：文件正好在容许带内（0.9）⇒ 仍算健康
  const edge = classifyCorpus("t", obs({ files: 189, dirs: 168 }), obs({ dirs: 400 }), []);
  assert.equal(edge.health, "NORMAL", "189/210 = 0.9 恰在容许带下限（含）⇒ 仍算健康");
  console.log("✔ ⑪ 目录数骤降：文件面健康 ⇒ NORMAL + 印理由；文件面也掉 ⇒ PARTIAL（真截断仍拦得住）");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · `audit-wiring` / `audit-drift` / `audit-layers` 三个消费者**接线**靠真实运行（`npm run verify`）验证；");
console.log("  · ⚠ **`retrieval-eval` 并不调用 `classifyCorpus`** —— 它走自己的一份内联实现（`retrieval-eval.ts:117-120`");
console.log("    读协议常量 `min_corpus_files` 再判「语料过小 ⇒ PARTIAL」）⇒ **该判据目前有两份实现**，");
console.log("    本文件只标定 `classifyCorpus` 那一份（另一份未标定，已记入 BACKLOG 的判据分叉线索）；");
console.log("  · 指纹只覆盖**文件路径集合**（不含内容）⇒ 「同路径内容变了」不在本闸覆盖内（已在输出里显式提示）；");
console.log("  · 阈值（0.9 / 0.9 / 0.2）是**默认值**，本轮未做过「多真实故障回放」来标定它们的最优值。");
console.log("ALL PASS ✅");
