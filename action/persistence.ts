// dsh-shadow —— action/persistence.ts：Action 记录持久化（ActionExecution/Feedback 是事件，进 .shadow/action/）。
import { SHADOW_ROOT } from "../core/paths.js";
import type { ActionExecution, ActionFeedback } from "./types.js";
import { today } from "../core/util.js";

export const writeExecution = async (fs: any, ws: string, e: ActionExecution) => {
  try { const rel = `${SHADOW_ROOT}/action/${today()}/exec-${e.id}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(e)); } catch (err: any) { console.log("[dsh-shadow] action exec write failed:", err && err.message); }
};
export const writeFeedback = async (fs: any, ws: string, f: ActionFeedback) => {
  try { const rel = `${SHADOW_ROOT}/action/${today()}/feedback-${f.executionId}.json`; const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(f)); } catch (err: any) { console.log("[dsh-shadow] action feedback write failed:", err && err.message); }
};
