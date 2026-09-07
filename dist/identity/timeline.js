import { readSoul } from "../soul/soul.js";
import { today } from "../core/util.js";
import { scrubUnsafe } from "../security/scrub.js";
// 从 soul.json 造 v1（当前数据模型里 identity/principles/boundaries + values/anti_patterns/decision_style）。
export const identityV1Of = async (fs, ws, agentId) => {
    const soul = await readSoul(fs, ws);
    return {
        version: "v1",
        at: today(),
        core: { observerId: soul?.identity?.name || soul?.identity?.role || agentId || "unknown", values: Array.isArray(soul?.values) ? soul.values : [] },
        learned: [],
        currentModel: {
            decisionStyle: Array.isArray(soul?.decision_style) ? soul.decision_style : (Array.isArray(soul?.decisionStyle) ? soul.decisionStyle : []),
            antiPatterns: Array.isArray(soul?.anti_patterns) ? soul.anti_patterns : (Array.isArray(soul?.antiPatterns) ? soul.antiPatterns : []),
        },
    };
};
export const nextVersion = (v) => `v${(parseInt(String(v || "v0").replace(/\D/g, ""), 10) || 0) + 1}`;
export const readIdentityVersions = async (fs, ws) => {
    const out = [];
    try {
        const root = await fs.resolve(`${ws}/.shadow/identity`, { cwd: ws });
        const files = (await fs.listDir(root).catch(() => [])) || [];
        for (const f of files) {
            if (!f?.name || !f.name.endsWith(".json"))
                continue;
            const p = await fs.resolve(`${ws}/.shadow/identity/${f.name}`, { cwd: ws });
            const m = JSON.parse(await fs.readText(p));
            if (m && m.version)
                out.push(m);
        }
    }
    catch { /* 无 identity 目录 */ }
    return out.sort((a, b) => (parseInt(a.version.replace(/\D/g, "")) || 0) - (parseInt(b.version.replace(/\D/g, "")) || 0));
};
export const readCurrentIdentity = async (fs, ws, agentId) => {
    const versions = await readIdentityVersions(fs, ws);
    return versions.length ? versions[versions.length - 1] : identityV1Of(fs, ws, agentId);
};
// 写一个不可变版本切片 + 重建 timeline.md 索引（推进 self-model，干净、可回放）。
export const writeIdentityVersion = async (fs, ws, model) => {
    try {
        const rel = `.shadow/identity/${model.at}-${model.version}.json`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, JSON.stringify(model, null, 2));
        const versions = await readIdentityVersions(fs, ws);
        const idx = ["# Identity Timeline", ""].concat(versions.map((v) => `- \`${v.version}\` ${v.at} · observer ${v.core.observerId} · learned ${v.learned.length} · core.values ${v.core.values.length}`));
        const ti = await fs.resolve(`${ws}/.shadow/identity/timeline.md`, { cwd: ws });
        await fs.writeText(ti, idx.join("\n"));
    }
    catch (e) {
        console.log("[dsh-shadow] identity timeline write failed:", e && e.message);
    }
};
export const renderIdentityModel = (m) => {
    const lines = ["[Identity]"];
    lines.push(`version ${m.version} · at ${m.at}`);
    lines.push(`core observer ${scrubUnsafe(m.core.observerId)} · values ${m.core.values.join("、") || "—"}`);
    if (m.learned.length)
        lines.push(`learned:`);
    for (const l of m.learned.slice(0, 6))
        lines.push(`  ${l.text} (conf ${l.confidence.toFixed(2)} · ${l.source})`);
    if (m.currentModel.decisionStyle.length)
        lines.push(`decisionStyle ${m.currentModel.decisionStyle.join("、")}`);
    if (m.currentModel.antiPatterns.length)
        lines.push(`antiPatterns ${m.currentModel.antiPatterns.join("、")}`);
    return lines.join("\n");
};
