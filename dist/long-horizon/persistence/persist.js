import { today } from "../../core/util.js";
export const writeInteractionContext = async (fs, ws, c) => {
    try {
        const rel = `shadow/horizon/${today()}/context-${c.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(c));
    }
    catch (err) {
        console.log("[dsh-shadow] horizon context write failed:", err && err.message);
    }
};
export const writeHistorySummary = async (fs, ws, s) => {
    try {
        const rel = `shadow/horizon/${today()}/summary-${s.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(s));
    }
    catch (err) {
        console.log("[dsh-shadow] horizon summary write failed:", err && err.message);
    }
};
export const writeContinuityEvent = async (fs, ws, e) => {
    try {
        const rel = `shadow/horizon/${today()}/event-${e.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(e));
    }
    catch (err) {
        console.log("[dsh-shadow] horizon event write failed:", err && err.message);
    }
};
export const writeInteractionAdaptationLink = async (fs, ws, l) => {
    try {
        const rel = `shadow/horizon/${today()}/link-${l.historyRef}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(l));
    }
    catch (err) {
        console.log("[dsh-shadow] horizon link write failed:", err && err.message);
    }
};
