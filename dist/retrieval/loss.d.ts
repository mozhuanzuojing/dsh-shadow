/** 损失的形态（rtk `Lossiness` 三值；本仓的两个省略点都用它）。 */
export type Lossiness = "none" | "tail" | "whole";
/** 恢复句柄：`file` = 源文件（工作区相对路径或插件已知路径），`locator` = 段名 / 入口名。 */
export interface RecoverHandle {
    file: string;
    locator?: string;
}
/** 渲染句柄（`` `file#locator` ``）；`file` 为空 ⇒ `null`（调用方**必须**据此改走「不可复取」）。 */
export declare const handleText: (h?: RecoverHandle | null) => string | null;
/** 形态词（披露用；`none` 不进这个表 —— 无损失就**不披露**）。 */
export declare const LOSS_WORD: Record<Exclude<Lossiness, "none">, string>;
/**
 * **never_worse 守卫**（甲-2）：有损输出**比原文还长**时退回原文；**相等时保留**（rtk `guard.rs:29-66` 的边界口径）。
 * ⚠ 单位是**字符**（不是字节）—— 见文件头；`filtered` 与 `raw` 必须是同一个单位的同一份内容。
 */
export declare const neverWorseChars: (filtered: string, raw: string) => string;
/** 该口径的单位名（写进测试与文档，免得后来者以为是字节）。 */
export declare const NEVER_WORSE_UNIT = "chars";
/**
 * 有损输出必须**显式声明**：**「可复取」（给句柄）或「不可复取」（给原因）二者必居其一** ——
 * 这正是甲-1 的「Never emit an **unrecoverable** truncation marker」在本仓的落地口径
 * （本仓的补充：不可复取时**不是**静默省略，而是**把不可复取写出来**；见 ADR-0090 §口径）。
 * `loss: "none"` ⇒ `null`（没有损失就不披露，避免噪声）。
 */
export declare const lossLine: (o: {
    loss: Lossiness;
    handle?: RecoverHandle | null;
    because?: string;
}) => string | null;
/** 「值得给片段」的下限（字符）—— 用来**区分「本来就短」与「被省略」**。 */
export declare const EXCERPT_WORTHWHILE_CHARS = 200;
/**
 * 该条**本来是够长、值得给片段**的吗？
 * 只有为真时，「渲染里没有片段」才该被算作**省略**；否则它就是**本来就没有更多内容**。
 * （判据的意义：读侧看到「摘要 + 无片段」时必须能区分这两种情形。）
 */
export declare const excerptWorthwhile: (text: unknown, min?: number) => boolean;
/**
 * 召回路径的**分层省略披露**（一次，O(1) 输出；逐条句柄最多列 3 个 + 规则）。
 * 返回 `""` = 本次没有「本是够长却被省略」的条目 ⇒ 不添一句话（零额外文字）。
 */
export declare const tierLossNote: (o: {
    withheld: {
        rel: string;
        entry?: string;
    }[];
    returned: number;
}) => string;
