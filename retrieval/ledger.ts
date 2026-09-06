// dsh-shadow —— retrieval/ledger.ts：_recall_log.json 读写（Recall ledger / cooldown）。
// 派生物（Derived Artifact）：可由 Memory 重建；Memory 文件是 source of truth（ADR-0003 §3-7）。从 index.ts 迁出。
export const readLedger = async (fs: any, ws: string) => {
  if (!fs || !ws) return { turn: 0, served: {} };
  try {
    const t = await fs.resolve(`${ws}/shadow/_recall_log.json`, { cwd: ws });
    const txt = await fs.readText(t);
    return txt ? (JSON.parse(txt) || { turn: 0, served: {} }) : { turn: 0, served: {} };
  } catch {
    return { turn: 0, served: {} };
  }
};

export const writeLedger = async (fs: any, ws: string, data: any) => {
  if (!fs || !ws) return;
  try {
    const t = await fs.resolve(`${ws}/shadow/_recall_log.json`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(data));
  } catch (e: any) {
    console.log("[dsh-shadow] recall ledger write failed:", e && e.message);
  }
};
