export interface AppendOutcome {
    ok: boolean;
    reason?: string;
}
/**
 * 向 `<ws>/<rel>` **追加**一行（调用方自己保证 `line` 不含换行）。
 *
 * 失败**不静默**：返回 `{ ok:false, reason }`，由调用方决定怎么留痕（`query-log` 走 `deps.noteDegrade`，
 * 审计流走 `core.lastFlushError` + `console.error`）。
 */
export declare const appendJsonlLine: (fs: any, ws: string, rel: string, line: string) => Promise<AppendOutcome>;
