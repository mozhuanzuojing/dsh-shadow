// dsh-shadow —— retrieval/loss.ts：**省略的形态与恢复句柄**（ADR-0090；来自 ADR-0087 的「甲-1」「甲-2」）。
//
// 两条判据来自 rtk（一手证据见 `adr/0087` §A）：
//   **甲-1** `Lossiness{None,Tail,Whole}` + 注释原文 *"Never emit an unrecoverable truncation marker:
//           fall back to full raw"*（`src/core/toml_filter.rs:568-578`、`src/main.rs:1606-1630`）；
//   **甲-2** `never_worse` 守卫：压完比原文长就退回原文（`src/core/guard.rs:16-23`，`emit_guarded` 是唯一出口）。
//
// **与 rtk 的根本差异（记不住就会照抄错）**：rtk 压的是**命令输出**，原文本来不落盘 ⇒ 它必须**造一份存储**
//   （SQLite + gzip）+ 内容哈希去重 + 老化；而**本仓的权威源就是工作区里的文件**（`.shadow/atoms/<入口>.md`、
//   `.shadow/indexes/_index.md`）⇒ **恢复句柄 = 源文件路径 + 定位，零新增存储**（不需要哈希主键、去重与老化语义
//   —— 那正是 `BACKLOG` D9 前置① 的答案）。
//
// **单位（口径，别照搬 rtk）**：rtk 用 `text.len()`（**字节**）/4 估 token，而 UTF-8 中文 3 字节/字
//   ⇒ 中文长句会被**误判「没变长」**（`BACKLOG` D10 已记下该偏差方向，且 rtk 源码里没有任何 CJK 讨论）。
//   本仓的预算是 `max_tokens × 4` **字符** ⇒ 这里一律比**字符数**，与预算**同单位** ⇒ **中文无偏**。

/** 损失的形态（rtk `Lossiness` 三值；本仓的两个省略点都用它）。 */
export type Lossiness = "none" | "tail" | "whole";

/** 恢复句柄：`file` = 源文件（工作区相对路径或插件已知路径），`locator` = 段名 / 入口名。 */
export interface RecoverHandle {
  file: string;
  locator?: string;
}

/** 渲染句柄（`` `file#locator` ``）；`file` 为空 ⇒ `null`（调用方**必须**据此改走「不可复取」）。 */
export const handleText = (h?: RecoverHandle | null): string | null =>
  h && String(h.file || "").trim() ? `\`${h.file}${h.locator ? `#${h.locator}` : ""}\`` : null;

/** 形态词（披露用；`none` 不进这个表 —— 无损失就**不披露**）。 */
export const LOSS_WORD: Record<Exclude<Lossiness, "none">, string> = {
  tail: "尾部/片段之外的部分未给（正文未全给）",
  whole: "整段省略（只给摘要）",
};

/**
 * **never_worse 守卫**（甲-2）：有损输出**比原文还长**时退回原文；**相等时保留**（rtk `guard.rs:29-66` 的边界口径）。
 * ⚠ 单位是**字符**（不是字节）—— 见文件头；`filtered` 与 `raw` 必须是同一个单位的同一份内容。
 */
export const neverWorseChars = (filtered: string, raw: string): string =>
  filtered.length > raw.length ? raw : filtered;

/** 该口径的单位名（写进测试与文档，免得后来者以为是字节）。 */
export const NEVER_WORSE_UNIT = "chars";

/**
 * 有损输出必须**显式声明**：**「可复取」（给句柄）或「不可复取」（给原因）二者必居其一** ——
 * 这正是甲-1 的「Never emit an **unrecoverable** truncation marker」在本仓的落地口径
 * （本仓的补充：不可复取时**不是**静默省略，而是**把不可复取写出来**；见 ADR-0090 §口径）。
 * `loss: "none"` ⇒ `null`（没有损失就不披露，避免噪声）。
 */
export const lossLine = (o: { loss: Lossiness; handle?: RecoverHandle | null; because?: string }): string | null => {
  const word = LOSS_WORD[o.loss as Exclude<Lossiness, "none">];
  if (!word) return null; // `loss: "none"`（或未知取值）⇒ 没有损失 ⇒ 不披露，避免噪声
  const why = o.because ? `（${o.because}）` : "";
  const h = handleText(o.handle);
  const recover = h
    ? `可复取：${h}`
    : "**不可复取**：本次调用没有可用于恢复的源路径（句柄不是「暂时取不到」，而是**不存在**）";
  return `> 省略 · ${word}${why} · ${recover}`;
};

/** 「值得给片段」的下限（字符）—— 用来**区分「本来就短」与「被省略」**。 */
export const EXCERPT_WORTHWHILE_CHARS = 200;

/**
 * 该条**本来是够长、值得给片段**的吗？
 * 只有为真时，「渲染里没有片段」才该被算作**省略**；否则它就是**本来就没有更多内容**。
 * （判据的意义：读侧看到「摘要 + 无片段」时必须能区分这两种情形。）
 */
export const excerptWorthwhile = (text: unknown, min = EXCERPT_WORTHWHILE_CHARS): boolean =>
  String(text || "").trim().length > min;

/**
 * 召回路径的**分层省略披露**（一次，O(1) 输出；逐条句柄最多列 3 个 + 规则）。
 * 返回 `""` = 本次没有「本是够长却被省略」的条目 ⇒ 不添一句话（零额外文字）。
 */
export const tierLossNote = (o: { withheld: { rel: string; entry?: string }[]; returned: number }): string => {
  const n = o.withheld.length;
  if (!n) return "";
  const shown = o.withheld.slice(0, 3).map((w) => handleText({ file: w.rel, locator: w.entry })).filter(Boolean).join(" · ");
  return (
    `\n> 分层省略：本次返回 ${o.returned} 条里有 ${n} 条**只给了摘要**（片段/正文被档位或预算省略）` +
    `—— 这与「该条本来就没有更多内容」不同。\n> 可复取：${shown}` +
    (n > 3 ? ` · …（其余 ${n - 3} 条同规则）` : "") +
    `（每条入口路径就是句柄；需全文直接读该文件）`
  );
};
