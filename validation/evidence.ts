// dsh-shadow —— validation/evidence.ts：FutureEvidence + Hypothesis 存取（独立存储，Memory ≠ Evidence）。
// .shadow/future-evidence/<id>.json；.shadow/hypothesis/<id>.json（dream 产出的假设，读侧供 validate）。
import { SHADOW_ROOT } from "../core/paths.js";
import type { FutureEvidence } from "./types.js";
import type { Hypothesis } from "../dream/types.js";
import { today } from "../core/util.js";

/**
 * 写一条 hypothesis。**返回是否真的落盘**（v1.15.55）。
 *
 * 旧版只 `console.log` 就返回 ⇒ 调用方随后照样播报「生成了 N 条假设」，
 * 而磁盘上可能 0 条；之后 `mode:validate` 会回「无 hypothesis」，
 * 使用者看到的是「假设消失了」而不是「当时就没写下去」。
 */
export const writeHypothesis = async (fs: any, ws: string, h: Hypothesis): Promise<boolean> => {
  try {
    const rel = `${SHADOW_ROOT}/hypothesis/${h.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(h));
    return true;
  } catch (e: any) {
    console.log("[dsh-shadow] hypothesis write failed:", e && e.message);
    return false;
  }
};

export const readHypothesis = async (fs: any, ws: string, id: string): Promise<Hypothesis | null> => {
  try {
    const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/hypothesis/${id}.json`, { cwd: ws });
    return JSON.parse(await fs.readText(t));
  } catch { return null; }
};

/**
 * 登记一条 FutureEvidence。返回**证据本体 + 是否真的落盘**（v1.15.55）。
 *
 * 旧版落盘失败也返回 `full` ⇒ 调用方播报 `[Evidence] registered <id>` 当成功，
 * 之后 `mode:validate` 读不到它 ⇒ `applied` 变小、结论从 validated 掉回 observed/rejected，
 * 而且**没有任何地方说明为什么**。
 */
export const registerFutureEvidence = async (fs: any, ws: string, ev: { hypothesisId: string; observedAt: string; actualOutcome: string; observationType: string; sourceTraceIds?: string[]; createdAt?: string; id?: string }): Promise<{ evidence: FutureEvidence; persisted: boolean }> => {
  const id = ev.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const full: FutureEvidence = { ...ev, sourceTraceIds: ev.sourceTraceIds || [], id, createdAt: ev.createdAt || today() } as FutureEvidence;
  try {
    const rel = `${SHADOW_ROOT}/future-evidence/${id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(full));
    return { evidence: full, persisted: true };
  } catch (e: any) {
    console.log("[dsh-shadow] future evidence write failed:", e && e.message);
    return { evidence: full, persisted: false };
  }
};

export const readFutureEvidence = async (fs: any, ws: string, hypothesisId?: string): Promise<FutureEvidence[]> => {
  const out: FutureEvidence[] = [];
  try {
    const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/future-evidence`, { cwd: ws });
    const files = (await fs.listDir(root).catch(() => [])) || [];
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".json")) continue;
      const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/future-evidence/${f.name}`, { cwd: ws });
      const ev = JSON.parse(await fs.readText(p));
      if (hypothesisId && ev.hypothesisId !== hypothesisId) continue;
      out.push(ev);
    }
  } catch { /* 无 future-evidence 目录 */ }
  return out;
};
