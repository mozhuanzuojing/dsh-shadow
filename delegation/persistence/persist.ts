// dsh-shadow —— delegation/persistence/persist.ts：委派记录持久化（context + boundary event 进 .shadow/delegation/）。
import type { DelegationContext } from "../types/context.js";
import type { AutonomyBoundaryEvent } from "../types/event.js";
import { today } from "../../core/util.js";

export const writeDelegationContext = async (fs: any, ws: string, ctx: DelegationContext) => {
  try {
    const rel = `.shadow/delegation/${today()}/delegation-${ctx.delegationId}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(ctx));
  } catch (err: any) {
    console.log("[dsh-shadow] delegation context write failed:", err && err.message);
  }
};

export const readDelegationContext = async (fs: any, ws: string, delegationId: string): Promise<DelegationContext | null> => {
  try {
    const rel = `.shadow/delegation/${today()}/delegation-${delegationId}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    const raw = await fs.readText(t);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const writeDelegationEvent = async (fs: any, ws: string, e: AutonomyBoundaryEvent) => {
  try {
    const rel = `.shadow/delegation/${today()}/event-${e.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(e));
  } catch (err: any) {
    console.log("[dsh-shadow] delegation event write failed:", err && err.message);
  }
};
