import { SHADOW_ROOT } from "../core/paths.js";
export const readLedger = async (fs, ws) => {
    if (!fs || !ws)
        return { turn: 0, served: {} };
    try {
        const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_recall_log.json`, { cwd: ws });
        const txt = await fs.readText(t);
        if (!txt)
            return { turn: 0, served: {} }; // 文件为空/不存在 = 真的还没有台账
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
    }
    catch (e) {
        // v1.15.65：旧版这个 `catch` **什么都不带**地回落空台账 —— 「读不到台账」与「还没有台账」
        // 给出**完全相同**的结果，`turn` 从 0 重新计数 ⇒ 冷却窗口整体作废，而读者看不到。
        return { turn: 0, served: {}, unreadable: true, error: (e && e.message) || String(e) };
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
