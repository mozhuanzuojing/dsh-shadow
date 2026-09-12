import { SHADOW_ROOT } from "../core/paths.js";

// dsh-shadow —— retrieval/ledger.ts：_recall_log.json 读写（Recall ledger / cooldown）。
// 派生物（Derived Artifact）：可由 Memory 重建；Memory 文件是 source of truth（ADR-0003 §3-7）。从 index.ts 迁出。
//
// v1.15.55：**坏件 ≠ 空件**（ADR-0049 / adr/0083）。旧版把「读失败/解析失败」静默变成
// `{ turn: 0, served: {} }`，与「第一次运行」**完全不可区分** ⇒ 冷却状态静默清零、
// **已经冷却过的记忆被重新返回**，而读的人看不出任何异常。现在坏件会带 `corrupt` 标记并留痕。
export const readLedger = async (fs: any, ws: string) => {
  if (!fs || !ws) return { turn: 0, served: {} };
  try {
    const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_recall_log.json`, { cwd: ws });
    const txt = await fs.readText(t);
    if (!txt) return { turn: 0, served: {} }; // 文件为空/不存在 = 真的还没有台账
    try {
      const parsed = JSON.parse(txt);
      if (!parsed || typeof parsed !== "object" || !parsed.served) return { turn: 0, served: {}, corrupt: true };
      return parsed;
    } catch {
      console.log("[dsh-shadow] _recall_log.json **坏件**（无法解析）：本次按空台账处理 ⇒ **冷却状态可能失效**，请人工修复");
      return { turn: 0, served: {}, corrupt: true };
    }
  } catch {
    return { turn: 0, served: {} };
  }
};

export const writeLedger = async (fs: any, ws: string, data: any): Promise<boolean> => {
  if (!fs || !ws) return false; // 没写成功就不算成功（旧版是 `return;`，调用方无从判断）
  try {
    const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_recall_log.json`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(data));
    return true;
  } catch (e: any) {
    console.log("[dsh-shadow] recall ledger write failed:", e && e.message);
    return false;
  }
};
