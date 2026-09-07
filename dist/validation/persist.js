// dsh-shadow —— validation/persist.ts：ValidationArtifact 持久化（.shadow/validation/<id>.json，不覆盖 Hypothesis）。
import { SHADOW_ROOT } from "../core/paths.js";
export const writeValidation = async (fs, ws, va) => {
    try {
        const rel = `${SHADOW_ROOT}/validation/${va.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(va));
    }
    catch (e) {
        console.log("[dsh-shadow] validation write failed:", e && e.message);
    }
};
