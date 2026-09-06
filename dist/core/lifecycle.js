// dsh-shadow —— core/lifecycle.ts：记忆生命周期状态机（从 meta 信号派生）。从 index.ts 迁出。
export const lifecycleOf = (rec, ageDays, conflictCount, stale) => {
    if (rec?.pinned)
        return "TRUSTED";
    if (rec?.status === "archived")
        return "ARCHIVED";
    if (rec?.status === "superseded")
        return "SUPERSEDED";
    const confirms = Array.isArray(rec?.confirmedBy) ? rec.confirmedBy.length : 0;
    const hits = Number(rec?.hits) || 0;
    if (conflictCount > 0)
        return "STALE"; // 证据路径缺失 → 可能已过时/冲突
    if (stale)
        return "DECAYING";
    if (confirms >= 2)
        return "TRUSTED";
    if (confirms >= 1)
        return "VERIFIED";
    if (hits > 0)
        return "OBSERVED";
    return "NEW";
};
