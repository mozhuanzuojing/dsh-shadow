import { SHADOW_ROOT } from "../core/paths.js";
import { isNotFound } from "../core/util.js";
export const readLedger = async (fs, ws) => {
    if (!fs || !ws)
        return { turn: 0, served: {} };
    // v1.15.94：**读与解析分成两段** —— 旧版把 `resolve`/`readText`/`JSON.parse` 全塞进**一个** `try`，
    // 于是「文件不存在」（真实 fs 对不存在的路径 `readText` **抛**，宿主是 `FS_NOT_FOUND`）
    // 与「读失败」落进**同一个** `catch` ⇒ 全新工作区上永远报 `unreadable`。
    // 后果不是「少了一行提示」而是判据反转：真正「还没有台账」这一支（下一行的 `if (!txt)`）
    // 在真实 fs 下**是死代码**，而每回合都留下一条**假的**降级痕迹。
    let txt;
    try {
        const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_recall_log.json`, { cwd: ws });
        txt = await fs.readText(t);
    }
    catch (e) {
        // **不存在 ≠ 读不出来**（ADR-0049 是「缺件不静默」，而「还没有」本来就不算缺件）：
        // 判据复用 `core/util.ts` 的 `isNotFound`（认宿主自己的 `FS_NOT_FOUND`）。
        // 判不出「不存在」的一切异常（EACCES / 后端异常）**仍然**走 `unreadable` —— 修的是误报，不是把信号关掉。
        if (isNotFound(e))
            return { turn: 0, served: {} }; // 真的还没有台账（全新工作区）
        // v1.15.65：旧版这个 `catch` **什么都不带**地回落空台账 —— 「读不到台账」与「还没有台账」
        // 给出**完全相同**的结果，`turn` 从 0 重新计数 ⇒ 冷却窗口整体作废，而读者看不到。
        return { turn: 0, served: {}, unreadable: true, error: (e && e.message) || String(e) };
    }
    if (!txt)
        return { turn: 0, served: {} }; // 文件为空 = 真的还没有台账
    try {
        const parsed = JSON.parse(txt);
        if (!parsed || typeof parsed !== "object" || !parsed.served)
            return { turn: 0, served: {}, corrupt: true };
        return parsed;
    }
    catch {
        console.log("[dsh-shadow] _recall_log.json **坏件**（无法解析）：本次按空台账处理 ⇒ **冷却状态可能失效**，请人工修复");
        return { turn: 0, served: {}, corrupt: true };
    }
};
export const writeLedger = async (fs, ws, data) => {
    if (!fs || !ws)
        return false; // 没写成功就不算成功（旧版是 `return;`，调用方无从判断）
    try {
        const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_recall_log.json`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(data));
        return true;
    }
    catch (e) {
        console.log("[dsh-shadow] recall ledger write failed:", e && e.message);
        return false;
    }
};
