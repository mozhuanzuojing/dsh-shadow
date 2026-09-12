// dsh-shadow —— federation/reality.ts：G2 Reality Evidence Registry（弱事实，append-only，Observer 只能引用不能拥有）。
import { SHADOW_ROOT } from "../core/paths.js";
import { today } from "../core/util.js";
export const registerRealityEvidence = async (fs, ws, ev) => {
    const full = {
        id: `re-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        observedAt: ev.observedAt || today(),
        source: ev.source,
        observation: ev.observation, // 弱事实："某事件在某时间被观察到"
        linkedHypothesis: ev.linkedHypothesis || [],
        referencedBy: [],
        status: "observed",
    };
    try {
        const rel = `${SHADOW_ROOT}/reality/${full.id}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(full));
        return { evidence: full, persisted: true };
    }
    catch (e) {
        console.log("[dsh-shadow] reality evidence write failed:", e && e.message);
        return { evidence: full, persisted: false }; // **没落盘就说没落盘**（旧版照常渲染成功）
    }
};
/**
 * 给一条 reality evidence 追加 `referencedBy`。
 *
 * 返回**带原因的三态**（v1.15.61）：旧版把所有异常压成 `null`，调用方渲染成
 * 「（无 reality evidence X）」—— **把「工具报错/坏件」当成「不存在」**。
 * 一条存在的证据若因缺 `referencedBy` 字段（旧版本/手工编辑）而抛错，读的人会以为它根本没被登记过。
 */
export const referenceEvidence = async (fs, ws, id, observerId) => {
    let txt = "";
    try {
        const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality/${id}.json`, { cwd: ws });
        txt = await fs.readText(t);
    }
    catch (e) {
        const msg = String(e?.message ?? e ?? "");
        return { evidence: null, reason: /ENOENT|FS_NOT_FOUND|not exist/i.test(msg) ? "not_found" : "unreadable" };
    }
    try {
        const ev = JSON.parse(txt);
        if (!ev || !Array.isArray(ev.referencedBy))
            return { evidence: null, reason: "unreadable" }; // 形状不对 = 坏件
        // append-only：只追加 referencedBy，不改 observation/observedAt（弱事实不可篡改）
        if (!ev.referencedBy.includes(observerId))
            ev.referencedBy.push(observerId);
        const t2 = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality/${id}.json`, { cwd: ws });
        await fs.writeText(t2, JSON.stringify(ev));
        return { evidence: ev };
    }
    catch {
        return { evidence: null, reason: "unreadable" };
    }
};
/** 读全部 reality evidence，并**区分「还没有」与「读不出」**（v1.15.61，与 registry/claims 同型）。 */
export const readRealityEvidenceDetailed = async (fs, ws) => {
    const out = [];
    let corrupt = 0;
    try {
        const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality`, { cwd: ws });
        const files = (await fs.listDir(root).catch(() => [])) || [];
        for (const f of files) {
            if (!f?.name || !f.name.endsWith(".json"))
                continue;
            try {
                const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality/${f.name}`, { cwd: ws });
                out.push(JSON.parse(await fs.readText(p)));
            }
            catch {
                corrupt += 1;
                console.log(`[dsh-shadow] reality evidence 坏件（已跳过并计数）：${f.name}`);
            }
        }
    }
    catch { /* 无 reality 目录（真的还没有） */ }
    return { evidence: out, corrupt };
};
export const readRealityEvidence = async (fs, ws) => (await readRealityEvidenceDetailed(fs, ws)).evidence;
export const renderRealityEvidence = (ev) => {
    const lines = ["[Reality Evidence]"];
    lines.push(`id ${ev.id} · ${ev.observedAt} · source ${ev.source}`);
    lines.push(`observation ${ev.observation}（弱事实：只记录观察到，不解释规律）`);
    lines.push(`linkedHypothesis ${ev.linkedHypothesis.join("、") || "—"} · referencedBy ${ev.referencedBy.join("、") || "—"} status ${ev.status}`);
    return lines.join("\n");
};
