import { today } from "../../core/util.js";
export const writeAdaptationContext = async (fs, ws, c) => {
    try {
        const rel = `shadow/adapt/${today()}/context-${c.sourceExperience}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(c));
    }
    catch (err) {
        console.log("[dsh-shadow] adapt context write failed:", err && err.message);
    }
};
export const writeAdaptationChange = async (fs, ws, ch) => {
    try {
        const rel = `shadow/adapt/${today()}/change-${ch.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(ch));
    }
    catch (err) {
        console.log("[dsh-shadow] adapt change write failed:", err && err.message);
    }
};
export const writeAdaptationValidation = async (fs, ws, v) => {
    try {
        const rel = `shadow/adapt/${today()}/validation-${Date.now()}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(v));
    }
    catch (err) {
        console.log("[dsh-shadow] adapt validation write failed:", err && err.message);
    }
};
