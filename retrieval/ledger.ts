import { SHADOW_ROOT } from "../core/paths.js";

// dsh-shadow —— retrieval/ledger.ts：_recall_log.json 读写（Recall ledger / cooldown）。
// 派生物（Derived Artifact）：可由 Memory 重建；Memory 文件是 source of truth（ADR-0003 §3-7）。从 index.ts 迁出。
//
// v1.15.55：**坏件 ≠ 空件**（ADR-0049 / adr/0083）。旧版把「读失败/解析失败」静默变成
// `{ turn: 0, served: {} }`，与「第一次运行」**完全不可区分** ⇒ 冷却状态静默清零、
// **已经冷却过的记忆被重新返回**，而读的人看不出任何异常。现在坏件会带 `corrupt` 标记并留痕。
//
// v1.15.65（T8-A）：**标记还不够** —— 上一版留下的 `corrupt: true` 与 `console.log`
// **没有任何消费者**（`query/query.ts` 读了台账却丢掉这个字段），而 `console.log`
// 本来就不算 ADR-0049 认可的可见信号 ⇒ 缺陷仍然存在，只是从「静默」变成「留了个没人看的记号」。
// 本版把三种失败**分别**标出来（`corrupt` / `unreadable` / `writeFailed`）并全部由调用点
// 经 `deps.noteDegrade` 上横幅。
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

export const readLedger = async (fs: any, ws: string): Promise<LedgerRead> => {
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
  } catch (e: any) {
    // v1.15.65：旧版这个 `catch` **什么都不带**地回落空台账 —— 「读不到台账」与「还没有台账」
    // 给出**完全相同**的结果，`turn` 从 0 重新计数 ⇒ 冷却窗口整体作废，而读者看不到。
    return { turn: 0, served: {}, unreadable: true, error: (e && e.message) || String(e) };
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
