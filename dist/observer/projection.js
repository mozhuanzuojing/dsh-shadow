// dsh-shadow —— observer/projection.ts：Projection（Observer 透镜 → LocalContext）。从 index.ts 迁出。
import { tokenize } from "../core/util.js";
import { readRel } from "../persistence/files.js";
import { experienceOf } from "../core/experience.js";
import { conflictOf } from "./arbitrate.js";
// Observer 透镜 = soul.observer 或注入的 lens（v0.20 支持按 Observer 覆盖）；显著 = 任务词命中 × what_matters 加权 − what_to_ignore 排除。
export const projectContext = async (fs, ws, memories, task, soul, verifyEvidence, lens) => {
    const ob = lens || ((soul && soul.observer) || { what_matters: [], what_to_ignore: [] });
    const matters = Array.isArray(ob.preferred ?? ob.what_matters) ? (ob.preferred ?? ob.what_matters) : [];
    const ignore = Array.isArray(ob.avoided ?? ob.what_to_ignore) ? (ob.avoided ?? ob.what_to_ignore) : [];
    const tokens = tokenize(task);
    const rel = [];
    const excl = [];
    const unc = [];
    const experiences = [];
    for (const mm of memories) {
        const text = await readRel(fs, ws, mm.rel);
        if (!text)
            continue;
        const exp = experienceOf(text, mm);
        const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence} ${exp.summary} ${exp.goal}`.toLowerCase();
        const match = tokens.some((t) => hay.includes(t));
        let salience = match ? 1 : 0;
        if (salience === 0) {
            excl.push(mm.rel.split("/").pop());
            continue;
        }
        for (const ig of ignore)
            if (String(exp.situation).toLowerCase().includes(String(ig).toLowerCase())) {
                salience = 0;
                excl.push(mm.rel.split("/").pop());
                break;
            }
        if (salience === 0)
            continue;
        for (const m of matters)
            if (hay.includes(String(m).toLowerCase()))
                salience += 2;
        const conflict = await conflictOf(fs, ws, text, verifyEvidence);
        if (conflict.missing.length)
            unc.push(mm.rel.split("/").pop());
        if (salience > 0) {
            rel.push({ salience, exp });
            experiences.push(exp);
        }
    }
    rel.sort((a, b) => b.salience - a.salience);
    const principles = (Array.isArray(soul?.principles) ? soul.principles : []).filter((p) => tokens.some((t) => String(p).toLowerCase().includes(t)));
    const visible = rel.slice(0, 8).map((r) => r.exp.situation);
    const hidden = excl;
    return { rel: rel.slice(0, 8), experiences, principles, taste: soul?.taste || null, unc, excl, visible, hidden };
};
export const renderProjection = (p, task, project, ctx) => {
    const lines = ["[Projection]"];
    if (ctx)
        lines.push(`observer ${ctx.observerId} · lens ${ctx.lens || "default"} · intent ${ctx.intent.goal}`);
    lines.push(`scope: project=${project || "?"} · task=${task}`);
    lines.push("relevant:");
    if (p.principles.length)
        lines.push(`  原则 ${p.principles.join("、")}`);
    if (p.rel.length) {
        for (const r of p.rel.slice(0, 4))
            lines.push(`  经验 ${r.exp.situation} → ${r.exp.decision || "—"}${r.exp.lesson ? ` (教训 ${r.exp.lesson.slice(0, 24)})` : ""}`);
    }
    if (p.taste)
        lines.push(`  偏好 ${JSON.stringify(p.taste)}`);
    lines.push(`current_state: 候选相关 ${p.rel.length} · 不确定 ${p.unc.length} · 排除 ${p.excl.length}`);
    if (p.visible?.length)
        lines.push(`visible: ${p.visible.slice(0, 4).join("、")}`);
    if (p.unc.length)
        lines.push(`uncertainty: ${p.unc.slice(0, 4).join("、")}`);
    if (p.hidden?.length)
        lines.push(`hidden: ${p.hidden.slice(0, 6).join("、")}`);
    if (p.excl.length)
        lines.push(`excluded: ${p.excl.slice(0, 6).join("、")}`);
    return lines.join("\n");
};
