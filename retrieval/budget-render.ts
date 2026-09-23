// dsh-shadow —— retrieval/budget-render.ts：主题召回预算内渲染。
// 接口上同时返回 servedRels（hits）与 servedDetail（冷却）—— ADR-0067 两集合分家的 locality。
// 调用方禁止另造 servedRels；detail 用**最终选用的** render 字符串判断（forceL0 降级后再判）。
import { renderByTier } from "./render.js";
import { excerptWorthwhile } from "./loss.js";

export interface BudgetRenderResult {
  parts: string[];
  servedRels: string[];
  servedDetail: string[];
  withheld: { rel: string; entry?: string }[];
  droppedByLimit: number;
  droppedByBudget: number;
  diagLines: string[];
}

const recoverHandleOf = (s: any): { file: string; locator?: string } | null => {
  const rel = s?.mm?.rel;
  return rel ? { file: String(rel), locator: s?.entry ? String(s.entry) : undefined } : null;
};

/**
 * 在 limit / maxChars 预算内渲染 available；同步产出 servedRels 与 servedDetail。
 * @param debug - 为 true 时填充 diagLines（返回行），不写 console
 */
export const renderWithinBudget = (
  available: any[],
  opts: { limit: number; maxChars: number; tokens: string[]; debug?: boolean },
): BudgetRenderResult => {
  const { limit, maxChars, tokens } = opts;
  const debug = opts.debug === true;
  const n = available.length;
  const parts: string[] = [];
  const withheld: { rel: string; entry?: string }[] = [];
  const servedRels: string[] = [];
  const servedDetail: string[] = [];
  const diagLines: string[] = [];
  let used = 0;
  let droppedByLimit = 0;
  let droppedByBudget = 0;

  for (let i = 0; i < available.length; i++) {
    const s = available[i];
    if (parts.length >= limit) { droppedByLimit = available.length - i; break; }
    const sharedPool = Math.max(0, Math.floor((maxChars - used) / Math.max(1, n)));
    const cap = Math.max(120, Math.floor((maxChars / n) * 2) + sharedPool);
    let render = renderByTier(s, cap, false, tokens);
    if (used + render.length > maxChars) {
      const degraded = renderByTier(s, cap, true, tokens);
      const handle = recoverHandleOf(s);
      if (handle && degraded.length <= render.length) render = degraded;
      if (used + degraded.length > maxChars) { droppedByBudget = available.length - i; break; }
    }
    if (!render.includes("…") && excerptWorthwhile(s.text)) withheld.push({ rel: s.mm.rel, entry: s.entry });
    parts.push(render);
    servedRels.push(s.mm.rel);
    used += render.length;
    if (debug) {
      const b = s.breakdown || {};
      const sc = Math.round(s.score * 10) / 10;
      diagLines.push(`返回 ${s.mm.rel} · 命中 ${sc} · 入口${b.entry || 0} 主题${b.topic || 0} 路径${b.path || 0} 正文${b.body || 0}${b.deprioritized ? " · 降权(deprioritize)" : ""}${s.evidence ? ` · 状态${s.evidence.status}` : ""}`);
    }
    // 最终选用的 render（可能已 forceL0 降级）；降级后无「…」则不进 detail —— 现语义。
    if (s.tier !== "L0" && render.includes("…")) servedDetail.push(s.mm.rel);
  }
  if (debug) {
    diagLines.push(`预算 ${maxChars} 字 · 返回 ${parts.length} 条${droppedByLimit ? ` · limit 截断 ${droppedByLimit}` : ""}${droppedByBudget ? ` · 预算截断 ${droppedByBudget}` : ""}`);
  }
  return { parts, servedRels, servedDetail, withheld, droppedByLimit, droppedByBudget, diagLines };
};
