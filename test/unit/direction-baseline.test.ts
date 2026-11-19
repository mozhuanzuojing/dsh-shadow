import assert from "node:assert/strict";
import { buildDirection, rankCandidates } from "../../dist/domain/intent.js";

// —— 纠偏准确率基准（标注场景：期望 top / 应排除 / 不可判）——
interface Case { utt: { text: string }[]; cands: string[]; top?: string; excluded?: string[]; undecidable?: boolean }
const cases: Case[] = [
  { utt: [{ text: "先做 A、B、C 三个方案" }, { text: "都不要" }], cands: ["A", "B", "C"], undecidable: true },
  { utt: [{ text: "用 SQLite 代替 PostgreSQL" }], cands: ["PostgreSQL", "SQLite"], top: "SQLite", excluded: ["PostgreSQL"] },
  { utt: [{ text: "只要简单的，去掉复杂菜单，不要抽象" }], cands: ["加抽象层", "简单方案"], top: "简单方案", excluded: ["加抽象层"] },
  { utt: [{ text: "成本指人工成本，不是成本核算模块" }], cands: ["成本核算模块", "人工成本统计"], top: "人工成本统计", excluded: ["成本核算模块"] },
  { utt: [{ text: "默认 PostgreSQL，不用 PostgreSQL 用 SQLite" }], cands: ["PostgreSQL", "SQLite"], top: "SQLite", excluded: ["PostgreSQL"] },
];

let pass = 0;
for (const c of cases) {
  const dir = buildDirection(c.utt);
  const r = rankCandidates(dir, c.cands);
  if (c.undecidable) {
    assert.equal(r.undecidable, true, `应不可判：${JSON.stringify(c.utt)}`);
    pass++;
    continue;
  }
  assert.equal(r.undecidable, false, `应可判：${JSON.stringify(c.utt)}`);
  const top = r.ranked.find((x) => x.status === "ok")!;
  assert.equal(top.candidate, c.top, `top 应为 ${c.top}`);
  for (const ex of c.excluded ?? []) {
    assert.equal(r.ranked.find((x) => x.candidate === ex)!.status, "excluded", `${ex} 应排除`);
  }
  pass++;
}
const accuracy = pass / cases.length;
console.log(`[baseline] 纠偏准确率 ${(accuracy * 100).toFixed(0)}% (${pass}/${cases.length})`);
assert.equal(accuracy, 1, "纠偏基准应 100%");

// —— 样本不足 fast-fail ——
assert.equal(buildDirection([], { minSamples: 3 }).undecidable, true, "0 样本应不可判");
assert.equal(buildDirection([{ text: "我要简单方案" }], { minSamples: 3 }).undecidable, true, "样本<min 应不可判");
assert.equal(
  buildDirection([{ text: "我要简单方案" }, { text: "去掉复杂" }, { text: "不要抽象" }], { minSamples: 3 }).undecidable,
  false,
  "样本达标应可判",
);

// —— 性能基准（确定性、无网络）——
const big: { text: string }[] = [];
for (let i = 0; i < 2000; i++) big.push({ text: `方案${i} 模块 保留 简单 证据 边界` });
const t0 = Date.now();
const dB = buildDirection(big);
const dtBuild = Date.now() - t0;
const t1 = Date.now();
rankCandidates(dB, Array.from({ length: 200 }, (_, i) => `候选方向${i} 简单 模块`));
const dtRank = Date.now() - t1;
console.log(`[perf] buildDirection(2000)=${dtBuild}ms · rank(200)=${dtRank}ms`);
assert.ok(dtBuild < 2000, `buildDirection 2000 样本应 <2000ms，实际 ${dtBuild}ms`);
assert.ok(dtRank < 500, `rank 200 候选应 <500ms，实际 ${dtRank}ms`);

console.log("✔ direction-baseline：纠偏 100% · 样本不足 fast-fail · 性能门");
