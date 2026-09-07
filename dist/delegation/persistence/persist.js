// dsh-shadow —— delegation/persistence/persist.ts：委派记录持久化（context + boundary event 进 .shadow/delegation/）。
import { SHADOW_ROOT } from "../../core/paths.js";
import { today } from "../../core/util.js";
export const writeDelegationContext = async (fs, ws, ctx) => {
    try {
        const rel = `${SHADOW_ROOT}/delegation/${today()}/delegation-${ctx.delegationId}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(ctx));
    }
    catch (err) {
        console.log("[dsh-shadow] delegation context write failed:", err && err.message);
    }
};
export const readDelegationContext = async (fs, ws, delegationId) => {
    try {
        const rel = `${SHADOW_ROOT}/delegation/${today()}/delegation-${delegationId}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        const raw = await fs.readText(t);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
};
export const writeDelegationEvent = async (fs, ws, e) => {
    try {
        const rel = `${SHADOW_ROOT}/delegation/${today()}/event-${e.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(e));
    }
    catch (err) {
        console.log("[dsh-shadow] delegation event write failed:", err && err.message);
    }
};
