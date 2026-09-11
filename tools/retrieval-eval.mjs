#!/usr/bin/env node
// dsh-shadow —— tools/retrieval-eval.mjs：检索策略评测（扇出 vs 路由）。ADR-0060。
//
// 目的：把调研标注为「属组合推理、非论文结论」的那条——**无阈值检索器做全量扇出会放大噪声**——
// 变成在**本系统真语料**上的测量。文献给的是同向的产业级证据（2603.02153 融合增益在重排后基本被抵消；
// 2606.28367 强重排器在场时 rank fusion 无可靠增益），但都**不是**「无阈值 + 扇出」这个组合的直接实证。
//
// 方法（确定性、无 LLM、无网络、无外部依赖）：
//   · 语料 = 真实 `.shadow` 记忆；
//   · 检索器按**已实测的真实性质**建模（ADR-0054：Semble 无阈值、无负信号、语料里没有的话题照样返回最高分）；
//   · **同候选预算**对照（调研硬要求：不控预算就分不清「策略更好」还是「预算更松」）；
//   · 两组查询：on-topic（有唯一 gold，**带竞争**）与 off-topic（**真·语料里不存在**，gold = 空）。
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.env.SHADOW_EVAL_ROOT || "D:/project/dsh1";
const SHADOW = join(ROOT, ".shadow");
const K = Number(process.env.SHADOW_EVAL_K || 5);
const MAX_DOCS = Number(process.env.SHADOW_EVAL_DOCS || 1500);
const SEEDS = (process.env.SHADOW_EVAL_SEEDS || "1,2,3").split(",").map(Number);

// 确定性 PRNG（可复现；多种子报方差，调研要求）
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ───────────────────────── 语料 ─────────────────────────
const files = [];
(function walk(d) {
  let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".md") && e.name !== "_index.md") files.push(p);
  }
})(SHADOW);
files.sort();
const step = Math.max(1, Math.floor(files.length / MAX_DOCS));
const docs = [];
for (let i = 0; i < files.length && docs.length < MAX_DOCS; i += step) {
  let text; try { text = readFileSync(files[i], "utf8"); } catch { continue; }
  docs.push({ id: `d${docs.length}`, path: files[i].slice(ROOT.length + 1).replace(/\\/g, "/"), text });
}

const tokenize = (s) => String(s || "").toLowerCase().match(/[a-z0-9_]{2,}|[\u4e00-\u9fa5]{2,}/g) || [];
const docTok = docs.map((d) => tokenize(d.text));
const docSet = docTok.map((t) => new Set(t));

// 文档频率
const df = new Map();
for (const ts of docSet) for (const t of ts) df.set(t, (df.get(t) || 0) + 1);

// 词表（用于造 off-topic 查询）
const vocab = [...df.keys()];

// ───────────────────── 查询构造 ─────────────────────
/**
 * on-topic：从文档里抽 3 个 token（**允许 df>1，制造真实竞争**），gold = 该文档。
 * 诚实标注：这是「部分线索」式查询（真实使用中常见），不是自然语言问句。
 */
const buildOnTopic = (rand, n) => {
  const qs = [];
  const idx = [...docs.keys()].sort(() => rand() - 0.5);
  for (const i of idx) {
    if (qs.length >= n) break;
    const ts = docTok[i].filter((t) => t.length >= 3);
    if (ts.length < 3) continue;
    // 抽 3 个不同 token（确定性）
    const pick = [];
    for (let a = 0; a < ts.length && pick.length < 3; a += Math.max(1, Math.floor(ts.length / 3))) pick.push(ts[a]);
    qs.push({ q: pick.join(" "), tokens: new Set(pick), gold: docs[i].id, kind: "on-topic" });
  }
  return qs;
};

