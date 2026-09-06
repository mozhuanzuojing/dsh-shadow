// dsh-shadow —— observer/observer.ts：工程知识图谱（KG，`kg:true` 输出邻接追踪）。从 index.ts 迁出。
import { readRel } from "../persistence/files.js";
import { evidencePathsOf, isPathLike } from "../evidence/paths.js";
export const kgTrace = async (fs, ws, memories, topic) => {
    const doms = {};
    const comps = {};
    for (const mm of memories) {
        const text = await readRel(fs, ws, mm.rel);
        if (!text)
            continue;
        const entry = (text.match(/^# (.+)$/m) || [])[1] || "";
        if (!entry)
            continue;
        const domain = entry.split("/")[0] || entry;
        const evP = evidencePathsOf(text).filter(isPathLike);
        const c = (comps[entry] = comps[entry] || { domain, evidence: new Set(), mems: new Set() });
        c.mems.add(mm.rel);
        for (const p of evP)
            c.evidence.add(p);
        const d = (doms[domain] = doms[domain] || { comps: new Set(), mems: new Set() });
        d.comps.add(entry);
        d.mems.add(mm.rel);
    }
    const low = topic.toLowerCase();
    const matchDom = Object.keys(doms).filter((d) => d.toLowerCase().includes(low));
    const matchComp = Object.keys(comps).filter((c) => c.toLowerCase().includes(low));
    const lines = ["[工程知识图谱]"];
    if (!matchDom.length && !matchComp.length) {
        lines.push(`（「${topic}」暂无匹配的组件/域）`);
        return lines.join("\n");
    }
    if (matchDom.length) {
        const dom = matchDom[0];
        lines.push(`域 ${dom}`);
        lines.push(`  ├─ 组件 ${[...doms[dom].comps].slice(0, 6).join("、")}`);
        lines.push(`  ├─ 记忆 ${[...doms[dom].mems].slice(0, 4).map((r) => r.split("/").pop()).join("、")}`);
        const evs = new Set();
        for (const c of doms[dom].comps)
            ((comps[c] || {}).evidence || []).forEach((e) => evs.add(e));
        if (evs.size)
            lines.push(`  └─ 依赖 ${[...evs].slice(0, 6).join("、")}`);
    }
    for (const c of matchComp) {
        const cc = comps[c];
        lines.push(`组件 ${c} · 域 ${cc.domain} · 记忆 ${[...cc.mems].slice(0, 3).map((r) => r.split("/").pop()).join("、")} · 依赖 ${[...cc.evidence].slice(0, 4).join("、")}`);
    }
    return lines.join("\n");
};
