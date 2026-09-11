export declare const sigmoid: (x: number) => number;
export declare const hotnessOf: (hits: number, ageDays: number, halfLife: number) => number;
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
export declare const lifecycleOf: (rec: any, ageDays: number, conflictCount: number, stale: boolean, superseded?: boolean) => "ARCHIVED" | "DECAYING" | "NEW" | "OBSERVED" | "STALE" | "SUPERSEDED" | "TRUSTED" | "VERIFIED";
