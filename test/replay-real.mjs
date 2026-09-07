// dsh-shadow —— Shadow Replay + Episode/Decision Lineage 真实数据回放。
// 读真实 .shadow（默认 OpenAPI-Gateway 的 WSL 路径，可用 SHADOW_REPLAY_ROOT 覆盖），
// 用 dist/core/episode.js 的派生逻辑做回放。
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseMemory, deriveEpisodes, deriveDecisions, renderEpisodes, renderDecisions } from "../dist/core/episode.js";

const ROOT = process.env.SHADOW_REPLAY_ROOT || "//wsl.localhost/debian-u8-1/home/g/project/OpenAPI-Gateway/.shadow";
const DATE = process.env.SHADOW_REPLAY_DATE || "2026-09-07";

const dir = join(ROOT, DATE);
const names = readdirSync(dir).filter((n) => n.endsWith(".md") && n !== "_index.md");
const parsed = [];
for (const n of names) {
  const rel = `.shadow/${DATE}/${n}`;
  const text = readFileSync(join(dir, n), "utf8");
  try { parsed.push(parseMemory(text, rel, n)); } catch (e) { console.error("parse fail", n, e && e.message); }
}

// 属性统计
const withDec = parsed.filter((p) => p.decisions.length > 0);
const withMat = parsed.filter((p) => p.materials.length > 0);
const withEntry = parsed.filter((p) => p.entry && p.entry !== "shadow");
const totalActions = parsed.reduce((s, p) => s + p.actions.length, 0);
const totalDecs = parsed.reduce((s, p) => s + p.decisions.length, 0);
const totalThink = parsed.reduce((s, p) => s + p.thinkLines.length, 0);

console.log("=== 真实数据回放 · OpenAPI-Gateway/.shadow ===");
console.log(`记忆原子: ${parsed.length}`);
console.log(`含决策的记忆: ${withDec.length}（占总 ${(withDec.length / parsed.length * 100).toFixed(1)}%）`);
console.log(`含背景/材料的记忆: ${withMat.length}`);
console.log(`非默认入口(entry!=shadow)的记忆: ${withEntry.length}`);
console.log(`动作行总数: ${totalActions} / 思维/结论行总数: ${totalThink} / 决策行总数: ${totalDecs}`);

// 派生 Episode（默认 60min）
const ep60 = deriveEpisodes(parsed, { gapMinutes: 60 });
const ep30 = deriveEpisodes(parsed, { gapMinutes: 30 });
const ep5 = deriveEpisodes(parsed, { gapMinutes: 5 });
console.log(`\n=== Episode 派生 ===`);
console.log(`gapMinutes=60 → ${ep60.length} 个 Episode`);
console.log(`gapMinutes=30 → ${ep30.length} 个 Episode`);
console.log(`gapMinutes=5  → ${ep5.length} 个 Episode`);
const longest = [...ep60].sort((a, b) => b.memoryCount - a.memoryCount).slice(0, 5);
console.log(`\n--- 最大的 5 个 Episode(60min) ---`);
for (const e of longest) {
  console.log(`· ${e.title} │ ${e.memoryCount}条 │ ${e.decisions.length}决策 │ ${e.actions.length}动作 │ ${e.startedAt.slice(5,16)}–${e.endedAt.slice(5,16)}`);
}

// 决策血缘：总数 + 按入口
const dl = deriveDecisions(parsed);
console.log(`\n=== Decision Lineage ===`);
console.log(`决策总数: ${dl.count}`);
const entries = Object.keys(dl.byEntry);
console.log(`涉及入口: ${entries.length} 个`);
for (const e of entries.slice(0, 12)) console.log(`· ${e} → ${dl.byEntry[e].length} 条决策`);
if (dl.count === 0) console.log("（0 决策：真实数据未采集到决策——用户拍板未分类 / 无 goal 事件 / 正文无『决定』行）");

// Todo 任务回放：只看命中 Todo 的 Episode + 决策
console.log(`\n=== 任务回放：Todo 通道彻底删除 ===`);
const todoEp = ep60.filter((e) => [e.title, e.objective, ...e.entries, ...e.materials, ...e.decisions.map((d) => d.text), ...e.actions.map((a) => a.text)].join(" ").toLowerCase().includes("todo"));
console.log(`命中 Todo 的 Episode: ${todoEp.length} 个`);
for (const e of todoEp.slice(0, 4)) {
  console.log(`\nEpisode: ${e.title} │ ${e.memoryCount}条 │ ${e.decisions.length}决策 │ ${e.actions.length}动作`);
  if (e.decisions.length) for (const d of e.decisions.slice(0, 8)) console.log(`   决策: ${d.text}`);
  console.log(`   入口: ${e.entries.slice(0, 8).join("、")}`);
  console.log(`   动作: ${e.actions.slice(0, 8).map((a) => a.text).join(" | ")}`);
}

// 渲染样例
console.log(`\n=== 渲染样例(前 3000 字) ===`);
console.log(renderEpisodes(ep60).slice(0, 3000));
