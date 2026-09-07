// dsh-shadow —— validation/evidence.ts：FutureEvidence + Hypothesis 存取（独立存储，Memory ≠ Evidence）。
// .shadow/future-evidence/<id>.json；.shadow/hypothesis/<id>.json（dream 产出的假设，读侧供 validate）。
import { SHADOW_ROOT } from "../core/paths.js";
import { today } from "../core/util.js";
export const writeHypothesis = async (fs, ws, h) => {
    try {
        const rel = `${SHADOW_ROOT}/hypothesis/${h.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(h));
    }
    catch (e) {
        console.log("[dsh-shadow] hypothesis write failed:", e && e.message);
    }
};
export const readHypothesis = async (fs, ws, id) => {
    try {
        const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/hypothesis/${id}.json`, { cwd: ws });
        return JSON.parse(await fs.readText(t));
    }
    catch {
        return null;
    }
};
export const registerFutureEvidence = async (fs, ws, ev) => {
    const id = ev.id || `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const full = { ...ev, sourceTraceIds: ev.sourceTraceIds || [], id, createdAt: ev.createdAt || today() };
    try {
        const rel = `${SHADOW_ROOT}/future-evidence/${id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(full));
    }
    catch (e) {
        console.log("[dsh-shadow] future evidence write failed:", e && e.message);
    }
    return full;
};
export const readFutureEvidence = async (fs, ws, hypothesisId) => {
    const out = [];
    try {
        const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/future-evidence`, { cwd: ws });
        const files = (await fs.listDir(root).catch(() => [])) || [];
        for (const f of files) {
            if (!f?.name || !f.name.endsWith(".json"))
                continue;
            const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/future-evidence/${f.name}`, { cwd: ws });
            const ev = JSON.parse(await fs.readText(p));
            if (hypothesisId && ev.hypothesisId !== hypothesisId)
                continue;
            out.push(ev);
        }
    }
    catch { /* 无 future-evidence 目录 */ }
    return out;
};
