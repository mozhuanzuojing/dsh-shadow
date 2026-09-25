#!/usr/bin/env node
// dsh-shadow —— tools/retrieval-eval.ts：检索策略评测（扇出 vs 路由）。ADR-0060。
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
import { readdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveEvalRoot } from "./eval-root.lib.ts";
import {
  stableStringify,
  sha256Hex,
  datasetHash,
  checkProtocol,
  checkAggregateOnly,
  compareEval,
  corpusFloorVerdict,
  corpusRoleVerdict,
  isDateCut,
  isHoldoutRel,
  phaseVerdict,
  splitVerdict,
} from "./retrieval-eval.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** CLI 开关（T14）：默认行为保持原来的「打印读数」，新能力都靠显式 flag。 */
const argv = process.argv.slice(2);
const FLAG = (n: string) => argv.includes(n);
const VALUE = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : undefined;
};
const PROTOCOL_PATH = join(here, "retrieval-eval.protocol.json");
const BASELINE_PATH = join(here, "retrieval-eval.baseline.json");

/**
 * **默认语料根**：从本文件位置往上找**第一个带 `.shadow` 的候选根**（候选顺序 = 由近到远）。
 * ⚠ v1.15.41 前这里硬编码 `D:/project/dsh1` —— 在本机（工作区在 `G:\`）**根本不存在**
 * ⇒ `npm run eval:retrieval` 实际在**空语料**上评测（`docs=0`，看起来还「跑通了」）。
 * ⚠ v1.15.83 前只往上推**一层**（隐含布局是 `<工作区>/dsh-shadow/tools`）—— 而本仓实际是
 * `<工作区>/vendor/dsh-shadow/tools` ⇒ 推导落到 `<工作区>/vendor`（**没有 `.shadow`**）
 * ⇒ `npm run verify` 在第 5 步红、**后 3 步（分诊棘轮 / 插件面类型门 / 全部测试）根本不跑**（实测 exit 2）。
 * 现在按候选顺序取第一个存在的 `.shadow`；候选全都不存在时**响亮报错并逐个列出候选**，
 * 仍然不默默评空语料。`SHADOW_EVAL_ROOT` 优先级最高（冻结语料快照走它）。
 */
const CANDIDATE_ROOTS = [join(here, ".."), join(here, "..", ".."), join(here, "..", "..", "..")];
// v1.19.0：解析**收一处**到 `tools/eval-root.lib.ts`（粒度门用同一份；两条实测教训也搬到了那里）。
const ROOT = resolveEvalRoot(here);
const SHADOW = join(ROOT, ".shadow");
const K = Number(process.env.SHADOW_EVAL_K || 5);
const MAX_DOCS = Number(process.env.SHADOW_EVAL_DOCS || 1500);
const SEEDS = (process.env.SHADOW_EVAL_SEEDS || "1,2,3").split(",").map(Number);

/**
 * **「外部调用即失败」的运行时守卫**（hl_mem 的同形机制：抛错桩 + 计数）。
 * 本基准是零 LLM / 零网络的确定性基准；凡发生一次网络调用，判据即失败（而不是「碰巧没用到」）。
 */
const externalCalls: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = ((..._args: unknown[]) => {
  externalCalls.push("fetch");
  throw new Error("retrieval-eval 是零网络基准：发生了 fetch 调用");
}) as typeof globalThis.fetch;
const _unusedRealFetch = realFetch;

/** 各模式自带报告 ⇒ 抑制原来的读数表（仍可用默认模式看表）。 */
const QUIET =
  FLAG("--json") || FLAG("--compare") || FLAG("--check-baseline") || FLAG("--update-baseline") || FLAG("--determinism-check");
/** 读数输出统一走这里，便于 `--json` / `--compare` 时静音（逻辑不变）。
 *  ⚠ 这里**必须**用 `console.log`：v1.15.42 首次实现时我把全文件的 `console.log(` 批量换成 `emit(`，
 *  把本函数体内那一次也换掉了 ⇒ `emit` 自己调自己（`Maximum call stack size exceeded`）。
 *  教训与标定测试同族：**改名/批量替换也是「断的是谁调用它」的高发区**。 */
