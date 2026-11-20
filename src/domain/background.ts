/**
 * v3 domain — 大背景组装（纯函数）：未来一句 → 频率相近的「背景包」。
 * 把 query 命中的点**归并成线**、抽出相关**决策/否决**、附**口味**与**证据句柄**——
 * 比"只回检索点"更进一步：给的是"这件事的大背景"，不是零散条目。仅派生视图，不改记忆。
 */
import type { ParsedAtom } from "../contract/types.js";
import { searchTerms } from "./bm25.js";
import { classifyTurn } from "./turn.js";
import { evidencePathsOf } from "./text.js";

export interface BackgroundGroup {
  rel: string;
  count: number;
  from?: string;
  to?: string;
  samples: string[];
}
export interface BackgroundResult {
  topic: string;
  matched: number;
  groups: BackgroundGroup[];
  decisions: string[];
  /** 信息（事实/材料/约束）：背景不止决策，还有"当时是什么样/引用了什么"。 */
  info: string[];
  taste?: { prefer: string[]; avoid: string[] };
  /** 种子节点 rel（关系网的键；与 graph 边一致）。 */
  evidence: string[];
  /** 证据句柄（展示用；归档项为 archiveRel）。 */
  handles: string[];
}

const userLines = (body: string): string[] =>
  body
    .split("\n")
    .map((l) => {
      const m = /^-\s*\[[^\]]*\]\s*\[[^\]]*\]\s*(.*)$/.exec(l.trim());
      const t = (m ? m[1]! : l).trim();
      return /^用户：/.test(t) ? t.replace(/^用户：/, "").trim() : "";
    })
    .filter(Boolean);

