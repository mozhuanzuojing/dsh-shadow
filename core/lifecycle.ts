// dsh-shadow —— core/lifecycle.ts：记忆生命周期状态机 + 热度（从 meta 信号派生）。从 index.ts 迁出。
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-(x || 0)));
export const hotnessOf = (hits: number, ageDays: number, halfLife: number) => {
  const h = Math.max(0, Number(hits) || 0);
  const a = Math.max(0, Number(ageDays) || 0);
  const hl = Math.max(0.01, Number(halfLife) || 7);
  return sigmoid(Math.log(1 + h)) * Math.exp((-Math.LN2 * a) / hl);
};

export const lifecycleOf = (rec: any, ageDays: number, conflictCount: number, stale: boolean) => {
  if (rec?.pinned) return "TRUSTED";
  if (rec?.status === "archived") return "ARCHIVED";
  if (rec?.status === "superseded") return "SUPERSEDED";
  const confirms = Array.isArray(rec?.confirmedBy) ? rec.confirmedBy.length : 0;
  const hits = Number(rec?.hits) || 0;
  if (conflictCount > 0) return "STALE"; // 证据路径缺失 → 可能已过时/冲突
  if (stale) return "DECAYING";
  if (confirms >= 2) return "TRUSTED";
  if (confirms >= 1) return "VERIFIED";
  if (hits > 0) return "OBSERVED";
  return "NEW";
};