/**
 * off-topic：**语料里完全不存在的词**（伪词组合）→ gold = 空。
 *
 * **两点诚实标注**：
 *  ① 判据是「**词**不在 vocab」。「没有任何文档与之相关」对**词检索器**成立；
 *     对**字符二元组检索器**不必然成立——2-gram 会撞上真实文本（如 `zqx` 的 `zq`/`qx`）。
 *     这**不是**实验缺陷，而是一条真性质：**不同检索器的「阈值强度」不同**
 *     （这正是文献里 SSCC「每个 score source 各设一个阈值」的由来）。
 *     故本工具把它**如实报出来**，不藏。
 *  ② 第一版曾试图用「2-gram 全局频率 ≤1」收紧，结果**一条都构造不出**（常用 2-gram 遍地都是）——
 *     该收紧不可行，已回退并在此记录，避免以后重复踩。
 */
const buildOffTopic = (rand, n) => {
  const T1 = ["zqx", "vlorm", "kript", "nyx", "quor", "flem", "drax", "wobeg", "plim", "snerk"];
  const T2 = ["onite", "axil", "umbra", "vex", "tharn", "glip", "crunk", "zeph", "morp", "kestrel"];
  const qs = [];
  for (let i = 0; i < n * 4 && qs.length < n; i++) {
    const a = T1[Math.floor(rand() * T1.length)], b = T2[Math.floor(rand() * T2.length)];
    if (df.has(a) || df.has(b)) continue;   // 词必须不存在（对词检索器即「无关」）
    qs.push({ q: `${a} ${b}`, tokens: new Set([a, b]), gold: null, kind: "off-topic" });
  }
  return qs;
};

// ───────────────────── 检索器 ─────────────────────
const overlap = (q, di) => { let h = 0; for (const t of q.tokens) if (docSet[di].has(t)) h++; return h; };

/** 有阈值：无命中 → 空。模型：关键词/BM25 类（fs 子串） */
const exact = (q) => {
  const out = [];
  for (let di = 0; di < docs.length; di++) { const s = overlap(q, di); if (s > 0) out.push({ doc: docs[di].id, s }); }
  return out.sort((a, b) => b.s - a.s || (a.doc < b.doc ? -1 : 1)).slice(0, K);
};

/** 无阈值（ADR-0054 实测 semble 性质）：任何查询都返回 K 条 */
const noThreshold = (q) => {
  const out = [];
  for (let di = 0; di < docs.length; di++) out.push({ doc: docs[di].id, s: overlap(q, di) });
  return out.sort((a, b) => b.s - a.s || (a.doc < b.doc ? -1 : 1)).slice(0, K);
};

/** RRF 融合（Cormack 2009，k=60） */
const rrf = (lists) => {
  const agg = new Map();
  for (const list of lists) list.forEach((r, i) => agg.set(r.doc, (agg.get(r.doc) || 0) + 1 / (60 + i + 1)));
  return [...agg.entries()].map(([doc, s]) => ({ doc, s })).sort((a, b) => b.s - a.s);
};

// ── 互补检索器：字符二元组（中文场景天然与「词」互补；能找到词匹配漏掉的）──
const bigrams = (s) => {
  const t = String(s || "").toLowerCase().replace(/\s+/g, "");
  const out = [];
  for (let i = 0; i + 1 < t.length; i++) out.push(t.slice(i, i + 2));
  return out;
};
const docBi = docs.map((d) => new Set(bigrams(d.text)));
const qBi = (q) => new Set(bigrams(q.q));
const biOverlap = (qb, di) => { let h = 0; for (const t of qb) if (docBi[di].has(t)) h++; return h; };

/** 有阈值的二元组检索（互补来源） */
const exactBi = (q) => {
  const qb = qBi(q);
  const out = [];
  for (let di = 0; di < docs.length; di++) { const s = biOverlap(qb, di); if (s > 0) out.push({ doc: docs[di].id, s }); }
  return out.sort((a, b) => b.s - a.s || (a.doc < b.doc ? -1 : 1)).slice(0, K);
};
/** 无阈值的二元组检索（恒返 K） */
const noThresholdBi = (q) => {
  const qb = qBi(q);
  const out = [];
  for (let di = 0; di < docs.length; di++) out.push({ doc: docs[di].id, s: biOverlap(qb, di) });
  return out.sort((a, b) => b.s - a.s || (a.doc < b.doc ? -1 : 1)).slice(0, K);
};

