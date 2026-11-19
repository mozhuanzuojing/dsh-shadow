import assert from "node:assert/strict";
import { buildDirection, rankCandidates, detectSignals } from "../../dist/domain/intent.js";

// 1) 整体否决"都不要" → 方向不可判，不得把最高频候选当"最不偏"
{
  const dir = buildDirection([{ text: "先做 A、B、C 三个方案" }, { text: "都不要" }]);
  assert.equal(dir.undecidable, true, "整体否决应不可判");
  const r = rankCandidates(dir, ["A", "B", "C"]);
  assert.equal(r.undecidable, true, "候选全应不可判，不猜最小分");
}

// 2) 用Y代替X → X 被排除，Y 幸存且排前
{
  const dir = buildDirection([{ text: "用 SQLite 代替 PostgreSQL" }]);
  assert.ok(dir.excluded.some((x) => /PostgreSQL/i.test(x)), "应排除 PostgreSQL");
  assert.ok(dir.preferred.some((x) => /SQLite/i.test(x)), "应偏好 SQLite");
  const r = rankCandidates(dir, ["PostgreSQL", "SQLite"]);
  const pg = r.ranked.find((x) => x.candidate === "PostgreSQL")!;
  const sq = r.ranked.find((x) => x.candidate === "SQLite")!;
  assert.equal(pg.status, "excluded", "PostgreSQL 应硬排除");
  assert.equal(sq.status, "ok", "SQLite 应幸存");
  assert.equal(r.ranked[0].candidate, "SQLite", "幸存者应排前");
}

// 3) 减法收窄（只要…去掉…不要抽象）
{
  const dir = buildDirection([{ text: "只要简单的，去掉复杂菜单，不要抽象" }]);
  const r = rankCandidates(dir, ["加抽象层", "简单方案"]);
  assert.equal(r.ranked.find((x) => x.candidate === "加抽象层")!.status, "excluded", "抽象层应排除");
  assert.equal(r.ranked[0].candidate, "简单方案", "简单方案应排前");
}

// 4) 理解偏后重述纠正：把"成本核算模块"记否，人工成本方向应在前
{
  const dir = buildDirection([{ text: "成本指人工成本，不是成本核算模块" }]);
  assert.ok(dir.excluded.some((x) => x.includes("成本核算模块")), "应排除成本核算模块");
  const r = rankCandidates(dir, ["成本核算模块", "人工成本统计"]);
  assert.equal(r.ranked.find((x) => x.candidate === "成本核算模块")!.status, "excluded");
  assert.equal(r.ranked[0].candidate, "人工成本统计");
}

// 5) 推翻默认：不用 PostgreSQL 用 SQLite
{
  const dir = buildDirection([{ text: "默认 PostgreSQL，不用 PostgreSQL 用 SQLite" }]);
  const r = rankCandidates(dir, ["PostgreSQL", "SQLite"]);
  assert.equal(r.ranked.find((x) => x.candidate === "PostgreSQL")!.status, "excluded", "PG 应排除");
  assert.equal(r.ranked.find((x) => x.candidate === "SQLite")!.status, "ok");
  assert.equal(r.ranked[0].candidate, "SQLite");
}

// 6) 轻偏好"更喜欢B"：软信号，不否决 A
{
  const dir = buildDirection([{ text: "A 方案和 B 方案都可以，更喜欢 B" }]);
  assert.ok(!dir.excluded.some((x) => /^A/i.test(x)), "轻偏好不得否决 A");
  const r = rankCandidates(dir, ["A 方案", "B 方案"]);
  assert.equal(r.ranked.find((x) => x.candidate === "A 方案")!.status, "ok", "A 不应被排除");
  assert.equal(r.ranked[0].candidate, "B 方案", "B 应排前");
}

// 7) 信号抽取基本点
{
  assert.ok(detectSignals("我的意思是每句话都有背景").some((s) => s.type === "restate"));
  assert.ok(detectSignals("他们错了，以我为准").some((s) => s.type === "cite"));
}

// 8) 空 token 话语不得造成向量索引错位（质心被清零）
{
  const dir = buildDirection([{ text: "" }, { text: "用 SQLite 代替 PostgreSQL" }, { text: "的" }]);
  assert.ok(dir.excluded.some((x) => /PostgreSQL/i.test(x)), "空话语夹中间仍应排除 PostgreSQL");
  assert.ok(dir.keywords.length > 0, "空话语夹中间不得把质心清零（索引须对齐）");
}

console.log("✔ intent：整体否决不可判 / 替换对 / 收窄 / 重述纠正 / 推翻默认 / 软偏好 / 信号抽取 / 空话语对齐");
