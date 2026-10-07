// dsh-shadow —— evidence/paths.ts：证据路径候选/路径判定。从 index.ts 迁出。纯函数。
import { clueFieldsOf } from "../core/view/clue.js";

/**
 * 记忆正文 ⇒ 证据路径候选（`、` / `,` 切开）。
 *
 * **B8：线索头解析收一处**到 `core/view/clue.ts` —— 此前这份正则被 `evidence/paths.ts` ·
 * `subject/observer/arbitrate.ts` · `retrieval/render.ts` · `tools/granularity.lib.ts` 各写一遍
 *（改一次记忆头格式要扫多处），四者现已全部走该模块。
 * ⚠ **同族残留**（不在本轮写面，已在回执报给 Lead）：`core/view/experience.ts` 仍自留一份
 * `证据链` / `证据(...)` / `背景/材料` 的解析，且它的 `evidence` **不**回落「背景/材料」（与这里口径不同）。
 * 口径**保持**：命中「证据链」里的 `证据(…)` 就用它，否则回落「背景/材料」；空/缺行 ⇒ **空数组**（不猜）。
 * 两处**已核过的差异**（都是改进方向，不在生产路径上）：
 *   · `证据(—)`（写侧 `core/retention/memory.ts` 在无材料时写的占位）现在被 `clueItemsOf` 当占位丢掉
 *     ⇒ 不再产出 `["—"]` 这个假 item（旧实现会，只是下游 `isPathLike("—")` 又把它滤掉，故无可观测差异）；
 *   · **空捕获** `证据()` 现在回落「背景/材料」（旧实现返回 `[]`）—— 写侧从不产出空捕获（恒为 `—` 或真值）。
 */
export const evidencePathsOf = (text: string) => clueFieldsOf(String(text)).evidence;

export const isPathLike = (p: string) => p && !/^https?:|github\.com|arxiv/i.test(p) && (/[\\\/]/.test(p) || /\.[a-z0-9]{1,6}$/i.test(p) || /^[A-Za-z]:/.test(p));

/**
 * 该 locator 是否**是可检查的具体路径**（而非通配符 / 模板）。
 *
 * **为什么排除通配符**（v1.15.15）：`scripts/*.ps1` 这种 glob 不是一条「具体引用」，
 * 「通配符还在不在」**不是良构问题**——拿它去做存在性检查必然判缺失，制造假漂移。
 * 这与 ADR-0059 采用的**双条件**判据一致（CASCADE, FSE 2026）：只有在
 * ①引用是**具体**路径 且 ②它确实解析不到 时才报「引用失效」。
 *
 * 注意：`isPathLike`（旧函数）**故意不收窄** —— 它服务的是「这像不像一条路径引用」的粗筛
 * （`core/view/context.ts` / `observer/*` 用它挑候选）；收窄会改变那些调用方的候选集。
 * 需要「可检查」语义的地方用本函数。
 */
export const isConcreteLocator = (p: unknown): boolean => {
  const s = String(p || "").trim();
  if (!s) return false;
  if (/\*/.test(s) || /\?/.test(s)) return false;                 // glob / 模板
  if (/^origin\/|^[a-z-]+\/[a-z-]+$/.test(s) && !/\./.test(s)) return false;  // git 分支/ref
  return true;
};

/**
 * 该 locator 是否**已经是绝对路径**（含盘符 `D:/…`、`D:\…`，或根斜杠 `/…`）。
 *
 * **为什么必须集中判定**（v1.15.15 修一处真 bug）：拼接代码若无条件做 `${ws}/${rel}`，
 * 绝对 locator 会变成 `D:/project/dsh1/D:/project/wslc1/x.ps1` 这种**双前缀**，必然查不到——
 * 于是「磁盘上明明存在」的文件被判 `not_found/stale`。
 * 该形状在记忆证据里很常见（跨项目、跨目录的绝对引用）。
 *
 * 单一来源：`evidence/filesystem.ts`（存在性检查）与 `core/candidate/semble.ts`（候选绝对化）共用，
 * 避免两处各自写正则而漂移（本仓 ⑥「因果跌倒 / 注释断链」要防的正是这个）。
 */
export const isAbsoluteLocator = (p: unknown): boolean => {
  const s = String(p || "").trim().replace(/\\/g, "/");
  return /^[A-Za-z]:\//.test(s) || s.startsWith("/");
};
