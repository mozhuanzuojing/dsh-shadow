// dsh-shadow —— core/lifecycle.ts：记忆生命周期状态机 + 热度（从 meta 信号派生）。从 index.ts 迁出。
export const sigmoid = (x: number) => 1 / (1 + Math.exp(-(x || 0)));
export const hotnessOf = (hits: number, ageDays: number, halfLife: number) => {
  const h = Math.max(0, Number(hits) || 0);
  const a = Math.max(0, Number(ageDays) || 0);
  const hl = Math.max(0.01, Number(halfLife) || 7);
  return sigmoid(Math.log(1 + h)) * Math.exp((-Math.LN2 * a) / hl);
};

/**
 * 记忆生命周期（从 meta 信号 + 读时裁决派生）。
 *
 * `superseded`（v1.15.18 新增，可选）：**读时裁决**的取代信号，来自
 * `observer/arbitrate.ts` 的 `verdictOf`（按同 `entry` 是否存在更新记忆判定，**无 LLM、无相似度阈值**）。
 *
 * **为什么必须由参数传入，而不是读 meta**：`meta[rel].status === "superseded"` 这条**在生产中永不可达**——
 * 已核实生产代码只写 `"active"`（`core/memory.ts`、`query/query.ts`）与 `"compacted"`
 * （`core/writer-materialize.ts`），唯一把 `"superseded"` 写进 meta 的是**测试夹具**
 * （`test/recall-attribution.test.ts` 手工塞入）。原因是**取代是「相对当前可见记忆集」的读时判断**，
 * 把它持久化进派生文件（`_meta.json`）会随可见集变化而失效。
 * ⇒ 故保留 `rec?.status` 这条（兼容外部显式标记），并**并列**接受读时裁决。
 *
 * **优先级**：`pinned`（人工显式信任）> `archived`（人工归档）> 取代/冲突/衰减……
 * 前两者是**外部权威状态**，不该被一个派生判断盖掉。
 */
export const lifecycleOf = (rec: any, ageDays: number, conflictCount: number, stale: boolean, superseded?: boolean) => {
  if (rec?.pinned) return "TRUSTED";
  if (rec?.status === "archived") return "ARCHIVED";
  if (rec?.status === "superseded" || superseded === true) return "SUPERSEDED";
  const confirms = Array.isArray(rec?.confirmedBy) ? rec.confirmedBy.length : 0;
  const hits = Number(rec?.hits) || 0;
  if (conflictCount > 0) return "STALE"; // 证据路径缺失 → 可能已过时/冲突
  if (stale) return "DECAYING";
  if (confirms >= 2) return "TRUSTED";
  if (confirms >= 1) return "VERIFIED";
  if (hits > 0) return "OBSERVED";
  return "NEW";
};

// ── 本状态机的**信号可达性**与**状态可达性**由声明表守住 ─────────────────────────────
// 守在哪：`test/lifecycle-signal-table.test.ts`（吸收 hl_mem 的 `assert_transition()` 形态；ADR-0077）。
// 那种表**刻意不放在这里**：它必须同时写出字段名与触发值，而 `tools/audit-wiring.lib.ts` 的
// `hasProducer` 是**文本**判据 —— 字段名与字面量同行共现就会被当成「写入者」，
// 于是审计工具会**丢掉 `status=superseded` 这个真线索**（本文件里 `rec?.status === "archived"` 这类
// 比较式被 `stripCmp` 正确剔除，正是它被判「无写入者」的原因）。放在测试面既不影响棘轮的强制力
// （棘轮扫的是**生产源码**），也不污染审计判据。
// 该表已机器核实的结论：`pinned`（真值）/ `status:"archived"` / `status:"superseded"`
// 三条触发值在**本仓库生产代码里没有任何写入者**，只保留给外部人工或夹具（D4 / ADR-0063）。
