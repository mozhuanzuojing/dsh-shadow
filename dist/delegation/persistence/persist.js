import { today } from "../../core/util.js";
export const writeDelegationContext = async (fs, ws, ctx) => {
    try {
        const rel = `.shadow/delegation/${today()}/delegation-${ctx.delegationId}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(ctx));
    }
    catch (err) {
        console.log("[dsh-shadow] delegation context write failed:", err && err.message);
    }
};
export const readDelegationContext = async (fs, ws, delegationId) => {
    try {
        const rel = `.shadow/delegation/${today()}/delegation-${delegationId}.json`;
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
        const rel = `.shadow/delegation/${today()}/event-${e.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(e));
    }
    catch (err) {
        console.log("[dsh-shadow] delegation event write failed:", err && err.message);
    }
};
