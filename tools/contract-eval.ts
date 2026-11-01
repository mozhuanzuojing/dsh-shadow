/**
 * v2 ops — CONTRACT C6 的机械基线（30 任务抽样）。
 *
 * 只做可确定性检查：是否能从摘要/决策/入口召回目标 Atom、证据句柄是否可解析、五要素是否齐全、
 * 是否出现“理由不在原文”。语义上的“读者能否还原为什么”仍需人工/评审打分。
 */

import { existsSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { normalizeConfig } from "../dist/contract/config.js";
import { systemClock } from "../dist/contract/time.js";
import { loadAllAtoms } from "../dist/store/archive.js";
import { realFs } from "../dist/store/fs.js";
import { scoreAtoms } from "../dist/engine/read/recall.js";
import { tokenize } from "../dist/domain/text.js";
import type { ParsedAtom } from "../dist/contract/types.js";

const arg = (name: string, fallback: string): string => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const ws = resolve(arg("ws", process.cwd()));
const sampleSize = Math.max(1, Math.min(200, Number(arg("sample", "30")) || 30));
const out = resolve(arg("out", `docs/v2/CONTRACT-BASELINE-${systemClock.today()}.md`));

const all = await loadAllAtoms(realFs, ws);
if (!all.ok) {
  console.error(`[contract-eval] 读取失败（${all.error.code}）：${all.error.message}`);
  process.exit(2);
}

const candidates = all.value.atoms
  .filter(
    (a) =>
      a.body.trim() &&
      a.kind === "memory" &&
      a.entry !== "shadow" &&
      Boolean(a.summary || a.goal || a.decisions.length || a.materials.length),
  )
  .sort((a, b) => `${b.date} ${b.time} ${b.rel}`.localeCompare(`${a.date} ${a.time} ${a.rel}`));
if (!candidates.length) {
  console.error("[contract-eval] 没有可抽样 Atom（已排除 entry=shadow 的会话元数据）");
  process.exit(2);
}

// 按 entry 分层轮询：真实语料里 project 字段常全是工作区名，entry 才是任务主题键。
const groups = new Map<string, ParsedAtom[]>();
for (const a of candidates) {
  const key = a.entry || "(no-entry)";
  const list = groups.get(key) ?? [];
  list.push(a);
  groups.set(key, list);
}
const queues = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, list]) => list.slice());
const picked: ParsedAtom[] = [];
const seen = new Set<string>();
while (picked.length < sampleSize && queues.some((q) => q.length)) {
  for (const queue of queues) {
    const a = queue.shift();
    if (!a || seen.has(a.rel)) continue;
    seen.add(a.rel);
    picked.push(a);
    if (picked.length >= sampleSize) break;
  }
}

const handleResolves = async (a: ParsedAtom): Promise<boolean> => {
  if (a.archiveRel) {
    const file = a.archiveRel.split("#")[0]!;
    return existsSync(resolve(ws, file));
  }
  return existsSync(resolve(ws, a.rel));
};

const completeness = (a: ParsedAtom): number => {
  let n = 0;
  if (a.materials.length) n++;
  if (a.userMessages.length) n++;
  if (a.decisions.length) n++;
  if (a.actions.length) n++;
  if (a.summary) n++;
  return n;
};

const rows: Array<{
  rel: string;
  entry: string;
  date: string;
  query: string;
  hit: boolean;
  complete: number;
  evidence: boolean;
  reasons: number;
}> = [];

for (const a of picked) {
  const query = [a.summary, a.decisions[0], a.goal, a.entry].filter(Boolean).join(" ").trim();
  const tokens = tokenize(query);
  const scored = scoreAtoms(all.value.atoms, tokens, {
    config: normalizeConfig({}),
    meta: new Map(),
    todayStr: systemClock.today(),
  });
  const top = scored.slice(0, 8);
  const hit = top.some((s) => s.atom.rel === a.rel);
  const fabricatedReasons = a.decisionEvents.filter((e) => e.reason && !a.body.includes(e.reason)).length;
  rows.push({
    rel: a.rel,
    entry: a.entry,
    date: a.date,
    query,
    hit,
    complete: completeness(a),
    evidence: await handleResolves(a),
    reasons: fabricatedReasons,
  });
}

const hits = rows.filter((r) => r.hit).length;
const evidence = rows.filter((r) => r.evidence).length;
const avgComplete = rows.reduce((n, r) => n + r.complete, 0) / rows.length;
const fabricated = rows.reduce((n, r) => n + r.reasons, 0);
const lines = [
  `# CONTRACT C6 机械基线（${systemClock.today()}）`,
  "",
  `> workspace：\`${ws}\``,
  `> 抽样：${rows.length} 个 Atom（按 entry 分层轮询；排除 entry=shadow 的会话元数据；Atom 级任务代理，不等于完整 Task）`,
  `> 库：${all.value.atoms.length} atoms；读取错误：${all.value.errors.length}`,
  "",
  "## 指标",
  "",
  `- 目标 Atom 进入 Top-8：**${hits}/${rows.length}**（${((hits / rows.length) * 100).toFixed(1)}%）`,
  `- 证据句柄可解析：**${evidence}/${rows.length}**（${((evidence / rows.length) * 100).toFixed(1)}%）`,
  `- 五要素完整度（材料/用户话/决策/动作/摘要，0–5）：**${avgComplete.toFixed(2)} / 5**`,
  `- 原文中不存在的决策理由：**${fabricated}**（必须为 0）`,
  `- 读取错误（loadAllAtoms）：**${all.value.errors.length}**`,
  "",
  "## 逐条",
  "",
  "| # | entry | date | Top-8 | 完整度 | 证据 | 理由编造 |",
  "|---:|---|---|:---:|---:|:---:|---:|",
  ...rows.map((r, i) => `| ${i + 1} | ${r.entry.replace(/\|/g, "\\|")} | ${r.date} | ${r.hit ? "✓" : "✗"} | ${r.complete}/5 | ${r.evidence ? "✓" : "✗"} | ${r.reasons} |`),
  "",
  "## 边界（必须读）",
  "",
  "- 这是**机械基线**：Top-8 命中衡量“给定摘要/决策能否找回源 Atom”，不等于读者能还原完整线索。",
  "- 证据解析只检查句柄指向的文件存在，不判断内容是否支持结论。",
  "- 五要素完整度是结构性计数，不判断表述是否清楚、是否真的回答了“为什么”。",
  "- 语义评分（读者盲测 0/1/2）和 5 类错误注入（假理由/错路径/旧版本/无证据/伪造历史）仍需人工/评审执行；本基线只提供可重复的起点。",
  "",
  "## 复现",
  "",
  "```powershell",
  `node tools/contract-eval.ts --ws="${ws}" --sample=${rows.length} --out="${out}"`,
  "```",
  "",
];
writeFileSync(out, lines.join("\n"));
console.log(`[contract-eval] ${rows.length} sampled · hit ${hits}/${rows.length} · evidence ${evidence}/${rows.length} · completeness ${avgComplete.toFixed(2)}/5 · fabricated ${fabricated}`);
console.log(`[contract-eval] wrote ${out}`);
