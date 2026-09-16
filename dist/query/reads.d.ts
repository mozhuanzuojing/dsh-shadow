export interface ReadCtx {
    fs: any;
    ws: string;
    flushWarn: string;
    agent: any;
    /** 本会话是否可写（T17-B D13 守卫②）：`false` ⇒ 派生索引不落盘、直接回退 fs。缺省按可写。 */
    writable?: boolean;
    /** 写侧已知变更的 rel（T17-B D6 门③）：provider 只对这些 rel 做单条 upsert。 */
    dirtyRels?: Iterable<string>;
    /** 上面那批 rel **成功并入索引后**才调（回退路径**绝不许**调，否则原地改写会永久丢失）。 */
    clearDirty?: (rels: Iterable<string>) => void;
}
export interface ReadQuery {
    modes: string[];
    run(deps: any, args: any, exec: any, ctx: ReadCtx): Promise<string>;
}
export declare const readQueries: ReadQuery[];
export declare const findReadQuery: (args: any) => ReadQuery | undefined;
/** 若 mode 命中某 ReadQuery，则交给它并返回；否则返回 undefined（交由 runReadShadow 继续走内联分支）。 */
export declare const dispatchReadQuery: (deps: any, args: any, exec: any, ctx: ReadCtx) => Promise<string | undefined>;
