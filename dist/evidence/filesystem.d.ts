import type { EvidenceProvider } from "../core/types.js";
/**
 * 只答「这条路径还在不在」。
 *
 * **v1.15.15 修一处真 bug（影响面大）**：原实现无条件做 `${ws}/${rel}`，
 * 于是**绝对 locator 被拼上工作区前缀**变成双前缀
 * （`D:/project/dsh1/D:/project/wslc1/scripts/x.ps1`）→ `fs.resolve` 得到不存在的路径 → 判 `false`。
 * 实测：`D:/project/dsh1/vendor/dsh-shadow/package.json`（磁盘上确实存在）被判 `false`。
 *
 * **为什么影响大**：本机记忆语料里绝对路径证据很常见（跨项目引用），
 * 它们会被一律判成「证据失效」→ 在召回里 `score × 0.5` + `stale=true`（见 `query/query.ts`），
 * 并在 `mode:"context"` / `verifyEvidence` 里报「已过时/证据缺失」——**这是假漂移**。
 * 实测量级：全库 2514 次路径状引用中有 1025 次「不可解析」，其中绝大多数是绝对路径被双前缀所致。
 *
 * **边界**：这是**正确性**修复，不扩大任何授权。`inScope` / `authorizeScope`（`core/authorization.ts`）
 * 仍单独管「哪些候选允许返回」；本函数只回答存在性，且绝对路径**本来就在记忆里**。
 */
/**
 * 只答「这条路径还在不在」。**三态**（v1.15.57 修）：
 *   `"exists"` 读到了；`"missing"` 确认不存在（ENOENT）；`"undecidable"` **判不了**。
 *
 * **为什么要第三态**：旧实现把「判不了」也 `return true`（注释写「无法判定时视为存在，避免误伤」），
 * 于是 `verify` 报 **`status:"verified", confidence:0.99, freshness:"fresh"`** ——
 * **缺件被伪装成「已核实」**，且这是**最高置信度**的那一档。`ref.path` 为空、无工作区、后端读失败
 * （EACCES 等）都会走到这里，而它们恰恰是**最不该**被当成「证据仍在」的情况。
 * 与 ADR-0049（缺件不静默）一致的做法是：**报「不可判定」并给出原因**，由上层决定怎么算。
 */
export declare const fsExists: (fs: any, ws: string, rel: string) => Promise<"exists" | "missing" | "undecidable">;
export declare const fsEvidenceProvider: EvidenceProvider;
