/**
 * v2 engine — 预算与信封。所有读 handler 共用一份，禁止各写一遍。
 */

import { RECALL_PREFIX, scrubFinal } from "../../domain/text.js";
import { tierFor } from "../../domain/rank.js";
import type { ParsedAtom } from "../../contract/types.js";

export interface EnvelopeInput {
  body: string;
  prefix?: string;
  signals?: string;
  matched?: number;
  returned?: number;
  dropped?: number;
  droppedExamples?: string[];
  next?: string;
}

export const envelope = (input: EnvelopeInput): string => {
  const parts: string[] = [input.prefix ?? RECALL_PREFIX, input.body];
  if ((input.dropped ?? 0) > 0) {
    const m = input.matched ?? 0;
    const r = input.returned ?? 0;
    parts.push("");
    parts.push(`> 未返回的命中：${input.dropped} 条（命中 ${m} · 本次返回 ${r}）`);
    if (input.droppedExamples?.length) parts.push(`> 未返回示例：${input.droppedExamples.slice(0, 5).join("、")}`);
    parts.push(`> 下一步：${input.next ?? "提高 max_tokens 或收窄 topic 后再查。"}`);
  }
  parts.push(input.signals ?? "");
  return scrubFinal(parts.join("\n"));
};

/** 对非召回类长输出做统一预算截断；必须自报。 */
export const budgetText = (text: string, maxChars: number): string => {
  const s = String(text ?? "");
  if (s.length <= maxChars) return s;
  const keep = Math.max(0, maxChars - 120);
  return `${s.slice(0, keep)}\n\n> 截断：原文 ${s.length} 字，已返回 ${keep} 字（预算 ${maxChars} 字）。\n> 下一步：提高 max_tokens，或用更窄的 topic / mode 再查。`;
};

export const atomDisplay = (atom: ParsedAtom): string =>
  `[${atom.rel}] ${atom.entry || "(无入口)"}`;

export const renderAtomEntry = (atom: ParsedAtom, score: number, tokens: string[], snippet: string): string => {
  const tier = tierFor(atom.body);
  const head = `- ${atomDisplay(atom)} · 相关度 ${score} · ${tier}`;
  const sum = atom.summary ? `\n  > 摘要：${atom.summary.slice(0, 120)}` : "";
  const snip = snippet ? `\n  > 命中：${snippet}` : "";
  const skeleton = tier === "L2" && !snippet ? `\n  > 正文：${atom.body.split("\n").filter((l) => l.trim() && !/^[#>]/.test(l)).slice(0, 2).join(" / ").slice(0, 160)}` : "";
  return `${head}${sum}${snip}${skeleton}`;
};
