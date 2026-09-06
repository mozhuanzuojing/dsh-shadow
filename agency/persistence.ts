// dsh-shadow —— agency/persistence.ts：Agency 记录持久化（context 快照 + boundary event 进 shadow/agency/）。
import type { AgencyContext, AgencyBoundaryEvent } from "./types.js";
import { today } from "../core/util.js";

export const writeAgencyContext = async (fs: any, ws: string, ctx: AgencyContext) => {
  try {
    const rel = `shadow/agency/${today()}/context-${ctx.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(ctx));
  } catch (err: any) {
    console.log("[dsh-shadow] agency context write failed:", err && err.message);
  }
};

export const writeAgencyEvent = async (fs: any, ws: string, e: AgencyBoundaryEvent) => {
  try {
    const rel = `shadow/agency/${today()}/event-${e.actionCandidate}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(e));
  } catch (err: any) {
    console.log("[dsh-shadow] agency event write failed:", err && err.message);
  }
};
