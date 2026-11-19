/**
 * v3 ops — 「频率相近召回」正式基准（paraphrase → 大背景命中 · 严格 MRR · 假阳率）。
 *   node tools/bench-recall.ts [ws]
 * 只用真实 .shadow（只读）。正例：换措辞的未来句 → 期望在「相关决策」里出现的标记；
 * 负例：与记忆无关的句子 → 不应抽出相关决策（记假阳）。
 */
import { realFs } from "../dist/store/fs.js";
import { normalizeConfig } from "../dist/contract/config.js";
import { systemClock } from "../dist/contract/time.js";
import { SignalStore } from "../dist/engine/signals.js";
import { loadAtomsFromLinesCached } from "../dist/engine/lines.js";
import { runRead } from "../dist/engine/read/route.js";

const ws = process.argv[2] || process.env.SHADOW_WS || "";
if (!ws) {
  console.error("用法: node tools/bench-recall.ts <workspace> 或 SHADOW_WS=<workspace>（不内置个人路径/语料）");
  process.exit(2);
}
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

const positives: { q: string; expect: string; note: string }[] = [
  { q: "别给我上多数据库 直接接 Postgres 扩展", expect: "多数据库", note: "否决·多库抽象" },
  { q: "吸完气停一秒再呼气 节奏不对", expect: "吸6", note: "决策·吸6停1呼4" },
  { q: "邮件正文和卡片节奏对不上", expect: "吸6", note: "决策·节律统一" },
  { q: "这个界面太窄了 看不全", expect: "加宽", note: "决策·界面加宽50%" },
  { q: "别搞一堆数据库适配", expect: "多数据库", note: "否决·同义" },
  { q: "这个 ui 做得太一般了", expect: "都不要", note: "否决·UI一般" },
  { q: "仓库起名要和目录一致", expect: "仓库名字", note: "决策·仓库改名" },
  { q: "密码别放 password.txt 用环境变量", expect: ".env", note: "决策·.env代替" },
  { q: "只调呼气 别动吸气", expect: "百汇", note: "决策·只改呼气" },
  { q: "别用 dry_run 演练了 直接发", expect: "dry_run", note: "决策·删dry_run" },
  { q: "左下角那个入口去掉", expect: "remote-wsl", note: "否决·入口不要" },
  { q: "别把“真发”这词写进功能", expect: "真发", note: "约束·真发不体现" },
  { q: "更偏好方案 B", expect: "更喜欢B", note: "偏好·方案B" },
  { q: "小数字要保留", expect: "保留小数字", note: "决策·保留小数字" },
  { q: "中间把数字带上", expect: "数字", note: "决策·中间带数字" },
  { q: "吸气到底要停一下", expect: "停顿", note: "决策·吸气停顿1s" },
];
const negatives: string[] = [
  "量子纠缠退相干实验", "今天中午吃什么好", "kubernetes 的 pod 调度策略",
  "股票今天行情怎么样", "明天上海天气预报", "翻译一首唐诗成英文",
  "推荐点适合跑步的音乐", "帮我制定健身增肌计划",
  "如何做红烧肉", "最新的 iphone 值得买吗", "帮我写一首爱情诗",
  "美元兑人民币汇率", "这周有什么电影上映", "怎么提高英语口语",
  "解释一下相对论",
];

let hit = 0, rr = 0, pos = positives.length;
let neighborCovered = 0, netNodesSum = 0;
const lineOf = (r: string): string => r.split("#")[0] ?? r;
console.log("== 正例（换措辞未来句 → 期望决策命中 + 关系网邻居）==");
for (const p of positives) {
  const r = await runRead(deps as any, { background: true, topic: p.q });
  const t = r.ok ? r.value.text : "";
  const decs = decOf(t);
  const idx = decs.findIndex((d) => d.includes(p.expect));
  if (idx >= 0) { hit++; rr += 1 / (idx + 1); }
  const netRels = (t.split("## 关系网")[1] || "").split("##")[0].split("\n")
    .filter((l) => /^- \[h\d+\] /.test(l.trim())).map((l) => l.replace(/^- \[h\d+\] /, "").trim());
  netNodesSum += netRels.length;
  const hasLineNeighbor = netRels.some((a, i) => netRels.some((b, j) => i !== j && lineOf(a) === lineOf(b)));
  if (hasLineNeighbor) neighborCovered++;
  console.log(`- [${p.note}] q=「${p.q}」 → ${idx >= 0 ? `命中 @${idx + 1}` : "未命中"} · 网${netRels.length}节点${hasLineNeighbor ? "·含同线邻居" : "·无同线邻居"}`);
}
let spurious = 0;
console.log("== 负例（无关句 → 不应抽出相关决策）==");
for (const q of negatives) {
  const r = await runRead(deps as any, { background: true, topic: q });
  const t = r.ok ? r.value.text : "";
  const decs = decOf(t);
  const bad = decs.length > 0;
  if (bad) spurious++;
  console.log(`- q=「${q}」 → 命中${matchedOf(t)}点 · 决策${decs.length}条 ${bad ? "⚠假阳" : "✓"}`);
}
console.log(`\n[bench-recall] 正例 hit@10 = ${hit}/${pos} · MRR = ${(rr / pos).toFixed(2)} · 网含同线邻居 = ${neighborCovered}/${pos} · 平均网节点 = ${(netNodesSum / pos).toFixed(1)} · 负例假阳 = ${spurious}/${negatives.length}（假阳率 ${((spurious / negatives.length) * 100).toFixed(0)}%）`);
