// dsh-shadow —— recall/persistence/persist.ts：Recall 记录持久化（ForgottenRecord + RecallEvent 进 .shadow/recall/）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { ForgottenRecord, RecallEvent } from "../types/index.js";
import { today } from "../../core/util.js";

export const writeForgottenRecord = async (fs: any, ws: string, r: ForgottenRecord) => {
  try {
    const rel = `${SHADOW_ROOT}/recall/${today()}/forgotten-${r.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(r));
  } catch (err: any) {
    console.log("[dsh-shadow] recall forgotten write failed:", err && err.message);
  }
};

export const readForgottenRecord = async (fs: any, ws: string, id: string): Promise<ForgottenRecord | null> => {
  try {
    const rel = `${SHADOW_ROOT}/recall/${today()}/forgotten-${id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    const raw = await fs.readText(t);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeRecallEvent = async (fs: any, ws: string, e: RecallEvent) => {
  try {
    const rel = `${SHADOW_ROOT}/recall/${today()}/event-${e.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(e));
  } catch (err: any) {
    console.log("[dsh-shadow] recall event write failed:", err && err.message);
  }
};
