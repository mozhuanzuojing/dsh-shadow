// dsh-shadow —— core/retention/forget.ts：遗忘判定（抽成纯函数，写/读两侧共用）。
// 遗忘（GC）：把「低价值 + 旧 + 未 pinned / 已归档被取代」的记忆移出「活跃」扫描集。
//   关键：Forget ≠ Delete（ADR-0031）——文件保留，只是不再被索引/召回当作活跃知识扫描；
//   这样封顶热集大小（性能），同时不破坏「过去发生过」的可追溯性。
import { ageDaysOf, onByDefault } from "../util.js";

export interface ForgetCfg {
  enabled?: boolean;
  staleDays?: number;
  minHits?: number;
  maxActive?: number;
}

export const isForgettable = (rel: string, meta: any, cfg: ForgetCfg = {}) => {
  // v1.15.85「默认全开」：`undefined` = 开，只有**显式 `false`** 才关（判据见 `core/util.ts` 的 `onByDefault`）。
  if (!onByDefault(cfg.enabled)) return false;
  const m = meta && meta[rel] ? meta[rel] : {};
  if (m.pinned) return false;
  if (m.status === "archived" || m.status === "superseded") return true;
  const staleDays = Math.max(1, Number(cfg.staleDays) || 14);
  // `minHits` 的 `|| 1` **判为正当、不随 T8-B 改成 `numOr`**（裁定，v1.15.64）：
  //   `minHits: 0` 会让判据 `hits < 0` **恒假** ⇒ 等于「按 hits 永不遗忘」，
  //   而这个语义本仓已由 `enabled: false` 明确承担；再让 0 表达一次就是**同一件事两个开关**
  //   （判据分叉）。故此处 0 判为**非法输入**，回落 1。理由记在 `adr/0083` T8 条。
  const minHits = Math.max(0, Number(cfg.minHits) || 1);
  const hits = Number(m.hits) || 0;
  return ageDaysOf(rel) >= staleDays && hits < minHits;
};

// maxActive 上限：活跃超过上限时，按 (date,time) 取最旧的 N 个。
export const oldestBeyond = (records: { rel: string; date: string; time: string }[], maxActive: number) =>
  records
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
    .slice(0, Math.max(0, records.length - maxActive))
    .map((r) => r.rel);

// Episode 收口归档标记：原子被合并进 consolidated 文件后置 status="compacted"，
// 永久移出活跃索引/召回（文件保留可回放），与 forget.enabled 无关。
export const isCompacted = (meta: any, rel: string) => meta?.[rel]?.status === "compacted";
