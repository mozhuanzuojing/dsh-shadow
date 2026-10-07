// dsh-shadow —— core/view/experience.ts：Experience 领域对象（从记忆文本派生）。从 index.ts 迁出。纯解析。
import { clueFieldsOf, clueFieldOf, clueHeaderOf } from "./clue.js";

export const experienceOf = (text: string, mm: any) => {
  const body = String(text || "");
  const m = (re: RegExp) => (body.match(re) || [])[1] || "";
  // **B8 收一处（第 5 个消费者）**：**线索头家族**一律走 `core/view/clue.ts` —— 本文件此前自己写了一遍
  // `证据链` / `证据(...)` / `背景/材料` / `项目` / `目标` / `来源会话` 的正则，是 B8 清单之外的同一处漏项
  //（改一次记忆头格式要扫多处）。
  const f = clueFieldsOf(body);
  // ⚠ **有意与 `ClueFields.evidenceRaw` 不同：这里 `evidence` 不回落「背景/材料」**。
  //   理由：下一行的 `implementation: evidence || materials` **已经**承担了「证据，无则回落材料」的语义；
  //   若 `evidence` 也回落，二者恒等，Experience 的「实现依据（来自证据链）」与「背景材料」分野当场消失
  //  （`renderExperience` 的 `实现` 与 `问题` 会变成同一句）。`evidenceRaw` 服务的是
  //   `subject/observer/arbitrate.ts` 的单串截断展示，那里**需要**回落值。
  //   ⇒ 不为此给 `clue.ts` 加开关：只有这一个消费者要「不回落」，加可选参数属投机 API。
  const evidence = clueFieldOf(clueHeaderOf(body, "证据链"), "证据");
  const materials = clueHeaderOf(body, "背景/材料");   // 顺带消掉原先本行与 :14 的**两次**同形求值
  // v1.15.5 修正：决策读**现行** `> 决策：` 字段（此前读旧格式 `> 用户提示/决策：` 的提示头，
  // 等于把任意用户消息当决策）。并剥离 `〔source〕` 标记——与 core/view/episode.ts 的 ① 同一口径。
  // ⚠ `> 决策：` **不在**线索头家族的标签表里（`clue.ts` 的 `decision` 指的是**旧**格式
  //   `> 用户提示/决策：`）⇒ 这一条保持本地解析，别顺手换成 `f.decision`。
  const decision = m(/^> 决策：(.+)$/m).replace(/^〔[^\]]+〕/, "").trim();
  return {
    situation: (body.match(/^# (.+)$/m) || [])[1] || "",
    problem: materials,
    decision,
    implementation: evidence || materials,
    evidence,
    // Summary ≠ Lesson（ADR-0003 §3-1）：summary = 真正的「摘要」（LLM 一句话回顾）；
    // overview = 概况（动作/消息/决策计数）；lesson 由裁决层派生，不复用摘要。
    // 这两个标签也不在线索头家族里（属 Experience/Episode 概览头）⇒ 保持本地解析。
    summary: m(/^> 摘要：(.+)$/m),
    overview: m(/^> 概况：(.+)$/m),
    session: f.session,
    project: f.project,
    goal: f.goal,
    date: mm?.date || "",
  };
};

export const renderExperience = (e: any) => {
  const lines = [`[Experience] ${e.situation}`];
  if (e.problem) lines.push(`问题 ${e.problem}`);
  if (e.decision) lines.push(`决策 ${e.decision}`);
  if (e.implementation) lines.push(`实现 ${e.implementation}`);
  if (e.evidence) lines.push(`证据 ${e.evidence}`);
  if (e.verdict) lines.push(`裁决 ${e.verdict}`);
  if (e.outcome) lines.push(`结果 ${e.outcome}`);
  if (e.overview) lines.push(`概况 ${e.overview}`);
  if (e.summary) lines.push(`摘要 ${e.summary}`);
  if (e.reflection) lines.push(`反思 ${e.reflection}`);
  if (e.lesson) lines.push(`教训 ${e.lesson}`);
  if (e.project) lines.push(`项目 ${e.project}`);
  if (e.goal) lines.push(`目标 ${e.goal}`);
  return lines.join("\n");
};
