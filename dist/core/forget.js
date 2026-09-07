// dsh-shadow —— core/forget.ts：遗忘判定（抽成纯函数，写/读两侧共用）。
// 遗忘（GC）：把「低价值 + 旧 + 未 pinned / 已归档被取代」的记忆移出「活跃」扫描集。
//   关键：Forget ≠ Delete（ADR-0031）——文件保留，只是不再被索引/召回当作活跃知识扫描；
//   这样封顶热集大小（性能），同时不破坏「过去发生过」的可追溯性。
import { ageDaysOf } from "./util.js";
export const isForgettable = (rel, meta, cfg = {}) => {
    if (cfg.enabled !== true)
        return false;
    const m = meta && meta[rel] ? meta[rel] : {};
    if (m.pinned)
        return false;
    if (m.status === "archived" || m.status === "superseded")
        return true;
    const staleDays = Math.max(1, Number(cfg.staleDays) || 14);
    const minHits = Math.max(0, Number(cfg.minHits) || 1);
    const hits = Number(m.hits) || 0;
    return ageDaysOf(rel) >= staleDays && hits < minHits;
};
// maxActive 上限：活跃超过上限时，按 (date,time) 取最旧的 N 个。
export const oldestBeyond = (records, maxActive) => records
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, Math.max(0, records.length - maxActive))
    .map((r) => r.rel);
