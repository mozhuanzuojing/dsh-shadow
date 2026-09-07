import { today } from "../core/util.js";
export const writeAgencyContext = async (fs, ws, ctx) => {
    try {
        const rel = `.shadow/agency/${today()}/context-${ctx.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(ctx));
    }
    catch (err) {
        console.log("[dsh-shadow] agency context write failed:", err && err.message);
    }
};
export const writeAgencyEvent = async (fs, ws, e) => {
    try {
        const rel = `.shadow/agency/${today()}/event-${e.actionCandidate}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(e));
    }
    catch (err) {
        console.log("[dsh-shadow] agency event write failed:", err && err.message);
    }
};
