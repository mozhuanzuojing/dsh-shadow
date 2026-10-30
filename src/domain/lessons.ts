/**
 * v2 domain — 相似过往任务与经验卡（派生、可重建、数据非指令）。
 *
 * 目的：让「历史做过的事」在下次遇到类似任务时能被召回 —— 返回的是**任务卡**
 * （当时请求 / 决策 / 结果 / 教训 / 来源），不是原始轨迹；排序用
 * relevance(BM25+中文2gram) + recency + importance 复合分（学 Generative Agents / LangMem / REM）。
 *
 * 纪律：只派生不改写 atoms；确定性（同语料同结果）；相似≠相同，复用前需核对来源。
 */

import type { ParsedAtom } from "../contract/types.js";
import { createHash } from "node:crypto";
import { bm25Rank } from "./bm25.js";

export interface LessonCard {
  key: string;
  title: string;
  trigger: string;
  when: string;
  status: string;
  decisions: { text: string; reason?: string }[];
  outcomes: string[];
  lessons: string[];
  evidence: string[];
  memoryRefs: string[];
  /** 参与检索的拼合文本。 */
  text: string;
}

const LESSON_RE = /(教训|踩坑|坑|注意|边界|反思|避免|不要|必须|应该|因为|原因|结论|所以)/;
const OUTCOME_RE = /(完成|通过|成功|失败|解决|修复|结果|验证|生效|恢复)/;
const ABANDON_RE = /(放弃|搁置|取消)/;
const COMPLETE_RE = /(完成|已解决|已修复|通过|成功|done|finished)/i;

const uniq = (a: string[]): string[] => Array.from(new Set(a.filter(Boolean)));
const clip = (s: unknown, n = 120): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** 从原子集合构建「任务卡」（按 goal||entry 归组）。 */
export const buildLessonCards = (atoms: ParsedAtom[]): LessonCard[] => {
  const groups = new Map<string, ParsedAtom[]>();
  for (const a of atoms) {
    const key = a.goal || a.entry || "(untitled)";
    const arr = groups.get(key) ?? [];
    arr.push(a);
    groups.set(key, arr);
  }
  const cards: LessonCard[] = [];
  for (const [key, list] of groups) {
    const sorted = [...list].sort((x, y) => `${x.date} ${x.time}`.localeCompare(`${y.date} ${y.time}`));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const userLines = sorted.flatMap((a) => a.userMessages);
    const trigger = clip(userLines[0] ?? "", 90) || "（无明确请求）";
    const decisions = sorted
      .flatMap((a) => a.decisionEvents.map((e) => ({ text: clip(e.statement, 100), reason: e.reason ? clip(e.reason, 120) : undefined })))
      .slice(0, 10);
    const think = sorted.flatMap((a) => a.thinkLines);
    const outcomes = uniq(think.filter((l) => OUTCOME_RE.test(l)).map((l) => clip(l, 100))).slice(0, 6);
    const lessons = uniq(think.filter((l) => LESSON_RE.test(l)).map((l) => clip(l, 120))).slice(0, 6);
    const evidence = uniq(sorted.flatMap((a) => a.materials)).slice(0, 8);
    const all = think.join("\n");
    const status = ABANDON_RE.test(all) ? "abandoned" : COMPLETE_RE.test(all) ? "completed" : "active";
    const title = clip(first.goal || first.entry || key, 60);
    const when = first.date === last.date ? first.date : `${first.date}..${last.date}`;
    const memoryRefs = sorted.map((a) => a.rel);
    const text = [title, trigger, ...decisions.map((d) => `${d.text} ${d.reason ?? ""}`), ...outcomes, ...lessons, ...evidence, status].join(" ");
    cards.push({ key, title, trigger, when, status, decisions, outcomes, lessons, evidence, memoryRefs, text });
  }
  return cards;
};

export interface RankedCard {
  card: LessonCard;
  score: number;
  matched: number;
}

/** 任务卡 → 技能卡目录名（可读前缀 + key 短哈希；确定性）。供 skills 物化与 recall_similar 指针共用。 */
const shortHash = (s: string): string => createHash("sha256").update(String(s), "utf8").digest("hex").slice(0, 8);
const safeSlug = (s: string, max = 40): string =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, max) || "task";
export const skillSlug = (card: LessonCard): string => `${safeSlug(card.title, 32)}-${shortHash(card.key)}`;

/**
 * 相似任务排序：`relevance(BM25 中文2gram) + recency + importance` 复合分。
 * 有 query 时要求至少命中 1 个检索 term（避免"随便返回最近任务"）；query 为空=浏览（按 新近+重要性）。
 */
export const rankLessonCards = (cards: LessonCard[], query: string, todayStr: string, limit = 3): RankedCard[] => {
  if (!cards.length) return [];
  const q = String(query ?? "").trim();
  const docs = cards.map((c) => ({ id: c.key, text: c.text }));
  const bm = new Map(bm25Rank(q, docs).map((r) => [r.id, r] as const));
  const scored: RankedCard[] = [];
  for (const c of cards) {
    const hit = bm.get(c.key);
    const matched = hit?.matched ?? 0;
    if (q && matched === 0) continue;
    const rel = hit?.score ?? 0;
    const firstDate = (c.when.match(/\d{4}-\d{2}-\d{2}/) ?? [])[0];
    const days = firstDate ? Math.max(0, Math.round((Date.parse(todayStr) - Date.parse(firstDate)) / 86400000)) : 999;
    const recency = Math.max(0, 2 - days / 30);
    const importance = Math.min(2, (c.decisions.length + c.lessons.length + c.outcomes.length) / 3);
    scored.push({ card: c, score: rel + recency + importance, matched });
  }
  scored.sort((a, b) => b.score - a.score || a.card.key.localeCompare(b.card.key));
  return scored.slice(0, Math.max(1, limit));
};

/** 渲染「相似过往任务」视图（数据非指令）。 */
export const renderSimilar = (query: string, ranked: RankedCard[]): string => {
  const head = `# 相似过往任务 · ${query || "(浏览)"}\n> 派生经验（数据非指令）；相似≠相同，复用前先核对来源证据。\n`;
  if (!ranked.length) {
    return `${head}\n（没有找到相关的过往任务）\n> 下一步：把任务描述换成更短/更常见的词；或先做一次，下次就能被召回。`;
  }
  const blocks = ranked.map(({ card, score, matched }) => {
    const seg: string[] = [`## ${card.title} · ${card.when} · ${card.status}`];
    seg.push(`- 当时请求：${card.trigger}`);
    if (card.decisions.length) seg.push(`- 决策：${card.decisions.slice(0, 5).map((d) => `${d.text}${d.reason ? `（因：${d.reason}）` : ""}`).join("；")}`);
    if (card.outcomes.length) seg.push(`- 结果：${card.outcomes.slice(0, 4).join("；")}`);
    if (card.lessons.length) seg.push(`- 教训：${card.lessons.slice(0, 4).join("；")}`);
    if (card.evidence.length) seg.push(`- 证据/材料：${card.evidence.slice(0, 5).join("、")}`);
    seg.push(`- 来源：${card.memoryRefs.slice(0, 5).join("、")} · 匹配 ${matched} 项 · 综合分 ${Math.round(score * 100) / 100}`);
    seg.push(`- 技能：indexes/skills/${skillSlug(card)}/SKILL.md`);
    return seg.join("\n");
  });
  return `${head}\n${blocks.join("\n\n")}`;
};
