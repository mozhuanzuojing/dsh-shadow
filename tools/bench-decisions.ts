/**
 * v3 ops — 决策四分类基准（刻意不进 verify：可指真实语料）。
 *   node tools/bench-decisions.ts [--corpus ../.shadow]
 * 输出：①embedded 黄金集准确率；②真实用户话语：旧(decisionClass)命中 vs 新(classifyTurn=decision) 的降噪对比 + 新分布。
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { classifyTurn, type TurnClass } from "../dist/domain/turn.js";
import { decisionClass } from "../dist/domain/collect.js";
import { parseLine } from "../dist/domain/lines.js";

const argv = process.argv.slice(2);
let corpus = "../.shadow";
for (let i = 0; i < argv.length; i++) if (argv[i] === "--corpus") corpus = argv[++i] ?? corpus;

// ① 黄金集
const golden: [string, TurnClass][] = [
  ["不要多数据库抽象。对 taste.json 继续精修", "decision"],
  ["dsh-remote-wsl 在dsh左下角的入口不要了", "decision"],
  ["只改呼气 去掉百汇", "decision"],
  ["删除 dry_run:true 这个功能 邮件直接发", "decision"],
  ["提的邮件正文与卡片节律不一致，一并改成「吸6/停1/呼4」", "decision"],
  ["这个界面加宽50%", "decision"],
  ["更喜欢B", "decision"],
  ["不要修改任何文件", "decision"],
  ["都做", "confirmation"],
  ["同意", "confirmation"],
  ["重启完成", "confirmation"],
  ["好，继续抽查", "confirmation"],
  ["要", "confirmation"],
  ["收尾", "confirmation"],
  ["Background subagent reviewer finished and will do no further", "noise"],
  ["This is an automatically generated checkpoint condensing an", "noise"],
  ["只读任务，不要改任何文件。项目：x", "noise"],
  ["独立代码审查一个 DSH 客户端插件的最新改动（只读审查，不要修改任何文件）。", "noise"],
  ["东方禅意风格）。当前统计页像\"台账/表单\"（等权行 + 邮箱混入", "background"],
];
let ok = 0;
for (const [t, want] of golden) if (classifyTurn(t) === want) ok++;
console.log(`[golden] 四分类准确率 ${((ok / golden.length) * 100).toFixed(1)}% (${ok}/${golden.length})`);

// ② 真实语料：旧命中 vs 新命中
const linesDir = (() => {
  try { if (statSync(join(corpus, "lines")).isDirectory()) return join(corpus, "lines"); } catch { /* ignore */ }
  return corpus;
})();
const seen = new Set<string>();
const SCAF = /(Time sampled|Current DSH|This is an automatically|Background subagent|The available skill|自动召回|⚠)/i;
const utts: string[] = [];
const walk = (d: string): void => {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.endsWith(".md"))
      for (const pt of parseLine(readFileSync(p, "utf8")).points)
        for (const ln of (pt.body || "").split("\n")) {
          const m = /^-\s*\[[^\]]*\]\s*\[[^\]]*\]\s*(.*)$/.exec(ln.trim());
          const t = (m ? m[1]! : ln).trim();
          if (!/^用户：/.test(t)) continue;
          const c = t.replace(/^用户：/, "").trim();
          if (c.length < 2 || c.length > 200 || SCAF.test(c) || /^\d{4}-/.test(c) || seen.has(c)) continue;
          seen.add(c);
          utts.push(c);
        }
  }
};
walk(linesDir);

let oldHit = 0, newHit = 0;
const dist: Record<string, number> = { decision: 0, confirmation: 0, background: 0, noise: 0, "": 0 };
const decisions: string[] = [];
for (const t of utts) {
  const oldIs = decisionClass(t) !== "";
  const c = classifyTurn(t);
  if (oldIs) oldHit++;
  if (c === "decision") { newHit++; decisions.push(t); }
  dist[c || ""] = (dist[c || ""] ?? 0) + 1;
}
console.log(`[real] 用户话语(去重)=${utts.length} · 旧 decisionClass 命中=${oldHit} · 新 classifyTurn=decision=${newHit}（降噪 ${oldHit - newHit}）`);
console.log(`[real] 新分布：decision=${dist.decision} confirmation=${dist.confirmation} background=${dist.background} noise=${dist.noise} 未定=${dist[""]}`);
console.log("[real] 新-决策样例：");
for (const t of decisions.slice(0, 20)) console.log("  •", t.slice(0, 60));
