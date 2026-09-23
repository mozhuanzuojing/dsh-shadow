// dsh-shadow —— retrieval/cooldown.ts：主题召回冷却政策（prepare + 过滤 + 提交）。
// 两拍跨渲染前后：filter 看历史 detail；commit 吃本回合 servedDetail（≠ servedRels，ADR-0067）。
// cooldownTurns===0：不读台账，turn 恒为 1（现语义，不是 bug）。
import { readLedger, writeLedger, type LedgerRead } from "./ledger.js";

export type NoteDegrade = (capability: string, what: string, consequence: string) => void;

export interface CooldownPrepared {
  ledger: LedgerRead;
  turn: number;
}

/** 读台账 / 算 turn / 坏件留痕。关冷却时不读盘，turn≡1。 */
export const prepareCooldown = async (
  fs: any,
  ws: string,
  cooldownTurns: number,
  noteDegrade?: NoteDegrade,
): Promise<CooldownPrepared> => {
  const ledger: LedgerRead = cooldownTurns > 0
    ? await readLedger(fs, ws)
    : { turn: 0, served: {} };
  if (cooldownTurns > 0) {
    if (ledger.corrupt) {
      noteDegrade?.(
        "recallLedger",
        "_recall_log.json **坏件**（无法解析或结构不对）",
        "本次按空台账处理 ⇒ **冷却状态可能失效**：已经冷却过的记忆会被重新返回，`recall.cooldownTurns` 事实上没生效。**另注**：本回合若走到写台账那一步，会把这份坏件**覆盖**掉（其内容已无法解析，但手工抢救的机会同时消失）",
      );
    } else if (ledger.unreadable) {
      noteDegrade?.(
        "recallLedger",
        `_recall_log.json **读不到**（${ledger.error || "原因未知"}）`,
        "本次按空台账处理且 `turn` 从 0 重算 ⇒ 冷却窗口整体作废，与「第一次运行」不可区分",
      );
    }
  }
  const turn = (ledger.turn || 0) + 1;
  return { ledger, turn };
};

export interface FilterCooledResult {
  available: any[];
  cooledCount: number;
  cooledRels: string[];
}

/** 按台账 detail 窗口滤掉仍在冷却中的命中。 */
export const filterCooled = (
  scored: any[],
  ledger: LedgerRead,
  turn: number,
  cooldownTurns: number,
): FilterCooledResult => {
  const available: any[] = [];
  const cooledRels: string[] = [];
  let cooledCount = 0;
  for (const s of scored) {
    const rec = ledger.served && ledger.served[s.mm.rel];
    const cooled = cooldownTurns > 0 && rec && rec.detail && typeof rec.turn === "number" && turn - rec.turn <= cooldownTurns;
    if (cooled) {
      cooledRels.push(s.mm.rel);
      cooledCount++;
      continue;
    }
    available.push(s);
  }
  return { available, cooledCount, cooledRels };
};

/** 把本回合 servedDetail 写入冷却台账（仅 cooldownTurns>0 且 detail 非空时真写）。 */
export const commitDetailCooldown = async (
  fs: any,
  ws: string,
  ledger: LedgerRead,
  turn: number,
  servedDetail: readonly string[],
  cooldownTurns: number,
  noteDegrade?: NoteDegrade,
): Promise<void> => {
  if (!(cooldownTurns > 0 && servedDetail.length)) return;
  const nextServed = Object.assign({}, ledger.served || {});
  for (const p of servedDetail) nextServed[p] = { turn, detail: true };
  for (const k of Object.keys(nextServed)) {
    if (turn - nextServed[k].turn > cooldownTurns * 4) delete nextServed[k];
  }
  const keys = Object.keys(nextServed);
  if (keys.length > 500) {
    keys.sort((a, b) => (nextServed[a].turn || 0) - (nextServed[b].turn || 0)).slice(0, keys.length - 500).forEach((k) => delete nextServed[k]);
  }
  const ledgerWritten = await writeLedger(fs, ws, { turn, served: nextServed });
  if (!ledgerWritten) {
    noteDegrade?.(
      "recallLedger",
      "_recall_log.json **写失败**",
      "本次的冷却状态**没有保存**：下回合 `turn` 递进会从头再算，同一条记忆可能被反复返回（`recall.cooldownTurns` 失效）",
    );
  }
};
