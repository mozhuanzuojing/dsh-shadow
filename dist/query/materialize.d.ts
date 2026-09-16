export interface MaterializedView {
    memories: any[];
    parsed: any[];
    meta: any;
    config: any;
}
/**
 * 物化的可选接线（T17-B D7 / D13 / D6 门③）。全部可选 ⇒ 既有调用点行为不变。
 */
export interface MaterializeOpts {
    /** 记一条**能力降级**留痕（ADR-0049）：`(capability, reason, effect)`。缺它时降级照旧发生，只是不上横幅。 */
    note?: (capability: string, reason: string, effect: string) => void;
    /** 本会话是否可写（D13 守卫②）：`false`（read-only）⇒ 派生索引不落盘、直接回退 `fs`。缺省按可写。 */
    writable?: boolean;
    /** 写侧已知变更的 rel 集合（D6 门③）：provider 只对这些 rel 做单条 upsert。 */
    dirtyRels?: Iterable<string>;
    /**
     * 上面那批 rel **成功并入索引之后**才调用（回退路径**绝不许**调）。
     *
     * 为什么必须有这一半：`patchSummary` 是**原地改内容**（路径不变）⇒ 目录级粗信号**必然漏报**它
     * （`fs-cost-findings.md` Q5）。若在回退时就把 dirty 清掉，那次变更就**永久丢失**：下一次粗信号
     * 看不见、也没有任何信号 —— 索引永远陈旧。故：**只有成功 upsert 才消费**。
     */
    clearDirty?: (rels: Iterable<string>) => void;
}
/** 唯一一次「物化」：确认 meta（权威 `_meta.json`）→ 算 keep → 由 provider 取候选。 */
export declare const materializeAtoms: (fs: any, ws: string, config: any, opts?: MaterializeOpts) => Promise<MaterializedView>;