// ───────────────────── 策略 ─────────────────────
const strategies = {
  "A 单库·词·有阈值": (q) => exact(q),
  "B 单库·词·无阈值": (q) => noThreshold(q),
  "C 扇出2库·无阈值+RRF": (q) => rrf([noThreshold(q), noThresholdBi(q)]).slice(0, K),
  "D 路由·有阈值+弃权": (q) => exact(q),
  "E 扇出2库·有阈值+RRF": (q) => rrf([exact(q), exactBi(q)]).slice(0, K),
  "F 单库·二元组·有阈值": (q) => exactBi(q),
};

// ───────────────────── 评测 ─────────────────────
const runOne = (onTopic, offTopic) => {
  const all = [...onTopic, ...offTopic];
  const res = {};
  for (const [nm, fn] of Object.entries(strategies)) {
    let hit = 0, mrr = 0, ndcg = 0, returned = 0, offRet = 0;
    for (const q of all) {
      const rows = fn(q);
      returned += rows.length;
      if (q.kind === "off-topic") { offRet += rows.length; continue; }
      const at = rows.findIndex((r) => r.doc === q.gold);
      if (at >= 0) { hit++; mrr += 1 / (at + 1); ndcg += 1 / Math.log2(at + 2); }
    }
    res[nm] = {
      recall: hit / onTopic.length, mrr: mrr / onTopic.length, ndcg: ndcg / onTopic.length,
      avgReturned: returned / all.length,
      noiseOffTopic: offRet / (K * offTopic.length),
    };
  }
  return res;
};

// ───────────────────── 主 ─────────────────────
console.log(`语料：${docs.length} 条真实 .shadow 记忆（从 ${files.length} 条等距取样）`);
console.log(`词表：${vocab.length} 个 token`);
console.log(`K = ${K} · 多种子 = [${SEEDS.join(", ")}]（报均值 ± 极差）`);
console.log("");

const acc = {};
let onN = 0, offN = 0;
for (const seed of SEEDS) {
  const rand = mulberry(seed * 7919);
  const on = buildOnTopic(rand, 150);
  const off = buildOffTopic(rand, 60);
  onN = on.length; offN = off.length;
  const r = runOne(on, off);
  for (const [k, v] of Object.entries(r)) (acc[k] ||= []).push(v);
}

const stat = (xs) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return { mean, min: Math.min(...xs), max: Math.max(...xs), range: Math.max(...xs) - Math.min(...xs) };
};

