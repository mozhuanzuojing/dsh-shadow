// dsh-shadow —— adaptation/persistence/persist.ts：Adaptation 记录持久化（context/change/validation 进 shadow/adapt/）。
import type { AdaptationContext, AdaptationChange, AdaptationValidation } from "../types/index.js";
import { today } from "../../core/util.js";

export const writeAdaptationContext = async (fs: any, ws: string, c: AdaptationContext) => {
  try { const rel = `shadow/adapt/${today()}/context-${c.sourceExperience}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(c)); } catch (err: any) { console.log("[dsh-shadow] adapt context write failed:", err && err.message); }
};
export const writeAdaptationChange = async (fs: any, ws: string, ch: AdaptationChange) => {
  try { const rel = `shadow/adapt/${today()}/change-${ch.id}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(ch)); } catch (err: any) { console.log("[dsh-shadow] adapt change write failed:", err && err.message); }
};
export const writeAdaptationValidation = async (fs: any, ws: string, v: AdaptationValidation) => {
  try { const rel = `shadow/adapt/${today()}/validation-${Date.now()}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(v)); } catch (err: any) { console.log("[dsh-shadow] adapt validation write failed:", err && err.message); }
};
