import { today } from "../core/util.js";
export const writeExecution = async (fs, ws, e) => {
    try {
        const rel = `.shadow/action/${today()}/exec-${e.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(e));
    }
    catch (err) {
        console.log("[dsh-shadow] action exec write failed:", err && err.message);
    }
};
export const writeFeedback = async (fs, ws, f) => {
    try {
        const rel = `.shadow/action/${today()}/feedback-${f.executionId}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(f));
    }
    catch (err) {
        console.log("[dsh-shadow] action feedback write failed:", err && err.message);
    }
};