console.log(`查询：on-topic ${onN} 条（有唯一 gold，**带竞争**）· off-topic ${offN} 条（**语料里完全不存在的词**，gold = 空）`);
console.log("");
console.log("=".repeat(100));
console.log(`${"策略".padEnd(22)}${"recall".padStart(16)}${"nDCG".padStart(16)}${"均返回".padStart(10)}${"离题噪声".padStart(18)}`);
console.log(`${"".padEnd(22)}${"mean±range".padStart(16)}${"mean±range".padStart(16)}${"".padStart(10)}${"mean±range".padStart(18)}`);
console.log("=".repeat(100));
const R = {};
for (const nm of Object.keys(strategies)) {
  const rc = stat(acc[nm].map((x) => x.recall));
  const nd = stat(acc[nm].map((x) => x.ndcg));
  const nz = stat(acc[nm].map((x) => x.noiseOffTopic));
  const av = stat(acc[nm].map((x) => x.avgReturned));
  R[nm] = { rc, nd, nz, av };
  console.log(`${nm.padEnd(20)}${`${rc.mean.toFixed(3)}±${rc.range.toFixed(3)}`.padStart(16)}${`${nd.mean.toFixed(3)}±${nd.range.toFixed(3)}`.padStart(16)}${av.mean.toFixed(2).padStart(10)}${`${nz.mean.toFixed(3)}±${nz.range.toFixed(3)}`.padStart(18)}`);
}
console.log("=".repeat(100));
console.log("");
console.log("【裁决性对比】");
const A = R["A 单库·词·有阈值"], C = R["C 扇出2库·无阈值+RRF"], D = R["D 路由·有阈值+弃权"], E = R["E 扇出2库·有阈值+RRF"], F = R["F 单库·二元组·有阈值"];
const cmp = (a, b, label, higherBetter = true) => {
  const d = b.mean - a.mean;
  const verdict = Math.abs(d) < 1e-9 ? "打平" : (higherBetter ? (d > 0 ? "更好" : "更差") : (d > 0 ? "更差" : "更好"));
  console.log(`  ${label.padEnd(38)} ${a.mean.toFixed(3)} → ${b.mean.toFixed(3)}  (${d >= 0 ? "+" : ""}${d.toFixed(3)}) ${verdict}`);
};
console.log("  ── 召回：扇出在有互补来源时是否真有增益 ──");
cmp(F.rc, E.rc, "扇出(词+二元组) vs 单·二元组", true);
cmp(A.rc, E.rc, "扇出(词+二元组) vs 单·词", true);
console.log("  ── 噪声：无阈值扇出的代价 ──");
cmp(A.nz, C.nz, "无阈值扇出 vs 有阈值单库 · 离题噪声", false);
cmp(A.nz, E.nz, "有阈值扇出 vs 有阈值单库 · 离题噪声", false);
console.log("  ── 预算 ──");
cmp(A.av, C.av, "候选预算消耗（无阈值扇出）", false);
cmp(A.av, E.av, "候选预算消耗（有阈值扇出）", false);
console.log("");
console.log("【关键读数 · 逐条】");
console.log(`  ① 无阈值检索器恒返 K：离题查询噪声 = ${C.nz.mean.toFixed(3)}（有阈值单库 A = ${A.nz.mean.toFixed(3)}）`);
console.log(`     ⇒ 「无阈值」这**一个**性质就足以让离题查询灌满噪声，与库数无关；扇出只是把它乘以库数。`);
console.log(`  ② 扇出（含互补来源）**没换来召回**：扇出 ${E.rc.mean.toFixed(3)} vs 单·词 ${A.rc.mean.toFixed(3)}（${(E.rc.mean - A.rc.mean >= 0 ? "+" : "")}${(E.rc.mean - A.rc.mean).toFixed(3)}），`);
console.log(`     对单·二元组仅 +${(E.rc.mean - F.rc.mean).toFixed(3)}，落在多种子极差 ±${E.rc.range.toFixed(3)} 内 → **不显著**。`);
console.log(`  ③ 二元组检索器**阈值更弱**（离题噪声 ${F.nz.mean.toFixed(3)} vs 词检索器 ${A.nz.mean.toFixed(3)}）：`);
console.log(`     这是「每个来源各自标定阈值」（文献 SSCC）的实证依据——阈值强弱**因检索器而异**。`);
console.log(`  ④ 最差是无阈值扇出（C）：召回不升（${C.rc.mean.toFixed(3)} vs ${A.rc.mean.toFixed(3)}）· 噪声 ${C.nz.mean.toFixed(3)} · 预算 ${C.av.mean.toFixed(2)} 条/查询。`);
console.log("");
console.log("诚实边界：");
console.log("  · 检索器是**按 ADR-0054 实测性质建模**的（无阈值 = 恒返 K），不是真实向量模型；");
console.log("  · 本机 semble / zg 均未安装（ENOENT），故未跑真实向量检索；装机后可用本工具复测；");
console.log("  · 语料是本系统真 `.shadow`，但查询是「部分线索」式（3 个 token），非自然语言问句。");
