/**
 * v3 ops — 方向/问询大语料基准（刻意不进 verify：可选真实语料、量大）。
 *
 *   node tools/bench-direction.ts 20000                       # 仅合成长语料性能
 *   node tools/bench-direction.ts --corpus ../.shadow 20000   # 叠加真实 .shadow 规模/降级率/性能
 *
 * 真实语料**只读**、不提交；输出为证据（数字可由命令再生）。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { parseLine } from "../dist/domain/lines.js";
import { buildDirection, rankCandidates } from "../dist/domain/intent.js";

const argv = process.argv.slice(2);
let corpus = "";
let labeled = "";
let nSynthetic = 20000;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--corpus") corpus = argv[++i] ?? "";
  else if (argv[i] === "--labeled") labeled = argv[++i] ?? "";
  else if (/^\d+$/.test(argv[i]!)) nSynthetic = Number(argv[i]);
}

// —— 合成长语料：性能 + 规模 ——
const big: { text: string }[] = [];
for (let i = 0; i < nSynthetic; i++) big.push({ text: `第${i}项 保留 简单 模块 证据 边界 方案 不要 抽象` });
const t0 = performance.now();
const dir = buildDirection(big);
const tBuild = performance.now() - t0;
const t1 = performance.now();
const ranked = rankCandidates(dir, Array.from({ length: 500 }, (_, i) => `候选方向${i} 简单 模块 证据`));
const tRank = performance.now() - t1;
console.log(`[synthetic] utterances=${nSynthetic} build=${tBuild.toFixed(1)}ms rank500=${tRank.toFixed(1)}ms keywords=${dir.keywords.slice(0, 4).join("/")} survivors=${ranked.ranked.filter((r) => r.status === "ok").length}`);

if (corpus) {
  // —— 真实 .shadow 语料：规模 / 会话 / 降级率 / 构建耗时 ——
  const linesDir = (() => {
    try { if (statSync(join(corpus, "lines")).isDirectory()) return join(corpus, "lines"); } catch { /* ignore */ }
    return corpus;
  })();
  let files = 0, points = 0, userLines = 0;
  const sessions = new Set<string>();
  const utts: { text: string; at?: string }[] = [];
  const SCAFFOLD = /(Time sampled|Current DSH|The available skill|Background subagent|This is an automatically|自动召回|⚠)/i;
  const readDirRec = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) readDirRec(p);
      else if (e.name.endsWith(".md")) {
        files++;
        const sess = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(p);
        if (sess) sessions.add(sess[1]!);
        for (const pt of parseLine(readFileSync(p, "utf8")).points) {
          points++;
          for (const ln of (pt.body || "").split("\n")) {
            const m = /^-\s*\[[^\]]*\]\s*\[[^\]]*\]\s*(.*)$/.exec(ln.trim());
            const t = (m ? m[1]! : ln).trim();
            if (!/^用户：/.test(t)) continue;
            const c = t.replace(/^用户：/, "").trim();
            if (SCAFFOLD.test(c) || /^\d{4}-\d\d-\d\dT\d/.test(c)) continue;
            userLines++;
            utts.push({ text: c });
          }
        }
      }
    }
  };
  readDirRec(linesDir);
  const t2 = performance.now();
  const realDir = buildDirection(utts, { minSamples: 2 });
  const tReal = performance.now() - t2;
  console.log(`[corpus] dir=${linesDir} files=${files} points=${points} sessions=${sessions.size} userLines=${userLines}`);
  console.log(`[corpus] build(allUserLines)=${tReal.toFixed(1)}ms · samples=${realDir.samples} undecidable=${realDir.undecidable}(${realDir.reason ?? "-"}) · keywords=${realDir.keywords.slice(0, 5).join("/") || "(空)"}`);
  console.log(`[corpus] 降级率(fast-fail)=${realDir.undecidable ? "100%" : "0%"}（整库单向量仅参考；真实用法按 topic 分簇）`);
}

if (labeled) {
  const rows = readFileSync(labeled, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { utt: string[]; cands: string[]; top?: string; excluded?: string[]; undecidable?: boolean; handle?: string });
  let ok = 0;
  const fails: string[] = [];
  for (const r of rows) {
    const d = buildDirection(r.utt.map((text) => ({ text })));
    const rr = rankCandidates(d, r.cands);
    let good: boolean;
    if (r.undecidable) good = rr.undecidable === true;
    else {
      const top = rr.ranked.find((x) => x.status === "ok");
      good = !rr.undecidable && top?.candidate === r.top && (r.excluded ?? []).every((ex) => rr.ranked.find((q) => q.candidate === ex)?.status === "excluded");
    }
    if (good) ok++;
    else fails.push(`${r.handle ?? "?"} :: utt=${JSON.stringify(r.utt)} 期望top=${JSON.stringify(r.top)} 实际top=${JSON.stringify(rr.ranked[0]?.candidate)} undecidable=${rr.undecidable}`);
  }
  console.log(`[labeled] ${labeled} → 真实准确率 ${((ok / rows.length) * 100).toFixed(1)}% (${ok}/${rows.length})`);
  for (const f of fails) console.log("  ✗ " + f);
}
