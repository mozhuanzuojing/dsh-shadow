// dsh-shadow —— validation/evidence.ts：FutureEvidence + Hypothesis 存取（独立存储，Memory ≠ Evidence）。
// shadow/future-evidence/<id>.json；shadow/hypothesis/<id>.json（dream 产出的假设，读侧供 validate）。
import type { FutureEvidence } from "./types.js";
import type { Hypothesis } from "../dream/types.js";
import { today } from "../core/util.js";

export const writeHypothesis = async (fs: any, ws: string, h: Hypothesis) => {
  try {
    const rel = `shadow/hypothesis/${h.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(h));
  } catch (e: any) { console.log("[dsh-shadow] hypothesis write failed:", e && e.message); }
};

export const readHypothesis = async (fs: any, ws: string, id: string): Promise<Hypothesis | null> => {
  try {
    const t = await fs.resolve(`${ws}/shadow/hypothesis/${id}.json`, { cwd: ws });
    return JSON.parse(await fs.readText(t));
  } catch { return null; }
};

export const registerFutureEvidence = async (fs: any, ws: string, ev: { hypothesisId: string; observedAt: string; actualOutcome: string; observationType: string; sourceTraceIds?: string[]; createdAt?: string; id?: string }): Promise<FutureEvidence> => {
  const id = ev.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const full: FutureEvidence = { ...ev, sourceTraceIds: ev.sourceTraceIds || [], id, createdAt: ev.createdAt || today() } as FutureEvidence;
  try {
    const rel = `shadow/future-evidence/${id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(full));
  } catch (e: any) { console.log("[dsh-shadow] future evidence write failed:", e && e.message); }
  return full;
};

export const readFutureEvidence = async (fs: any, ws: string, hypothesisId?: string): Promise<FutureEvidence[]> => {
  const out: FutureEvidence[] = [];
  try {
    const root = await fs.resolve(`${ws}/shadow/future-evidence`, { cwd: ws });
    const files = (await fs.listDir(root).catch(() => [])) || [];
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".json")) continue;
      const p = await fs.resolve(`${ws}/shadow/future-evidence/${f.name}`, { cwd: ws });
      const ev = JSON.parse(await fs.readText(p));
      if (hypothesisId && ev.hypothesisId !== hypothesisId) continue;
      out.push(ev);
    }
  } catch { /* 无 future-evidence 目录 */ }
  return out;
};