export const buildBackground = (
  atoms: ParsedAtom[],
  topic: string,
  taste?: { prefer: string[]; avoid: string[] },
  limit = 12,
): BackgroundResult => {
  // 匹配前先归一：去疑问/停用词 + 少量同义（偏好≈喜欢），降低假阳、补典型同义。
  const STOP = /(怎么样|怎么|什么|如何|为什么|哪个|哪些|多少|吗|呢|吧|帮我|请|推荐|一下|一点|有点|今天|明天|天气)/g;
  const SYN: [RegExp, string][] = [[/偏好|偏爱/g, "喜欢"]];
  let matchTopic = topic.replace(STOP, " ");
  for (const [re, to] of SYN) matchTopic = matchTopic.replace(re, to);
  matchTopic = matchTopic.trim() || topic;
  const toks = searchTerms(matchTopic);
  if (!toks.length) return { topic, matched: 0, groups: [], decisions: [], info: [], taste, evidence: [], handles: [] };
  // 字符级近似（罕见汉字 IDF）：补"吸气停一秒"↔"吸6/停1/呼4"这类词面不同、但共享关键字的远同义。
  const CJK = /[\u4e00-\u9fff]/;
  const N = atoms.length || 1;
  const df = new Map<string, number>();
  for (const a of atoms) {
    const set = new Set([...userLines(a.body).join("")].filter((c) => CJK.test(c)));
    for (const c of set) df.set(c, (df.get(c) ?? 0) + 1);
  }
  const rareChars = [...new Set([...matchTopic].filter((c) => CJK.test(c)))].filter((c) => (df.get(c) ?? 0) / N <= 0.15);
  const scored = atoms
    .map((a) => {
      // 只按「用户原话行」打分：避免我方 goal/analysis 元文本把真决策挤下去。
      const b = userLines(a.body).join(" ").toLowerCase();
      let gram = 0;
      for (const t of toks) if (b.includes(t)) gram++;
      let ch = 0;
      for (const c of rareChars) if (b.includes(c)) ch++;
      // 至少 4 个罕见字命中才算字符级有效（收紧假阳；远同义通常仍够）。
      const s = gram * 2 + (ch >= 4 ? ch : 0);
      return { a, s };
    })
    .filter((x) => x.s > 0)
    .sort((x, y) => y.s - x.s);
  const top = scored.slice(0, limit).map((x) => x.a);
  const gMap = new Map<string, BackgroundGroup>();
  for (const a of top) {
    const key = a.rel.split("#")[0]!;
    const g = gMap.get(key) ?? { rel: key, count: 0, samples: [] };
    g.count++;
    const tm = `${a.date}${a.time ? " " + String(a.time) : ""}`;
    if (!g.from || tm < g.from) g.from = tm;
    if (!g.to || tm > g.to) g.to = tm;
    const sm = (a.summary || userLines(a.body)[0] || "").slice(0, 80);
    if (sm && g.samples.length < 3) g.samples.push(sm);
    gMap.set(key, g);
  }
  const ACK_DEC = /^(都做|同意|可以|好的?|好|行|要|收到|明白|了解|定稿|收尾|重启完成|重启了|就是这样|做上面|更新到本地|修复|剩余什么|不用|是的?|对|没有|有)[。！!，,、\s]*$/;
  const META_DEC = /(goal_round|Objective:|我找到了|人类不会|在 dsh-shadow 插件中落地|只读任务|只读核验|新问题：)/;
  const okDec = (d: string): boolean => d.length >= 3 && !ACK_DEC.test(d) && !META_DEC.test(d);
  const isQuestion = (s: string): boolean => /[？?]\s*$/.test(s) || /^(为什么|怎么|如何|是否|什么|哪|多少|能不能|可不可以|决策和.+有区别吗)/.test(s);
  const decisions: string[] = [];
  const seen = new Set<string>();
  for (const a of top) {
    // 优先用 decisionEvents（带 reason）；无 reason 的再退回 decisions 文本，按 statement 去重。
    for (const ev of a.decisionEvents ?? []) {
      const st = ev.statement.trim();
      if (!okDec(st) || isQuestion(st) || seen.has(st)) continue;
      seen.add(st);
      decisions.push(ev.reason ? `${st}（理由：${ev.reason.slice(0, 80)}）` : st);
    }
    for (const d of a.decisions ?? []) if (okDec(d) && !isQuestion(d) && !seen.has(d)) { seen.add(d); decisions.push(d); }
    for (const u of userLines(a.body)) if (classifyTurn(u) === "decision" && okDec(u) && !isQuestion(u) && !seen.has(u)) { seen.add(u); decisions.push(u); }
  }
  // 信息（事实/材料/约束）：材料引用 + 背景型原话（描述现状/不一致/来源），与决策并列进"大背景"。
  // 去重按"裸文本"（去掉 `信息：` 前缀），避免同一句被原话与 info 各推一次。
  const info: string[] = [];
  const seenInfo = new Set<string>();
  const seenMat = new Set<string>();
  const bare = (s: string): string => s.replace(/^信息：/, "").trim();
  const addInfo = (s: string, prefix = false): void => {
    const b = bare(s);
    if (!b || isQuestion(b) || seenInfo.has(b)) return;
    seenInfo.add(b);
    info.push((prefix ? "信息：" : "") + b.slice(0, 200));
  };
  for (const a of top) {
    // 材料：显式 materials + 用户原话里出现的路径（仅补背景信息，不写回 ParsedAtom.materials，避免污染材料卡）。
    const userPaths = userLines(a.body).flatMap((u) => evidencePathsOf(u))
      .map((p) => p.replace(/\\/g, "/"))
      .filter((p) => p.length >= 3 && !p.startsWith(".shadow"));
    for (const m of [...(a.materials ?? []), ...userPaths].slice(0, 6)) {
      const p = m.replace(/\\/g, "/");
      // 只收相对、无反斜杠穿越的路径；绝对路径/.. 不进"相关信息"。
      if (!p || /^([A-Za-z]:|\/)/.test(p) || p.split("/").includes("..")) continue;
      if (seenMat.has(p)) continue;
      seenMat.add(p);
      addInfo(`材料：${p}`);
    }
    for (const u of userLines(a.body)) {
      if (classifyTurn(u) === "background") addInfo(u);
    }
    for (const s of a.info ?? []) addInfo(s, true);
  }
  return {
    topic,
    matched: scored.length,
    groups: [...gMap.values()].sort((x, y) => y.count - x.count),
    decisions: decisions.slice(0, 12),
    info: info.slice(0, 12),
    taste,
    evidence: top.map((a) => a.rel),
    handles: top.map((a) => a.archiveRel ?? a.rel),
  };
};
