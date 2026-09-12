// dsh-shadow —— evidence/filesystem.ts：FsExistenceProvider（只答"还在不在"）。从 index.ts 迁出。
import type { EvidenceMatch, EvidenceProvider, GatewayEvidenceRef, EvidenceResult } from "../core/types.js";
import { isAbsoluteLocator } from "./paths.js";

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
export const fsExists = async (fs: any, ws: string, rel: string): Promise<"exists" | "missing" | "undecidable"> => {
  // 判不了就是判不了 —— 不伪装成存在（旧行为：`return true`）。
  if (!fs || !rel) return "undecidable";
  // 绝对 locator 直接查它自己；相对 locator 才拼工作区（无工作区 → 判不了）
  const target = isAbsoluteLocator(rel) ? String(rel) : (ws ? `${ws}/${rel}` : "");
  if (!target) return "undecidable";
  const resolved = await fs.resolve(target, { cwd: ws });
  let firstErr: any;
  try { await fs.readText(resolved); return "exists"; } catch (e: any) { firstErr = e; }
  // **同类修复（v1.15.15）**：目录用 `readText` 必失败，于是「引用一个目录」会被判成缺失——
  // 实测语料里 `D:\project\wslc1`（11×）、`D:\project\dsh1\vendor\dsh-shadow`（8×）都真实存在却被判缺失。
  // 目录也是一种「还在不在」的合法答案，故补一次 `listDir` 判定（该 API 在本插件内广泛使用）。
  try { await fs.listDir(resolved); return "exists"; } catch (e: any) { firstErr = firstErr ?? e; }
  // **「确认不存在」与「读不出来」必须分开**（v1.15.57）：只有**明确的不存在**才算 missing；
  // 其余（EACCES / 后端异常）是**判不了** —— 旧实现一律 `return false`，于是「存在但不可读」
  // 被判成「证据失效」⇒ 召回 score×0.5 + stale（**假漂移**）。
  //
  // 判据要认**宿主契约自己的**标记：本仓的 fs 后端（`dsh-fs-local`）对不存在的路径抛
  // `FS_NOT_FOUND`（不是 `ENOENT`）—— 只看 ENOENT 会把「确认不存在」误判成「判不了」。
  // 见 `test/recall-attribution.test.ts:1363` 对宿主契约的忠实模拟说明。
  const code = String(firstErr?.code ?? "");
  const msg = String(firstErr?.message ?? firstErr ?? "");
  const definitelyMissing = /FS_NOT_FOUND|ENOENT|no such file|not exist/i.test(`${code} ${msg}`);
  return definitelyMissing ? "missing" : "undecidable";
};

export const fsEvidenceProvider: EvidenceProvider = {
  async discover(ref: GatewayEvidenceRef, ctx: any) {
    const state = await fsExists(ctx.fs, ctx.ws, ref.path);
    return state === "exists" ? [{ path: ref.path, route: "fs" }] : [];
  },
  async verify(ref: GatewayEvidenceRef, ctx: any): Promise<EvidenceResult> {
    const state = await fsExists(ctx.fs, ctx.ws, ref.path);
    // **判不了 ≠ 已核实**（v1.15.57）：`unavailable` 是既有状态，消费方已经会打印 reason、不计入 missing。
    if (state === "undecidable") {
      return { status: "unavailable", source: "fs", matches: [], confidence: 0, freshness: "stale", provenance: { provider: "fs", at: new Date().toISOString(), reason: "undecidable_input" } };
    }
    const exists = state === "exists";
    const matches: EvidenceMatch[] = exists ? [{ path: ref.path, route: "fs" }] : [];
    return { status: exists ? "verified" : "not_found", source: "fs", matches, confidence: exists ? 0.99 : 0.01, freshness: exists ? "fresh" : "stale", provenance: { provider: "fs", at: new Date().toISOString() } };
  },
};
