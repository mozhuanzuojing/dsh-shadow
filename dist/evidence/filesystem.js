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
export const fsExists = async (fs, ws, rel) => {
    if (!fs || !rel)
        return true; // 无法判定时视为存在，避免误伤
    // 绝对 locator 直接查它自己；相对 locator 才拼工作区（无工作区 → 无法判定，视为存在）
    const target = isAbsoluteLocator(rel) ? String(rel) : (ws ? `${ws}/${rel}` : "");
    if (!target)
        return true;
    const resolved = await fs.resolve(target, { cwd: ws });
    try {
        await fs.readText(resolved);
        return true;
    }
    catch { /* 读不出：可能是目录，或真不存在 */ }
    // **同类修复（v1.15.15）**：目录用 `readText` 必失败，于是「引用一个目录」会被判成缺失——
    // 实测语料里 `D:\project\wslc1`（11×）、`D:\project\dsh1\vendor\dsh-shadow`（8×）都真实存在却被判缺失。
    // 目录也是一种「还在不在」的合法答案，故补一次 `listDir` 判定（该 API 在本插件内广泛使用）。
    try {
        await fs.listDir(resolved);
        return true;
    }
    catch {
        return false;
    }
};
export const fsEvidenceProvider = {
    async discover(ref, ctx) {
        const exists = await fsExists(ctx.fs, ctx.ws, ref.path);
        return exists ? [{ path: ref.path, route: "fs" }] : [];
    },
    async verify(ref, ctx) {
        const exists = await fsExists(ctx.fs, ctx.ws, ref.path);
        const matches = exists ? [{ path: ref.path, route: "fs" }] : [];
        return { status: exists ? "verified" : "not_found", source: "fs", matches, confidence: exists ? 0.99 : 0.01, freshness: exists ? "fresh" : "stale", provenance: { provider: "fs", at: new Date().toISOString() } };
    },
};
