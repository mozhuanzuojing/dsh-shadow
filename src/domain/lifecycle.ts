/**
 * v2 domain — 生命周期 · 遗忘裁决（纯函数，可测）。
 *
 * **Forget ≠ Delete（v1 ADR-0031 的契约，v2 沿用）**：遗忘只把记忆移出「活跃扫描集」——
 * 不参与默认召回 / 索引 / Episode 派生；**文件永远留在 `.shadow/atoms/`**。
 * v2 没有任何删除 atom 的路径；要找回被遗忘的记忆，看 `shadow-manifest` 的计数或直接读 atoms。
 *
 * 与 v1 的**有意差异**（默认值语义）：
 * - v1 `forget.minHits` 把 0 判为非法、回落 1（默认开启「按 hits 遗忘」）；
 * - v2 `normalizeConfig` 的默认 minHits=0 / maxActive=0，若沿用 v1 语义，升级会把用户旧记忆
 *   突然移出召回。故 v2 显式定义 **0 = 关闭该条遗忘判据**；要启用就配 `minHits>=1` 或 `maxActive>0`。
 *   默认配置下「一条都不忘」——升级静默改变召回面是不可接受的。
 */

import { ageDays } from "../contract/time.js";
import type { AtomMeta, ParsedAtom } from "../contract/types.js";

export interface ForgetCfg {
  staleDays: number;
  minHits: number;
  maxActive: number;
}

export type ForgetReason = "archived" | "superseded" | "compacted" | "stale" | "cap";

export type ForgetCounts = Record<ForgetReason, number>;

export interface ForgetResult {
  /** 仍参与默认召回/索引的原子。 */
  active: ParsedAtom[];
  /** 被移出活跃集的 rel（文件仍在磁盘）。 */
  forgotten: Set<string>;
  counts: ForgetCounts;
  total: number;
}

const emptyCounts = (): ForgetCounts => ({ archived: 0, superseded: 0, compacted: 0, stale: 0, cap: 0 });

/**
 * 状态类遗忘：归档 / 被取代 / 已收口。
 * `pinned` 优先——人工显式信任（外部权威）不该被派生判断盖掉（v1 lifecycle 的同一优先级）。
 */
export const statusForgetReason = (meta: AtomMeta | undefined): "archived" | "superseded" | "compacted" | null => {
  if (!meta || meta.pinned) return null;
  const status = meta.status;
  return status === "archived" || status === "superseded" || status === "compacted" ? status : null;
};

/**
 * 低价值/陈旧遗忘：`age >= staleDays` 且 `hits < minHits`。
 * `minHits <= 0` 表示关闭（见文件头）；`staleDays` 至少 1 天（同 normalizeConfig 的钳制）。
 *
 * **meta 缺失时不做陈旧类遗忘**：hits 未知不能当 0——只读沙箱/索引不可用时若按 0 判定，
 * 会把大量旧记忆静默移出召回面（「未知」被当成「从未命中」是假降级）。状态类遗忘不受影响。
 */
export const staleForgetReason = (
  atom: ParsedAtom,
  meta: AtomMeta | undefined,
  cfg: ForgetCfg,
  today: Date,
): "stale" | null => {
  if (!meta || meta.pinned) return null;
  if (!(cfg.minHits > 0)) return null;
  if (ageDays(atom.date, today) < Math.max(1, cfg.staleDays)) return null;
  return (Number(meta.hits) || 0) < cfg.minHits ? "stale" : null;
};

/** 活跃集上限：超过 `maxActive` 时按 (date,time) 取最旧的多余项（0 = 不设上限）。 */
export const oldestBeyond = (atoms: ParsedAtom[], maxActive: number): Set<string> => {
  const cap = Math.max(0, Number(maxActive) || 0);
  if (cap <= 0 || atoms.length <= cap) return new Set();
  const key = (a: ParsedAtom): string => a.date + " " + a.time;
  const sorted = [...atoms].sort((a, b) => key(a).localeCompare(key(b)) || a.rel.localeCompare(b.rel));
  return new Set(sorted.slice(0, atoms.length - cap).map((a) => a.rel));
};

/** 一次读的统一遗忘裁决：活跃集 + 遗忘集 + 按原因计数（供可见披露）。 */
export const computeForgetting = (
  atoms: ParsedAtom[],
  meta: Map<string, AtomMeta>,
  cfg: ForgetCfg,
  today: Date,
): ForgetResult => {
  const counts = emptyCounts();
  const forgotten = new Set<string>();
  const active: ParsedAtom[] = [];
  for (const atom of atoms) {
    const m = meta.get(atom.rel);
    const byStatus = statusForgetReason(m);
    if (byStatus) {
      counts[byStatus] += 1;
      forgotten.add(atom.rel);
      continue;
    }
    const byStale = staleForgetReason(atom, m, cfg, today);
    if (byStale) {
      counts.stale += 1;
      forgotten.add(atom.rel);
      continue;
    }
    active.push(atom);
  }
  const capped = oldestBeyond(active, cfg.maxActive);
  if (capped.size) {
    for (const rel of capped) {
      counts.cap += 1;
      forgotten.add(rel);
    }
  }
  const kept = capped.size ? active.filter((a) => !capped.has(a.rel)) : active;
  return { active: kept, forgotten, counts, total: forgotten.size };
};

/**
 * 可见披露。文案必须同时说清三件事：**多少条**、**为什么**、**没删**。
 * 少最后一条，读者会把「遗忘」误读成「删除」（v1 的同一个教训）。
 */
export const renderForgetNotice = (result: ForgetResult): string => {
  if (!result.total) return "";
  const parts: string[] = [];
  if (result.counts.archived) parts.push("归档 " + result.counts.archived);
  if (result.counts.superseded) parts.push("被取代 " + result.counts.superseded);
  if (result.counts.compacted) parts.push("已收口 " + result.counts.compacted);
  if (result.counts.stale) parts.push("陈旧低价值 " + result.counts.stale);
  if (result.counts.cap) parts.push("超出 maxActive " + result.counts.cap);
  return (
    "> 遗忘：" + result.total + " 条不在活跃集（" + parts.join(" · ") + "）。" +
    "Forget≠Delete：文件仍在 `.shadow/atoms/`，未被删除；`shadow-manifest` 可见活跃/遗忘总数。"
  );
};
