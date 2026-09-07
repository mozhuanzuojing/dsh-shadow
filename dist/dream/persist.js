// dsh-shadow —— dream/persist.ts：DreamArtifact 持久化（.shadow/dream/<date>/dream.json，非 memory）。
import { SHADOW_ROOT } from "../core/paths.js";
import { today } from "../core/util.js";
export const writeDream = async (fs, ws, artifact) => {
    try {
        const rel = `${SHADOW_ROOT}/dream/${today()}/dream.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(artifact, null, 2));
    }
    catch (e) {
        console.log("[dsh-shadow] dream write failed (bypath):", e && e.message);
    }
};
