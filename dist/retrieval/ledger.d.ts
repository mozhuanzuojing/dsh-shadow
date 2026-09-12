export interface LedgerRead {
    turn: number;
    served: Record<string, any>;
    /** 文件**读到了**但内容不是合法台账（解析失败 / 结构不对）。 */
    corrupt?: boolean;
    /** 文件**根本没读到**（`resolve`/`readText` 抛错，如权限、I/O 错误）。 */
    unreadable?: boolean;
    /** 原始异常信息（`unreadable` 时给读者看的原因）。 */
    error?: string;
}
export declare const readLedger: (fs: any, ws: string) => Promise<LedgerRead>;
export declare const writeLedger: (fs: any, ws: string, data: any) => Promise<boolean>;
