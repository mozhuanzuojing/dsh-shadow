import { assertObserverLayerClean, assertObserverLayerNoWorkspaceFact, assertConfigNotPreference, assertRecallIndexNav, assertWorkspaceIsolated, argsHasForbiddenContent } from "./guard.js";
import { readObserverBoundary, readRecallIndex, readLineage } from "./persist.js";
import { today } from "../core/util.js";
const cleanGuard = (obj) => {
    const a = assertObserverLayerClean(obj);
    if (!a.ok)
        return { ok: false, reason: a.reason };
    const b = assertObserverLayerNoWorkspaceFact(obj);
    if (!b.ok)
        return { ok: false, reason: b.reason };
    return { ok: true };
};
export const buildObserverConfig = (args) => {
    if (argsHasForbiddenContent(args))
        return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
    const config = { interactionStyle: String(args?.interactionStyle || "default"), outputPreference: String(args?.outputPreference || "adr"), defaultProtocol: String(args?.defaultProtocol || "boundary-first") };
    const c = cleanGuard(config);
    if (!c.ok)
        return { ok: false, reason: c.reason };
    const p = assertConfigNotPreference(config);
    if (!p.ok)
        return { ok: false, reason: p.reason };
    return { ok: true, config };
};
export const buildObserverBoundary = (args) => {
    if (argsHasForbiddenContent(args))
        return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
    const boundary = { planningCannotCreateObjective: Boolean(args?.planningCannotCreateObjective), recallCannotCreateKnowledge: Boolean(args?.recallCannotCreateKnowledge), adaptationCannotIncreaseAuthority: Boolean(args?.adaptationCannotIncreaseAuthority), delegationCannotExpandAuthority: Boolean(args?.delegationCannotExpandAuthority), agencyCannotCreatePurpose: Boolean(args?.agencyCannotCreatePurpose) };
    const c = cleanGuard(boundary);
    if (!c.ok)
        return { ok: false, reason: c.reason };
    return { ok: true, boundary };
};
export const buildRecallIndex = (args) => {
    if (argsHasForbiddenContent(args))
        return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
    const index = { workspace: String(args?.workspace || ""), records: args?.records || [] };
    const c = cleanGuard(index);
    if (!c.ok)
        return { ok: false, reason: c.reason };
    const n = assertRecallIndexNav(index);
    if (!n.ok)
        return { ok: false, reason: n.reason };
    return { ok: true, index };
};
export const buildLineage = (args) => {
    if (argsHasForbiddenContent(args))
        return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
    const record = { observerId: String(args?.observerId || "observer"), continuityRef: String(args?.continuityRef || ""), createdAt: today() };
    const c = cleanGuard(record);
    if (!c.ok)
        return { ok: false, reason: c.reason };
    return { ok: true, record };
};
export const buildWorkspaceRecord = (args) => {
    const record = { workspace: String(args?.workspace || ""), kind: String(args?.kind || "observation"), content: String(args?.content || ""), createdAt: today() };
    const w = assertWorkspaceIsolated(record);
    if (!w.ok)
        return { ok: false, reason: w.reason };
    return { ok: true, record };
};
export const readObserverContext = async (fs, root) => {
    const boundary = await readObserverBoundary(fs, root);
    const lineage = await readLineage(fs, root);
    const index = await readRecallIndex(fs, root);
    return { boundary, lineage, index };
};
// 读取当前 workspace（ws）的 world 层记录；只返回 workspace===ws 的记录（235 隔离：不跨项目、不落全局）。
export const readWorkspaceContext = async (fs, ws) => {
    const rows = [];
    try {
        const base = `${ws}/.dsh-shadow`;
        const dirs = (await fs.listDir({ targetKey: base, displayPath: base })) || [];
        for (const d of dirs) {
            const kindBase = `${base}/${d.name}`;
            const files = (await fs.listDir({ targetKey: kindBase, displayPath: kindBase })) || [];
            for (const f of files) {
                const p = `${kindBase}/${f.name}`;
                const t = await fs.resolve(p, { cwd: ws });
                const raw = await fs.readText(t);
                if (raw) {
                    const r = JSON.parse(raw);
                    if (r.workspace === ws)
                        rows.push(r);
                }
            }
        }
    }
    catch { /* listDir/read 失败则无记录 */ }
    return rows;
};
export const readContinuityIndex = async (fs, root) => readRecallIndex(fs, root);
