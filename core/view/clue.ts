// dsh-shadow —— core/view/clue.ts：记忆正文「线索头」字段的**唯一一份**解析（判据收一处）。
//
// ## 为什么要有它
//
// `core/retention/memory.ts` 写出的线索头是**一组**（唯一一份写出方）：
//   `> 证据链：来源(…) · 日期(…) · 证据(…)`、`> 背景/材料：…`、`> 用户提示/决策：…`、
//   `> 项目：…`、`> 目标：…`、`> 来源会话：…`
// 而读者**各写一份正则**：`evidence/paths.ts`（证据链 + 背景/材料）、
// `subject/observer/arbitrate.ts`（来源/日期/证据 + 项目/目标/来源会话）、
// `retrieval/render.ts`（背景/材料、用户提示/决策）、`tools/granularity.lib.ts`（来源、背景/材料、任意字段）。
// ⇒ 改一次记忆头格式要扫 4 处；且**已经出现口径差异**：`arbitrate` 取「证据」的**原始串**，
// `evidence/paths.ts` 取**按「、」切开的数组**，同一份数据两种形态。
//
// ## 为什么是零依赖
//
// `tools/granularity.lib.ts` 必须在 `npm run build` **之前**跑（门不能 import `dist/`）⇒
// 它按 `.ts` 说明符直接引本模块。故本文件**不 import 任何东西**（与 `core/paths.ts` 同一约束）。
//
// ## 边界（刻意不做的）
//
// 只解析**线索头这一类** `> <标签>：<值>` 行；`Reflection` 的那一族（`> status:` / `> period:` /
// `> realityAnchor:` / `> uncertainty:`）**不在**本模块，别把它们塞进来。
// 未命中 ⇒ 空串 / 空数组（**不猜**，调用方自己决定要不要回落）。
export interface ClueFields {
  /** 「来源(…)」原串（**未切开**）：`arbitrate` 需要原始串、`granularity` 需要「只有动作」的判等。 */
  kinds: string;
  /** 「日期(…)」原串。 */
  date: string;
  /** 证据项：有「证据(…)」用它，否则回落「背景/材料」；已按 `、` / `,` 切开。 */
  evidence: string[];
  /** 「证据」的**原始串**（有则用它，否则回落「背景/材料」原始串）——`arbitrate` 的 `evidence` 字段用它。 */
  evidenceRaw: string;
  /** 「背景/材料」切开后的项。 */
  materials: string[];
  /** 「用户提示/决策」原串。 */
  decision: string;
  project: string;
  goal: string;
  session: string;
}

/** `> <标签>：<值>` 的值（首处命中；没有该行 ⇒ `""`）。 */
export const clueHeaderOf = (text: string, label: string): string =>
  (String(text || "").match(new RegExp(`^> ${label}：(.*)$`, "m")) || [])[1] || "";

/** 「`<标签>(…)`」里的内容（没有 ⇒ `""`）。 */
export const clueFieldOf = (clue: string, label: string): string =>
  (String(clue || "").match(new RegExp(`${label}\\(([^)]*)\\)`)) || [])[1] || "";

/**
 * 把「、」/「,」分隔的一项列表切开并去空。
 * `—`（破折号占位）与空项丢掉 —— 它表示「没有」，不是一项材料
 * （`tools/granularity.lib.ts` 的 `headerMaterialsOf` 原先自己过滤它，收一处后由这里统一）。
 */
export const clueItemsOf = (raw: unknown): string[] =>
  String(raw || "")
    .split(/[、,]/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "—");

/** 一份记忆正文 ⇒ 线索头字段（**唯一一份**解析）。 */
export const clueFieldsOf = (text: string): ClueFields => {
  const clue = clueHeaderOf(text, "证据链");
  const materialsRaw = clueHeaderOf(text, "背景/材料");
  const evidenceRaw = clueFieldOf(clue, "证据") || materialsRaw;
  return {
    kinds: clueFieldOf(clue, "来源"),
    date: clueFieldOf(clue, "日期"),
    evidence: clueItemsOf(evidenceRaw),
    evidenceRaw,
    materials: clueItemsOf(materialsRaw),
    decision: clueHeaderOf(text, "用户提示/决策"),
    project: clueHeaderOf(text, "项目"),
    goal: clueHeaderOf(text, "目标"),
    session: clueHeaderOf(text, "来源会话"),
  };
};
