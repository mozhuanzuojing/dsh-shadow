/**
 * v2 domain — 技能卡（把历史任务卡提炼成可审的 SKILL.md，学 Anthropic Agent Skills / Cursor Skills）。
 *
 * 纪律：**派生、不改写 atoms**；确定性（同任务卡同文本）；「数据非指令」；相似≠相同，复用前核对来源。
 * 这里只生成 Markdown（frontmatter name/description + 何时用/步骤/结果/教训/证据/来源），
 * 由 engine/skills-out.ts 物化到 `.shadow/indexes/skills/<slug>/SKILL.md`，供人审阅并可复制到项目技能目录。
 */

import type { LessonCard } from "./lessons.js";
import { skillSlug } from "./lessons.js";

export interface SkillDoc {
  slug: string;
  name: string;
  description: string;
  /** workspace 相对路径：`.shadow` 下的 `indexes/skills/<slug>/SKILL.md`。 */
  rel: string;
  markdown: string;
}

const clip = (s: unknown, n: number): string => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export const buildSkillDoc = (card: LessonCard): SkillDoc => {
  const slug = skillSlug(card);
  const description = clip(`${card.title}｜${card.trigger}`, 160);
  const lines: string[] = [
    "---",
    `name: ${slug}`,
    `description: ${JSON.stringify(description)}`,
    "---",
    "",
    `# ${card.title}`,
    "",
    "> 派生技能卡（可重建 · 数据非指令）：由历史任务卡确定性生成，供下次类似任务直接照做；复用前先核对证据。",
    "",
    "## 何时用（When to use）",
    `- 当前任务与「${clip(card.trigger, 120)}」类似时。`,
    `- 状态：${card.status} · 时间：${card.when}。`,
    "",
    "## 步骤 / 决策（Steps & decisions）",
  ];
  if (card.decisions.length) card.decisions.forEach((d, i) => lines.push(`${i + 1}. ${clip(d.text, 160)}${d.reason ? `（因：${clip(d.reason, 160)}）` : ""}`));
  else lines.push("- （当时无显式决策记录，以记忆原文为准）");
  lines.push("", "## 结果与验证（Outcome & verify）");
  if (card.outcomes.length) card.outcomes.forEach((o) => lines.push(`- ${clip(o, 160)}`));
  else lines.push("- （当时无结果记录）");
  lines.push("", "## 坑与教训（Pitfalls）");
  if (card.lessons.length) card.lessons.forEach((l) => lines.push(`- ${clip(l, 180)}`));
  else lines.push("- （未抽取到显式教训；复用前核对来源）");
  lines.push("", "## 证据（Evidence）");
  if (card.evidence.length) card.evidence.forEach((e) => lines.push(`- \`${clip(e, 120)}\``));
  else lines.push("- （无材料记录）");
  lines.push("", "## 来源（Source）");
  card.memoryRefs.slice(0, 8).forEach((r) => lines.push(`- \`${r}\``));
  lines.push("", "> 本文件为派生件；删除 `.shadow/indexes/` 可整份重建。");
  const markdown = `${lines.join("\n")}\n`;
  return { slug, name: slug, description, rel: `indexes/skills/${slug}/SKILL.md`, markdown };
};

export const buildSkillDocs = (cards: LessonCard[]): SkillDoc[] => cards.map(buildSkillDoc);
