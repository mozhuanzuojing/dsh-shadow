import assert from "node:assert/strict";
import { buildDirection, rankCandidates } from "../../dist/domain/intent.js";

// —— 规模化标注基准（模板生成 ~100+ 例，覆盖 6 类隐式信号）——
interface Case { cat: string; utt: { text: string }[]; cands: string[]; top?: string; excluded?: string[]; undecidable?: boolean }
const cases: Case[] = [];
const DB = ["PostgreSQL", "MySQL", "Redis", "SQLite", "MongoDB", "Oracle"];
const NARROW = ["复杂菜单", "抽象", "冗余", "花哨", "多余步骤"];
const FEAT = ["P", "Q", "R", "S", "T"];

for (const x of DB) for (const y of DB) if (x !== y) {
  cases.push({ cat: "replace", utt: [{ text: `用 ${y} 代替 ${x}` }], cands: [x, y], top: y, excluded: [x] });
  cases.push({ cat: "overturn", utt: [{ text: `默认 ${x}，不用 ${x} 用 ${y}` }], cands: [x, y], top: y, excluded: [x] });
}
for (const a of NARROW) for (const b of NARROW) if (a !== b) {
  cases.push({ cat: "narrow", utt: [{ text: `只要简单的，去掉${a}，不要${b}` }], cands: [`加${b}层`, "简单方案"], top: "简单方案", excluded: [`加${b}层`] });
}
for (const a of FEAT) for (const b of FEAT) if (a !== b) {
  cases.push({ cat: "negateAll", utt: [{ text: `先做 ${a}、${b} 两个方案` }, { text: "都不要" }], cands: [a, b], undecidable: true });
  cases.push({ cat: "softPrefer", utt: [{ text: `${a} 方案和 ${b} 方案都可以，更喜欢 ${b}` }], cands: [`${a} 方案`, `${b} 方案`], top: `${b} 方案` });
}

let pass = 0;
const perCat = new Map<string, { ok: number; n: number }>();
for (const c of cases) {
  const dir = buildDirection(c.utt);
  const r = rankCandidates(dir, c.cands);
  const rec = perCat.get(c.cat) ?? { ok: 0, n: 0 };
  rec.n++;
  let ok = false;
  if (c.undecidable) ok = r.undecidable === true;
  else {
    const top = r.ranked.find((x) => x.status === "ok");
    ok = !r.undecidable && top?.candidate === c.top && (c.excluded ?? []).every((ex) => r.ranked.find((q) => q.candidate === ex)?.status === "excluded");
  }
  if (ok) { pass++; rec.ok++; }
  perCat.set(c.cat, rec);
}
const acc = pass / cases.length;
console.log(`[baseline] 规模化纠偏准确率 ${(acc * 100).toFixed(1)}% (${pass}/${cases.length})`);
console.log("[baseline] 分类：" + [...perCat].map(([k, v]) => `${k} ${v.ok}/${v.n}`).join(" · "));
assert.ok(acc >= 0.98, `整体准确率应 ≥98%，实际 ${(acc * 100).toFixed(1)}%`);
for (const [k, v] of perCat) assert.ok(v.ok / v.n >= 0.9, `${k} 准确率应 ≥90%`);

// —— 大语料性能门（确定性、无网络）——
const big: { text: string }[] = [];
for (let i = 0; i < 5000; i++) big.push({ text: `第${i}项 保留 简单 模块 证据 边界 方案` });
const t0 = Date.now();
const dB = buildDirection(big);
const dtBuild = Date.now() - t0;
const t1 = Date.now();
rankCandidates(dB, Array.from({ length: 500 }, (_, i) => `候选${i} 简单 模块 证据`));
const dtRank = Date.now() - t1;
console.log(`[perf] buildDirection(5000)=${dtBuild}ms · rank(500)=${dtRank}ms`);
assert.ok(dtBuild < 3000, `build(5000) 应 <3000ms，实际 ${dtBuild}ms`);
assert.ok(dtRank < 1000, `rank(500) 应 <1000ms，实际 ${dtRank}ms`);

console.log("✔ direction-baseline：规模化纠偏≥98% · 分类门 · 大语料性能门");
