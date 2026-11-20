/**
 * v3 ops — 「频率相近召回」基准（探针外置：不把个人语料写进仓库）。
 *   node tools/bench-recall.ts --ws <workspace> --probes <jsonl>
 *   或 SHADOW_WS / SHADOW_PROBES 环境变量。
 * probes.jsonl：正例 {"q":"...","expect":"...","note":"..."}；负例 {"q":"...","neg":true}
 */
import { realFs } from "../dist/store/fs.js";
import { normalizeConfig } from "../dist/contract/config.js";
import { systemClock } from "../dist/contract/time.js";
import { SignalStore } from "../dist/engine/signals.js";
import { loadAtomsFromLinesCached } from "../dist/engine/lines.js";
import { runRead } from "../dist/engine/read/route.js";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
let ws = "";
let probesPath = "";
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--ws") ws = args[++i] ?? "";
  else if (args[i] === "--probes") probesPath = args[++i] ?? "";
  else if (!args[i]!.startsWith("--") && !ws) ws = args[i]!;
}
ws = ws || process.env.SHADOW_WS || "";
probesPath = probesPath || process.env.SHADOW_PROBES || "";
if (!ws || !probesPath) {
  console.error("用法: node tools/bench-recall.ts --ws <workspace> --probes <probes.jsonl>（不内置个人路径/语料）");
  process.exit(2);
}

type Probe = { q: string; expect?: string; note?: string; neg?: boolean };
const probes: Probe[] = readFileSync(probesPath, "utf8")
  .split("\n").map((l) => l.trim()).filter(Boolean).map((l) => JSON.parse(l) as Probe);
const positives = probes.filter((p) => !p.neg && p.expect);
const negatives = probes.filter((p) => p.neg).map((p) => p.q);

const deps = {
  fs: realFs,
  ws,
  config: normalizeConfig({}),
  clock: systemClock,
  signals: new SignalStore(),
  loadAtoms: async () => {
    const r = await loadAtomsFromLinesCached(realFs, ws);
    return { ok: true as const, value: { atoms: r.atoms, errors: r.errors.map((m) => ({ rel: "", code: "LINE", message: m })) } };
  },
};

const decOf = (t: string): string[] => {
  const s = (t.split("## 相关决策/否决")[1] || "").split("##")[0];
  return s.split("\n").filter((l) => l.trim().startsWith("- ")).map((l) => l.replace(/^-\s*/, "").trim());
};
const matchedOf = (t: string): number => {
  const m = t.match(/命中 (\d+) 点/);
  return m ? Number(m[1]) : 0;
};

let hit = 0, rr = 0, neighborCovered = 0, netNodesSum = 0;
const lineOf = (r: string): string => r.split("#")[0] ?? r;
console.log("== 正例（换措辞未来句 → 期望决策命中 + 关系网邻居）==");
for (const p of positives) {
  const r = await runRead(deps as any, { background: true, topic: p.q });
  const t = r.ok ? r.value.text : "";
  const decs = decOf(t);
  const idx = decs.findIndex((d) => d.includes(p.expect!));
  if (idx >= 0) { hit++; rr += 1 / (idx + 1); }
  const netRels = (t.split("## 关系网")[1] || "").split("##")[0].split("\n")
    .filter((l) => /^- \[h\d+\] /.test(l.trim())).map((l) => l.replace(/^- \[h\d+\] /, "").trim());
  netNodesSum += netRels.length;
  const hasLineNeighbor = netRels.some((a, i) => netRels.some((b, j) => i !== j && lineOf(a) === lineOf(b)));
  if (hasLineNeighbor) neighborCovered++;
  console.log(`- [${p.note ?? p.q}] → ${idx >= 0 ? `命中 @${idx + 1}` : "未命中"} · 网${netRels.length}节点${hasLineNeighbor ? "·含同线邻居" : ""}`);
}
let spurious = 0;
console.log("== 负例（无关句 → 不应抽出相关决策）==");
for (const q of negatives) {
  const r = await runRead(deps as any, { background: true, topic: q });
  const t = r.ok ? r.value.text : "";
  const bad = decOf(t).length > 0;
  if (bad) spurious++;
  console.log(`- q=「${q}」 → 命中${matchedOf(t)}点 · 决策${decOf(t).length}条 ${bad ? "⚠假阳" : "✓"}`);
}
console.log(`\n[bench-recall] 正例 hit@10 = ${hit}/${positives.length} · MRR = ${(rr / positives.length).toFixed(2)} · 网含同线邻居 = ${neighborCovered}/${positives.length} · 平均网节点 = ${(netNodesSum / positives.length).toFixed(1)} · 负例假阳 = ${spurious}/${negatives.length}`);