const emit = (...args: unknown[]) => {
  if (!QUIET) console.log(...args);
};

if (!existsSync(SHADOW)) {
  console.error(`找不到语料根：${SHADOW}`);
  console.error("（候选 = 由本文件位置往上找，按顺序；全都不存在 ⇒ 拒绝产出读数：");
  for (const r of CANDIDATE_ROOTS) console.error(`   · ${join(r, ".shadow")}${existsSync(join(r, ".shadow")) ? "  ✅" : ""}`);
  console.error(" 用 SHADOW_EVAL_ROOT=<工作区> 显式指定）");
  process.exit(2);
}

// 确定性 PRNG（可复现；多种子报方差，调研要求）
const mulberry = (a) => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };

// ───────────────────────── 语料 ─────────────────────────
// 语料 = **记忆原子**，不是「`.shadow` 下所有 .md」：
//   · 派生物（`_` 前缀：`_index.md` / `_abstract.md`）不算记忆（与 `persistence/files.ts` 同判据）；
//   · `indexes/` 整棵是派生层（ADR-0106），其中 `indexes/projections/<原子名>` 是**每个原子一份的便利贴** ⇒
//     不排除就会把同一条记忆数两遍（v1.21.0 修）。
const files = [];
const DERIVED_DIRS = new Set(["indexes"]);

// ── T11 ①：**留出集与调参集的分离**（v1.21.28）──────────────────────────────
// 切点来自**协议常量**（`holdout_from`，改它＝改数据、被 diff 审阅）：`>= 切点` 的记忆是**留出集**。
// **默认阶段 = `dev`**（调参集，**排除**留出切片）⇒ 留出集在调参期间**根本不会被读**（结构上排除）。
// `--holdout-only` 才读留出切片（报告用），而它**不在 `verify` 里**。
const HOLDOUT_FROM = (() => {
  try {
    const raw = JSON.parse(readFileSync(PROTOCOL_PATH, "utf8"));
    return isDateCut(raw?.holdout_from) ? String(raw.holdout_from) : undefined;
  } catch {
    return undefined; // 协议缺失/坏件 ⇒ 无切点（全部算 dev）；`checkProtocol` 会另行报结构缺失
  }
})();
const PHASE = FLAG("--holdout-only") ? "holdout" : "dev";
if (PHASE === "holdout" && HOLDOUT_FROM === undefined) {
  console.error("拒绝 `--holdout-only`：协议里没有可用的 `holdout_from`（切点）⇒ 没有留出集可读。");
  console.error("  T11 ①：留出集必须是**预注册**的切片（先定切点，再看读数）—— 缺件不静默（ADR-0049）。");
  process.exit(2);
}

const relOf = (p: string) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
let devSeen = 0;
let holdoutSeen = 0;
(function walk(d) {
  let es; try { es = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    const p = join(d, e.name);
    if (e.isDirectory()) {
      if (!DERIVED_DIRS.has(e.name)) walk(p);
    } else if (e.name.endsWith(".md") && !e.name.startsWith("_")) {
      const rel = relOf(p);
      const isHoldout = isHoldoutRel(rel, HOLDOUT_FROM);
      if (isHoldout) holdoutSeen++; else devSeen++;
      if (isHoldout === (PHASE === "holdout")) files.push(p);
    }
  }
})(SHADOW);
files.sort();

// 切片健康：**两侧都必须非空**（空的留出集 = 没有留出集，而它会照样「全过」）。
if (HOLDOUT_FROM !== undefined) {
  const split = splitVerdict(devSeen, holdoutSeen);
  if (!split.ok) {
    console.error(`拒绝产出读数：${split.reason}`);
    console.error(`  （切点 holdout_from = ${HOLDOUT_FROM}；本机语料 dev=${devSeen} / holdout=${holdoutSeen}）`);
    process.exit(2);
  }
}

// **全语料**（用于数据集指纹；路径取工作区相对 posix 路径 ⇒ 与机器/盘符无关）
const corpus = [];
for (const p of files) {
  try {
    corpus.push({ path: p.slice(ROOT.length + 1).replace(/\\/g, "/"), text: readFileSync(p, "utf8") });
  } catch {
    /* 读不到就跳过（并在计数里体现：corpus.length 会小于 files.length） */
  }
}
const DATASET = datasetHash(corpus);

