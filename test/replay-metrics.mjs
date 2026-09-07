// dsh-shadow —— 第二次 Replay（ADR-0037 五指标）· 真实 v1.1.1 新数据。
// 只读真实 .shadow（默认 WSL OpenAPI-Gateway，可用 SHADOW_REPLAY_ROOT/SHADOW_REPLAY_DATE 覆盖），
// 用 dist/core/episode.js 的量规统计 Episodes/Decisions，并按 ADR-0037 计算 5 指标。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMemory, deriveEpisodes, deriveDecisions, renderEpisodes, renderDecisions } from "../dist/core/episode.js";
import { decisionClass, extractDecisionStatement } from "../dist/core/collect.js";

const ROOT = process.env.SHADOW_REPLAY_ROOT || "//wsl.localhost/debian-u8-1/home/g/project/OpenAPI-Gateway/.shadow";
const DATE = process.env.SHADOW_REPLAY_DATE || "2026-09-07";

const dir = join(ROOT, DATE);
if (process.env.SHADOW_REPLAY_COPY) { /* 留空：此处不再做拷贝 */ }
const names = readdirSync(dir).filter((n) => n.endsWith(".md") && n !== "_index.md");
const parsed = [];
for (const n of names) {
  const rel = `.shadow/${DATE}/${n}`;
  const text = readFileSync(join(dir, n), "utf8");
  try { parsed.push(parseMemory(text, rel, n)); } catch (e) { console.error("parse fail", n, e && e.message); }
}

// ── 聚合与决策派生 ──
const eps = deriveEpisodes(parsed, { gapMinutes: 60 });
const dl = deriveDecisions(parsed);

// ── ①/② 用新分类器做「反事实」判定（旧采集未存决策块，从用户/助手消息反推真值） ──
const CONFIRM = /^(好的?|可以(的)?|行(吧)?|嗯|收到|继续|没问题|[oO][kK]|好的)[，。！!,、\s]*$/;
const decisionsFlat = [];
for (const k of Object.keys(dl.byEntry)) for (const d of dl.byEntry[k]) decisionsFlat.push({ entry: k, ...d });
const capturedSet = new Set(decisionsFlat.map((d) => String(d.statement).trim()));

// 真值（新分类器）：用户消息 → decisionClass(selection/scope/anchor)；助手消息 → extractDecisionStatement
const trueDecisions = [];
for (const p of parsed) {
  for (const l of String(p.body).split("\n")) {
    const um = l.match(/用户：(.*)$/);
    if (um && um[1].trim() && decisionClass(um[1])) trueDecisions.push({ text: um[1].trim(), source: "user" });
    const am = l.match(/我：(.*)$/);
    if (am && am[1].trim()) for (const st of extractDecisionStatement(am[1])) trueDecisions.push({ text: st.trim(), source: "assistant" });
  }
}
const trueDedup = Array.from(new Map(trueDecisions.map((d) => [`${d.source}｜${d.text}`, d])).values());
const trueTexts = trueDedup.map((d) => d.text.trim());
const capturedTrue = trueDedup.filter((d) => capturedSet.has(d.text.trim()) || [...capturedSet].some((c) => c.includes(d.text)));
const recall = trueDedup.length ? capturedTrue.length / trueDedup.length : 0;
const confirmLeak = decisionsFlat.filter((d) => CONFIRM.test(String(d.statement).trim()));
const precision = decisionsFlat.length ? (decisionsFlat.length - confirmLeak.length) / decisionsFlat.length : 0;
const missed = trueDedup.filter((d) => !capturedSet.has(d.text.trim()) && ![...capturedSet].some((c) => c.includes(d.text)));

// ── ③ Reason Coverage ──
const withReason = decisionsFlat.filter((d) => d.reason && d.reason !== "未明确").length;
const reasonCoverage = decisionsFlat.length ? (withReason / decisionsFlat.length) : 0;

// ── ④ Source Traceability：每个 Decision 都能回到 rel + source ──
const traceable = decisionsFlat.filter((d) => d.rel && d.source).length;
const sourceTraceability = decisionsFlat.length ? traceable / decisionsFlat.length : 0;

// ── ⑤ Task Replay Completeness：按 Goal/Observation/Evidence/Decision/Reason/Action/Result 断点 ──
const goal = parsed.find((p) => p.goal)?.goal || "";
const observations = parsed.reduce((s, p) => s + (p.thinkLines.filter((l) => !/^我：/.test(l)).length), 0);
const evidences = parsed.reduce((s, p) => s + p.materials.length, 0);
const acts = parsed.reduce((s, p) => s + p.actions.length, 0);
const results = parsed.filter((p) => /\.\.\.|结论|是|同步编排|活跃/.test(p.thinkLines.join(" ") || "")).length;

console.log("=== 第二次 Replay · ADR-0037 五指标 ===");
console.log(`根: ${ROOT} · 日期: ${DATE} · 记忆原子: ${parsed.length}`);
console.log(`\n[派生] Episode(gap=60): ${eps.length} 个 · Decision: ${dl.count} 条`);
console.log(`\n—— ADR-0037 五指标 ——`);
console.log(`① Decision Precision : 被标记决策 ${decisionsFlat.length} 条，Confirmation 泄漏 ${confirmLeak.length} 条 → Precision=${(precision * 100).toFixed(1)}%`);
console.log(`② Decision Recall    : 反事实真值 ${trueDedup.length} 条（用户+助手），被捕获 ${capturedTrue.length} 条 → Recall=${(recall * 100).toFixed(1)}%`);
if (missed.length) console.log(`                        未捕获（新分类器可识别，但旧采集丢失）：${missed.map((d) => `「${d.text}」〔${d.source}〕`).join("、")}`);
console.log(`③ Reason Coverage    : ${withReason}/${decisionsFlat.length} = ${(reasonCoverage * 100).toFixed(1)}%${decisionsFlat.length ? "" : "（无决策，未定义）"}`);
console.log(`④ Source Traceability: ${traceable}/${decisionsFlat.length} = ${(sourceTraceability * 100).toFixed(1)}% (rel+source 均可追溯)`);
console.log(`⑤ Task Replay 断点   : Goal=${goal ? goal.slice(0, 30) : "缺失"} · Observation=${observations} · Evidence=${evidences} · Decision=${decisionsFlat.length} · Reason=${withReason} · Action=${acts} · Result≈${results}`);

console.log(`\n—— Episode 视图(前 2500 字) ——`);
console.log(renderEpisodes(eps).slice(0, 2500));
console.log(`\n—— Decision Lineage ——`);
console.log(renderDecisions(dl));

console.log("\n=== 结论 ===");
if (decisionsFlat.length === 0) {
  console.log("本批数据 0 决策。原因：该 session 为纯探索（读 IO 文档/跑 bash/理解结构），未发生明确 Decision。");
  console.log("→ 这不是 v1.1.1 漏捕获，而是『没有决策可捕获』（如实、不补写）。");
  console.log("→ 要测试 Decision Capture 的 Recall/Precision，需要一段『实际做出删除/保留/采用等决定』的真实工作数据。");
} else {
  console.log(`本批数据捕获 ${decisionsFlat.length} 条决策。Precision ${confirmLeak.length === 0 ? "高(无 Confirmation 泄漏)" : "有泄漏"}；Reason Coverage ${(reasonCoverage * 100).toFixed(1)}%；Source Traceability ${(sourceTraceability * 100).toFixed(1)}%。`);
}
