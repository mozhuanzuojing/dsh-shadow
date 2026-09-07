// dsh-shadow —— long-horizon/persistence/persist.ts：长期交互记录持久化（context/summary/event/link 进 .shadow/horizon/）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { InteractionContext, HistorySummary, HistoryContinuityEvent, InteractionAdaptationLink } from "../types/index.js";
import { today } from "../../core/util.js";

export const writeInteractionContext = async (fs: any, ws: string, c: InteractionContext) => {
  try { const rel = `${SHADOW_ROOT}/horizon/${today()}/context-${c.id}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(c)); } catch (err: any) { console.log("[dsh-shadow] horizon context write failed:", err && err.message); }
};
export const writeHistorySummary = async (fs: any, ws: string, s: HistorySummary) => {
  try { const rel = `${SHADOW_ROOT}/horizon/${today()}/summary-${s.id}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(s)); } catch (err: any) { console.log("[dsh-shadow] horizon summary write failed:", err && err.message); }
};
export const writeContinuityEvent = async (fs: any, ws: string, e: HistoryContinuityEvent) => {
  try { const rel = `${SHADOW_ROOT}/horizon/${today()}/event-${e.id}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(e)); } catch (err: any) { console.log("[dsh-shadow] horizon event write failed:", err && err.message); }
};
export const writeInteractionAdaptationLink = async (fs: any, ws: string, l: InteractionAdaptationLink) => {
  try { const rel = `${SHADOW_ROOT}/horizon/${today()}/link-${l.historyRef}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(l)); } catch (err: any) { console.log("[dsh-shadow] horizon link write failed:", err && err.message); }
};
