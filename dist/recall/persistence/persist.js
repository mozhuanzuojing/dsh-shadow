import { today } from "../../core/util.js";
export const writeForgottenRecord = async (fs, ws, r) => {
    try {
        const rel = `shadow/recall/${today()}/forgotten-${r.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(r));
    }
    catch (err) {
        console.log("[dsh-shadow] recall forgotten write failed:", err && err.message);
    }
};
export const readForgottenRecord = async (fs, ws, id) => {
    try {
        const rel = `shadow/recall/${today()}/forgotten-${id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        const raw = await fs.readText(t);
        return raw ? JSON.parse(raw) : null;
    }
    catch {
        return null;
    }
};
export const writeRecallEvent = async (fs, ws, e) => {
    try {
        const rel = `shadow/recall/${today()}/event-${e.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(e));
    }
    catch (err) {
        console.log("[dsh-shadow] recall event write failed:", err && err.message);
    }
};
