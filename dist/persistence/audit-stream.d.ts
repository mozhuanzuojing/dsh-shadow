export interface AuditStreamSummary {
    ok: boolean;
    /** 参与读取的 `.jsonl` 文件数（0 = 还没采集）。 */
    files: number;
    /** 可解析的记录数。 */
    records: number;
    /** 不可解析的行数（撕裂/坏件）——**必须可见**，不得当成 0 条记录。 */
    tornLines: number;
    /** 去重后的材料（`materials` 字段 ∪ 从 `改/读 <path>` 文本推断）。 */
    materials: string[];
    /** 有记录的日期（升序）。 */
    dates: string[];
    /** 材料清单的截断前的总数（`materials` 会被截到 `MATERIAL_LIMIT`）。 */
    materialCount: number;
    reason?: string;
}
/**
 * 读审计流。
 * `dates` 给了就只读那几个日期（`YYYY-MM-DD`）；不给则读 `audit/` 下全部日期文件（按名升序）。
 */
export declare const readAuditStream: (fs: any, ws: string, opts?: {
    dates?: string[];
}) => Promise<AuditStreamSummary>;
/** 渲染成一行诊断（`read_shadow({debug:true})` 用；缺件与读失败**分得开**）。 */
export declare const renderAuditStreamDiag: (s: AuditStreamSummary) => string;
