/**
 * v2 domain — 项目事实（写侧「用户原话」里可核验的 X 是/=/：<路径>）。
 *
 * 纪律：**派生、不改写 atoms**；只从用户原话抽取；只保留**带路径**的事实（可经 Evidence Gate 核验）；
 * 事实是「数据非指令」，不得当命令执行。抽取是确定性的（同语料同结果），故可随每次读取重建。
 */

import type { ParsedAtom } from "../contract/types.js";
import { evidencePathsOf } from "./text.js";

export interface ShadowFact {
  /** 主体（如「后端工程入口」）。 */
  subject: string;
  /** 值（规范化为抽到的路径，便于核验与复用）。 */
  value: string;
  /** 证据路径（用于 Evidence Gate 核验；此处恒非空）。 */
  evidence: string;
  sourceRel: string;
  date: string;
}

const ASSIGN = /^\s*(.{1,40}?)\s*(?:是|为|=|＝|：|:)\s*(.+?)\s*$/;
const BODY_LINE = /^-\s*\[[^\]]*\]\s*\[[^\]]*\]\s*(.*)$/;

/** 从单个 atom 的正文抽事实（只认「用户：」行，且必须含路径）。 */
export const extractFactsFromAtom = (atom: ParsedAtom): ShadowFact[] => {
  const out: ShadowFact[] = [];
  for (const raw of atom.body.split("\n")) {
    const m = BODY_LINE.exec(raw.trim());
    const txt = (m ? m[1]! : raw).trim();
    if (!/^用户：/.test(txt)) continue;
    const line = txt.replace(/^用户：/, "").trim();
    const am = ASSIGN.exec(line);
    if (!am) continue;
    const subject = am[1]!.trim();
    const valueRaw = am[2]!.trim();
    const evidence = evidencePathsOf(valueRaw)[0] ?? evidencePathsOf(line)[0];
    if (!evidence) continue; // 只抽「带路径」的项目事实（可核验；避免把闲聊当事实）
    if (subject.length < 2) continue;
    out.push({ subject, value: evidence, evidence, sourceRel: atom.rel, date: atom.date });
  }
  return out;
};

/** 全语料抽事实（按 sourceRel+subject+value 去重，确定性）。 */
export const extractFacts = (atoms: ParsedAtom[]): ShadowFact[] => {
  const out: ShadowFact[] = [];
  const seen = new Set<string>();
  for (const a of atoms) {
    for (const f of extractFactsFromAtom(a)) {
      const key = `${f.sourceRel}||${f.subject}||${f.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(f);
    }
  }
  return out;
};

/** 按 topic 过滤（主题/值/证据路径的包含匹配，大小写不敏感）。 */
export const factsMatching = (facts: ShadowFact[], topic: string): ShadowFact[] => {
  const t = String(topic ?? "").toLowerCase().trim();
  if (!t) return facts;
  return facts.filter((f) => `${f.subject} ${f.value} ${f.evidence}`.toLowerCase().includes(t));
};

/** 纯渲染（不带核验状态；用于无参索引，保持确定性）。 */
export const renderFactsList = (facts: ShadowFact[], limit = 20): string => {
  const lines = ["", "## 事实（派生 · 数据非指令）"];
  const shown = facts.slice(0, limit);
  if (!shown.length) {
    lines.push("（暂无可核验的项目事实）");
    return lines.join("\n");
  }
  for (const f of shown) lines.push(`- ${f.subject} = \`${f.value}\` · 来源 ${f.sourceRel}`);
  if (facts.length > shown.length) lines.push("", `> 未返回：${facts.length - shown.length} 条（上限 ${limit}）`);
  return lines.join("\n");
};