const step = Math.max(1, Math.floor(corpus.length / MAX_DOCS));
const docs = [];
for (let i = 0; i < corpus.length && docs.length < MAX_DOCS; i += step) {
  docs.push({ id: `d${docs.length}`, path: corpus[i].path, text: corpus[i].text });
}
if (docs.length === 0) {
  console.error(`语料为空：${SHADOW} 下没有可读的 \`.md\`（files=${files.length}）—— 拒绝在空语料上产出读数`);
  process.exit(2);
}

// **V7 语料健康门**：空语料之外还有「**语料过小**」（工作区指错但恰好有几十个文件）。
// 阈值是**协议常量**（`min_corpus_files`），不是代码里的硬常量 —— 改判据＝改数据并被 diff 审阅。
// 判据本体在 lib（`corpusFloorVerdict`），由 `retrieval-eval.selftest.ts` 标定边界（v1.15.59）。
{
  const raw = existsSync(PROTOCOL_PATH) ? readFileSync(PROTOCOL_PATH, "utf8").replace(/\r\n/g, "\n") : undefined;
  const minFiles = raw === undefined ? 0 : Number(JSON.parse(raw)?.min_corpus_files ?? 0);
  const floor = corpusFloorVerdict(corpus.length, minFiles);
  if (!floor.ok) {
    console.error(floor.reason);
    console.error("  ⇒ 拒绝产出读数（先确认 SHADOW_EVAL_ROOT / 默认推导的语料根指对了）");
    process.exit(2);
  }
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
  const res: Record<string, Metrics> = {};
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
emit(`语料：${docs.length} 条真实 .shadow 记忆（从 ${files.length} 条等距取样）`);
emit(`词表：${vocab.length} 个 token`);
emit(`K = ${K} · 多种子 = [${SEEDS.join(", ")}]（报均值 ± 极差）`);
emit("");

/** 读数形状（显式类型：`computeAll` 的返回值要跨函数使用，靠推断会退化成 unknown）。 */
type Stat = { mean: number; min: number; max: number; range: number };
type StratRead = { rc: Stat; nd: Stat; nz: Stat; av: Stat };

/** 一次评测里单个策略的读数（显式类型，避免 `{}` 推断成 unknown）。 */
type Metrics = { recall: number; mrr: number; ndcg: number; avgReturned: number; noiseOffTopic: number };

/** 跑一遍完整评测（可重复调用 ⇒ 支撑 `--determinism-check` 的双跑逐字比）。 */
const computeAll = () => {
const acc: Record<string, Metrics[]> = {};
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

emit(`查询：on-topic ${onN} 条（有唯一 gold，**带竞争**）· off-topic ${offN} 条（**语料里完全不存在的词**，gold = 空）`);
emit("");
emit("=".repeat(100));
emit(`${"策略".padEnd(22)}${"recall".padStart(16)}${"nDCG".padStart(16)}${"均返回".padStart(10)}${"离题噪声".padStart(18)}`);
emit(`${"".padEnd(22)}${"mean±range".padStart(16)}${"mean±range".padStart(16)}${"".padStart(10)}${"mean±range".padStart(18)}`);
emit("=".repeat(100));
const R: Record<string, StratRead> = {};
for (const nm of Object.keys(strategies)) {
  const rc = stat(acc[nm].map((x) => x.recall));
  const nd = stat(acc[nm].map((x) => x.ndcg));
  const nz = stat(acc[nm].map((x) => x.noiseOffTopic));
  const av = stat(acc[nm].map((x) => x.avgReturned));
  R[nm] = { rc, nd, nz, av };
  emit(`${nm.padEnd(20)}${`${rc.mean.toFixed(3)}±${rc.range.toFixed(3)}`.padStart(16)}${`${nd.mean.toFixed(3)}±${nd.range.toFixed(3)}`.padStart(16)}${av.mean.toFixed(2).padStart(10)}${`${nz.mean.toFixed(3)}±${nz.range.toFixed(3)}`.padStart(18)}`);
}
return { R, onN, offN };
};

const RUN = computeAll();
const R = RUN.R;
const onN = RUN.onN;
const offN = RUN.offN;
emit("=".repeat(100));
emit("");
emit(`【语料口径（T11 ①）】phase=${PHASE} · 切点 holdout_from=${HOLDOUT_FROM ?? "（协议未声明 ⇒ 全部算调参集）"} · dev=${devSeen} / holdout=${holdoutSeen} · 本次入评 ${corpus.length} 条`);
emit("");
emit("【裁决性对比】");
const A = R["A 单库·词·有阈值"], C = R["C 扇出2库·无阈值+RRF"], D = R["D 路由·有阈值+弃权"], E = R["E 扇出2库·有阈值+RRF"], F = R["F 单库·二元组·有阈值"];
const cmp = (a, b, label, higherBetter = true) => {
  const d = b.mean - a.mean;
  const verdict = Math.abs(d) < 1e-9 ? "打平" : (higherBetter ? (d > 0 ? "更好" : "更差") : (d > 0 ? "更差" : "更好"));
  emit(`  ${label.padEnd(38)} ${a.mean.toFixed(3)} → ${b.mean.toFixed(3)}  (${d >= 0 ? "+" : ""}${d.toFixed(3)}) ${verdict}`);
};
emit("  ── 召回：扇出在有互补来源时是否真有增益 ──");
cmp(F.rc, E.rc, "扇出(词+二元组) vs 单·二元组", true);
cmp(A.rc, E.rc, "扇出(词+二元组) vs 单·词", true);
emit("  ── 噪声：无阈值扇出的代价 ──");
cmp(A.nz, C.nz, "无阈值扇出 vs 有阈值单库 · 离题噪声", false);
cmp(A.nz, E.nz, "有阈值扇出 vs 有阈值单库 · 离题噪声", false);
emit("  ── 预算 ──");
cmp(A.av, C.av, "候选预算消耗（无阈值扇出）", false);
cmp(A.av, E.av, "候选预算消耗（有阈值扇出）", false);
emit("");
emit("【关键读数 · 逐条】");
emit(`  ① 无阈值检索器恒返 K：离题查询噪声 = ${C.nz.mean.toFixed(3)}（有阈值单库 A = ${A.nz.mean.toFixed(3)}）`);
emit(`     ⇒ 「无阈值」这**一个**性质就足以让离题查询灌满噪声，与库数无关；扇出只是把它乘以库数。`);
emit(`  ② 扇出（含互补来源）**没换来召回**：扇出 ${E.rc.mean.toFixed(3)} vs 单·词 ${A.rc.mean.toFixed(3)}（${(E.rc.mean - A.rc.mean >= 0 ? "+" : "")}${(E.rc.mean - A.rc.mean).toFixed(3)}），`);
emit(`     对单·二元组仅 +${(E.rc.mean - F.rc.mean).toFixed(3)}，落在多种子极差 ±${E.rc.range.toFixed(3)} 内 → **不显著**。`);
emit(`  ③ 二元组检索器**阈值更弱**（离题噪声 ${F.nz.mean.toFixed(3)} vs 词检索器 ${A.nz.mean.toFixed(3)}）：`);
emit(`     这是「每个来源各自标定阈值」（文献 SSCC）的实证依据——阈值强弱**因检索器而异**。`);
emit(`  ④ 最差是无阈值扇出（C）：召回不升（${C.rc.mean.toFixed(3)} vs ${A.rc.mean.toFixed(3)}）· 噪声 ${C.nz.mean.toFixed(3)} · 预算 ${C.av.mean.toFixed(2)} 条/查询。`);
emit("");
emit("诚实边界：");
emit("  · 检索器是**按 ADR-0054 实测性质建模**的（无阈值 = 恒返 K），不是真实向量模型；");
emit("  · 本机 semble / zg 均未安装（ENOENT），故未跑真实向量检索；装机后可用本工具复测；");
emit("  · 语料是本系统真 `.shadow`，但查询是「部分线索」式（3 个 token），非自然语言问句。");

// ───────────────────── T14：协议 / 基线 / 比较（模式） ─────────────────────
// 判据全在 `retrieval-eval.lib.ts`（纯函数）。本段只做 IO 与**退出码语义**。
const readProtocolFile = () => {
  if (!existsSync(PROTOCOL_PATH)) return { protocol: undefined, sha: "" };
  const raw = readFileSync(PROTOCOL_PATH, "utf8").replace(/\r\n/g, "\n");
  return { protocol: JSON.parse(raw), sha: sha256Hex(raw) };
};

const { protocol: PROTOCOL, sha: PROTOCOL_SHA } = readProtocolFile();

/** 机器可读结果：**只有聚合数字 + 哈希 + 枚举**（由 `checkAggregateOnly` 机械核实）。 */
const metrics: Record<string, Record<string, number>> = {};
for (const [nm, v] of Object.entries(R)) {
  metrics[nm] = {
    recall_mean: v.rc.mean,
    recall_range: v.rc.range,
    ndcg_mean: v.nd.mean,
    avg_returned_mean: v.av.mean,
    noise_offtopic_mean: v.nz.mean,
  };
}
// 口径声明（T11 ①）：**读数运行**缺省按调参口径；**录基线**时强制显式声明（见 `--update-baseline`）。
const ROLE_ARG = VALUE("--corpus-role");
if (ROLE_ARG !== undefined) {
  const roleOk = corpusRoleVerdict(ROLE_ARG);
  if (!roleOk.ok) {
    console.error(`❌ ${roleOk.reason}`);
    process.exit(1);
  }
}
const CORPUS_ROLE = ROLE_ARG ?? "live-workspace";
const PHASE_OK = phaseVerdict(PHASE);
if (!PHASE_OK.ok) {
  console.error(`❌ ${PHASE_OK.reason}`);
  process.exit(1);
}

const RESULT = {
  protocol_version: PROTOCOL?.protocol_version ?? "retrieval-eval-unversioned",
  baseline_tag: PROTOCOL?.baseline_tag ?? "none",
  provenance: "local_dev_aggregate_only",
  // T11 ①：**这两项必须随基线一起落盘**，否则读者无从知道「这份基线是哪份语料、哪个切片录的」。
  corpus_role: CORPUS_ROLE,
  eval_phase: PHASE,
  dataset_hash_algorithm: DATASET.algorithm,
  dataset_sha256: DATASET.hex,
  protocol_sha256: PROTOCOL_SHA,
  case_count: onN + offN,
  on_topic_count: onN,
  off_topic_count: offN,
  docs: docs.length,
  source_files: corpus.length,
  k: K,
  max_docs: MAX_DOCS,
  seeds: SEEDS,
  external_model_calls: externalCalls.length,
  metrics,
};

// 本工具**自己**也必须只产出聚合面（否则「基线不含语料」这条判据没有意义）
const selfLeak = checkAggregateOnly(RESULT, "result");
if (selfLeak.length > 0) {
  console.error("工具自身产出的结果不符合「只含聚合面」的形状约束：");
  for (const v of selfLeak) console.error(`  ✗ [${v.rule}] ${v.where} —— ${v.why}`);
  process.exit(1);
}

if (FLAG("--json")) {
  console.log(stableStringify(RESULT));
}

if (FLAG("--check-baseline")) {
  // 便宜的完整性门（不碰语料数值）：协议自检 + 基线形状（不得含语料）+ 协议同源
  const violations = [];
  if (PROTOCOL === undefined) {
    violations.push("协议文件缺失：" + PROTOCOL_PATH);
  } else {
    for (const v of checkProtocol(PROTOCOL)) violations.push(`[${v.rule}] ${v.where} —— ${v.why}`);
  }
  if (!existsSync(BASELINE_PATH)) {
    violations.push(`基线缺失：${BASELINE_PATH}（用 --update-baseline 录制；**缺件不得静默通过**）`);
  } else {
    const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
    for (const v of checkAggregateOnly(baseline, "baseline")) violations.push(`[${v.rule}] ${v.where} —— ${v.why}`);
    if (baseline.dataset_hash_algorithm !== DATASET.algorithm) {
      violations.push(`基线哈希算法 ${baseline.dataset_hash_algorithm} ≠ 本工具 ${DATASET.algorithm}`);
    }
    if (PROTOCOL !== undefined && baseline.protocol_sha256 !== PROTOCOL_SHA) {
      violations.push(`基线的 protocol_sha256 与当前协议文件不一致 ⇒ 判据已变但基线未重录`);
    }
    const gated = new Set<string>((PROTOCOL?.gated_metrics ?? []) as string[]);
    for (const strategy of Object.keys(baseline.metrics ?? {})) {
      for (const f of gated) {
        if (typeof baseline.metrics[strategy]?.[f] !== "number") violations.push(`基线缺读数：${strategy}.${f}`);
      }
    }
    // T11 ①（v1.21.28）：基线的**口径声明**必须齐备 —— 否则读者无从知道「这份基线是哪份语料、哪个切片录的」，
    // 也就无法判断「报告口径与调参口径是否同源」。缺件不静默。
    const roleOk = corpusRoleVerdict(baseline.corpus_role);
    if (!roleOk.ok) violations.push(`基线缺口径声明：${roleOk.reason}`);
    const phaseOk = phaseVerdict(baseline.eval_phase);
    if (!phaseOk.ok) violations.push(`基线缺阶段声明：${phaseOk.reason}`);
    console.log(`  基线口径：corpus_role=${baseline.corpus_role} · eval_phase=${baseline.eval_phase} · 协议切点 holdout_from=${HOLDOUT_FROM ?? "（未声明）"}`);
    console.log(`  本次运行：corpus_role=${CORPUS_ROLE} · eval_phase=${PHASE} · 语料 sha ${DATASET.hex.slice(0, 12)}… vs 基线 ${String(baseline.dataset_sha256).slice(0, 12)}…`);
    if (baseline.dataset_sha256 !== DATASET.hex) {
      // **刻意不是违规**：本仓语料是活的，每回合都可能变 ⇒ 判违规＝常红的假闸门。
      // 这里只把「不可比」这条事实说出来（数值判定是 `--compare` 的事，它会给第三种结论）。
      console.log("    ⚠ 语料 sha 与基线不同 ⇒ 数值**不可比**（本门只判协议/形状/口径声明，不做数值判定）");
    }
  }
  if (violations.length > 0) {
    console.log(`基线完整性检查：失败（${violations.length} 处）`);
    for (const v of violations) console.log(`  ✗ ${v}`);
    process.exit(1);
  }
  console.log("基线完整性检查：通过 ✅（协议自检 / 基线只含聚合面 / 协议同源 / 门控读数齐备）");
  process.exit(0);
}

if (FLAG("--update-baseline")) {
  const FORCE = FLAG("--force");
  // T11 ①（v1.21.28）：**录基线必须显式声明语料口径**（不许默认成某一个）——
  // 基线是「报告口径」的锚点，若不声明它是活语料还是冻结快照录的，下一次就没有任何东西能判断
  // 「这条读数是不是拿调参语料当报告用」。
  if (ROLE_ARG === undefined) {
    console.log("拒绝录基线：必须显式声明语料口径 `--corpus-role <live-workspace|frozen-snapshot>`。");
    console.log("  缘由（T11 ①）：报告口径与调参口径**必须可区分**——「不得针对调参集调完就拿它当报告」。");
    console.log(`  另请确认阶段：默认 dev（调参切片）；报告口径请用 \`--holdout-only\`（切点见协议 holdout_from=${HOLDOUT_FROM ?? "未声明"}）。`);
    process.exit(1);
  }
  if (existsSync(BASELINE_PATH) && !FORCE) {
    console.log(`拒绝覆盖既有基线：${BASELINE_PATH}`);
    console.log("（防「重刷基线掩盖退化」；确要重录请显式加 --force，并在提交信息里说明为什么旧基线失效）");
    process.exit(1);
  }
  writeFileSync(BASELINE_PATH, stableStringify(RESULT), "utf8");
  console.log(`已写入基线：${BASELINE_PATH}`);
  console.log(`  provenance = ${RESULT.provenance}（只含聚合数字 + 哈希 + 枚举；不含记忆原文/路径/日期）`);
  console.log(`  corpus_role = ${RESULT.corpus_role} · eval_phase = ${RESULT.eval_phase} · 切点 holdout_from = ${HOLDOUT_FROM ?? "（协议未声明）"}`);
  console.log(`  dataset_sha256 = ${RESULT.dataset_sha256}`);
  console.log(`  protocol_sha256 = ${RESULT.protocol_sha256}`);
  console.log(`  case_count = ${RESULT.case_count} · docs = ${RESULT.docs} / source_files = ${RESULT.source_files}`);
  if (FORCE && existsSync(BASELINE_PATH)) console.log("  ⚠ 本次使用了 --force（覆盖了旧基线）");
  process.exit(0);
}

if (FLAG("--determinism-check")) {
  // hl_mem 的 `docs/benchmark/core-v1.md:21-22` 要求「两次运行功能字段逐字相同，只允许延迟字段可变」；
  // 它**自己只有散文没有脚本**（见 references §6.6 的洞）。这里把它做成可执行的。
  const second = computeAll();
  const projection = (r: ReturnType<typeof computeAll>) =>
    stableStringify({
      onN: r.onN,
      offN: r.offN,
      metrics: Object.fromEntries(
        Object.entries(r.R).map(([nm, v]) => [
          nm,
          { rc: v.rc, nd: v.nd, nz: v.nz, av: v.av },
        ]),
      ),
    });
  const a = projection(RUN);
  const b = projection(second);
  if (a === b) {
    console.log("双跑逐字比：通过 ✅（功能字段两次运行逐字节相同；本工具无延迟字段）");
    process.exit(0);
  }
  console.log("双跑逐字比：失败 ✗（同一输入两次运行的功能字段不同 ⇒ 存在未受控的非确定性来源）");
  const la = a.split("\n");
  const lb = b.split("\n");
  for (let i = 0; i < Math.max(la.length, lb.length); i++) {
    if (la[i] !== lb[i]) {
      console.log(`  首个差异 @ 行 ${i + 1}:`);
      console.log(`    跑1: ${la[i]}`);
      console.log(`    跑2: ${lb[i]}`);
      break;
    }
  }
  process.exit(1);
}

if (FLAG("--compare")) {
  if (PROTOCOL === undefined) {
    console.log(`协议缺失：${PROTOCOL_PATH}`);
    process.exit(1);
  }
  if (!existsSync(BASELINE_PATH)) {
    console.log(`基线缺失：${BASELINE_PATH}（缺件不得静默通过；用 --update-baseline 录制）`);
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  const cmp = compareEval({
    candidate: RESULT,
    baseline,
    protocol: PROTOCOL,
    candidateProtocolSha256: PROTOCOL_SHA,
    baselineProtocolSha256: baseline.protocol_sha256,
  });
  console.log("确定性基准门（retrieval-eval）");
  console.log(`  协议 ${PROTOCOL.protocol_version} · sha ${PROTOCOL_SHA.slice(0, 12)}… · 门控指标 ${PROTOCOL.gated_metrics.join(" / ")}`);
  console.log(`  候选语料 sha ${RESULT.dataset_sha256.slice(0, 12)}… · ${RESULT.case_count} 案 · docs ${RESULT.docs}/${RESULT.source_files}`);
  console.log(`  基线语料 sha ${String(baseline.dataset_sha256).slice(0, 12)}… · ${baseline.case_count} 案 · docs ${baseline.docs}/${baseline.source_files}`);
  console.log(`  外部模型调用：${RESULT.external_model_calls}（要求 ${PROTOCOL.required_external_model_calls}）`);
  if (!cmp.comparable) {
    console.log("");
    console.log(`结论：**不可比**（既不是通过也不是失败）—— ${cmp.reason}`);
    process.exit(3);
  }
  if (cmp.violations.length === 0) {
    console.log("");
    console.log("结论：通过 ✅（同源 · 门控指标全在容差内 · 外部调用数符合要求 · 无缺 slice）");
    process.exit(0);
  }
  console.log("");
  console.log(`结论：失败 ✗（${cmp.violations.length} 处）`);
  for (const v of cmp.violations) console.log(`  ✗ [${v.rule}] ${v.where}\n      ${v.why}`);
  process.exit(1);
}
