export interface ReadCtx {
    fs: any;
    ws: string;
    flushWarn: string;
    agent: any;
}
export interface ReadQuery {
    modes: string[];
    run(deps: any, args: any, exec: any, ctx: ReadCtx): Promise<string>;
}
export declare const readQueries: ReadQuery[];
export declare const findReadQuery: (args: any) => ReadQuery | undefined;
/** 若 mode 命中某 ReadQuery，则交给它并返回；否则返回 undefined（交由 runReadShadow 继续走内联分支）。 */
export declare const dispatchReadQuery: (deps: any, args: any, exec: any, ctx: ReadCtx) => Promise<string | undefined>;
