// dsh-shadow —— retrieval/rank.ts：召回打分/拆解/置信度/snippet/tier。从 index.ts 迁出。
// 纯函数（today/topicsInText 来自 core/util，无闭包依赖）。
import { today, topicsInText } from "../core/util.js";
export const scoreMemory = (text, rel, entry, tokens) => {
    if (!tokens.length)
        return 0;
    const low = String(text || "").toLowerCase();
    const lowRel = String(rel || "").toLowerCase();
    const entryLow = String(entry || "").toLowerCase();
    const tags = topicsInText(text, entry);
    let score = 0;
    for (const t of tokens) {
        let hit = 0;
        if (entryLow.includes(t))
            hit = Math.max(hit, 6);
        if (tags.some((tag) => String(tag).toLowerCase().includes(t)))
            hit = Math.max(hit, 4);
        if (lowRel.includes(t))
            hit = Math.max(hit, 3);
        if (low.includes(t))
            hit = Math.max(hit, 1);
        score += hit;
    }
    if (!score)
        return 0;
    const m = String(rel || "").match(/(\d{4}-\d{2}-\d{2})/);
    if (m) {
        const days = Math.round((Date.parse(today()) - Date.parse(m[1])) / 86400000);
        score += Math.max(0, 3 - Math.floor(days / 7));
    }
    return score;
};
// v1.12.6 deprioritize（借 codegraph：把「移除」和「降权」当两件事）——命中的路径/入口前缀落在
// recall.deprioritize 里时只降权、不移除，被降权的记忆仍可搜到、只是排名靠后。
export const DEPRIORITIZE_FACTOR = 0.4;
export const deprioritizeFactor = (rel, entry, patterns) => {
    if (!Array.isArray(patterns) || !patterns.length)
        return 1;
    const norm = (s) => String(s || "").toLowerCase().replace(/\\/g, "/");
    const hay = `${norm(rel)} ${norm(entry)}`;
    for (const p of patterns) {
        const q = norm(p).trim();
        if (q && hay.includes(q))
            return DEPRIORITIZE_FACTOR;
    }
    return 1;
};
// v1.12.6 近似入口（空命中时的「下一步」用）：确定性 2-gram 重合度，只做提示，绝不冒充命中。
export const approxEntries = (query, entries, k = 3) => {
    const grams = (s) => {
        const t = String(s || "").toLowerCase().replace(/\s+/g, " ");
        const out = [];
        for (let i = 0; i < t.length - 1; i++)
            out.push(t.slice(i, i + 2));
        return out;
    };
    const qg = new Set(grams(query));
    if (!qg.size)
        return [];
    const seen = new Set();
    const scored = [];
    for (const e of entries) {
        const name = String(e || "").trim();
        if (!name || seen.has(name))
            continue;
        seen.add(name);
        const eg = grams(name);
        if (!eg.length)
            continue;
        let hit = 0;
        for (const g of eg)
            if (qg.has(g))
                hit++;
        const s = hit / Math.sqrt(eg.length);
        if (s > 0.35)
            scored.push({ e: name, s });
    }
    scored.sort((a, b) => b.s - a.s || a.e.localeCompare(b.e));
    return scored.slice(0, Math.max(0, k)).map((x) => x.e);
};
// 打分拆解（仅供 debug trace 展示，不参与实际打分）：按 entry/topic/path/body 叠加，看"为什么命中"。
// deprioritized=true 时另标「降权」原因（分不在这四项里，实际扣分见 scoreMemory 调用侧）。
export const breakdownOf = (text, rel, entry, tokens, deprioritized = false) => {
    const low = String(text || "").toLowerCase();
    const lowRel = String(rel || "").toLowerCase();
    const entryLow = String(entry || "").toLowerCase();
    const tags = topicsInText(text, entry);
    let parts = { entry: 0, topic: 0, path: 0, body: 0, deprioritized };
    for (const t of tokens) {
        if (entryLow.includes(t))
            parts.entry += 6;
        if (tags.some((tag) => String(tag).toLowerCase().includes(t)))
            parts.topic += 4;
        if (lowRel.includes(t))
            parts.path += 3;
        if (low.includes(t))
            parts.body += 1;
    }
    return parts;
};
export const confidenceOf = (hits, ageDays, status, opts) => {
    const h = Math.max(0, Math.min(3, Number(hits) || 0));
    const base = { active: 0.55, stale: 0.3, superseded: 0.15, archived: 0.1 }[status] ?? 0.4;
    const hitBoost = h * 0.12;
    const ageDecay = Math.max(0, Number(ageDays) || 0) * 0.008;
    const retrieval = Math.max(0.05, Math.min(0.98, base + hitBoost - ageDecay));
    const evidence = status === "active" ? 0.8 : status === "stale" ? 0.4 : 0.15;
    const experience = opts?.hasExperience ? 0.75 : 0.45;
    const judgment = opts?.hasDecision ? 0.7 : 0.4;
    const projection = 0.6; // Observer Lens 基数（投影总是部分可证伪，不宣称全知）
    const overall = Math.max(0.05, Math.min(0.98, retrieval * 0.4 + evidence * 0.25 + experience * 0.15 + judgment * 0.1 + projection * 0.1));
    return { retrieval, evidence, experience, judgment, projection, overall };
};
export const snippetFor = (text, tokens) => {
    const lines = String(text || "").split("\n");
    const skip = (l) => /^\s*($|#|> )/.test(l);
    const isAction = (l) => /改\/读 |调用 /.test(l);
    const low = (l) => l.toLowerCase();
    for (const l of lines) {
        if (skip(l) || !l.trim() || isAction(l))
            continue;
        if (tokens.some((t) => low(l).includes(t)))
            return l.trim().slice(0, 140);
    }
    for (const l of lines) {
        if (skip(l) || !l.trim())
            continue;
        if (tokens.some((t) => low(l).includes(t)))
            return l.trim().slice(0, 140);
    }
    for (const l of lines) {
        if (!skip(l) && l.trim())
            return l.trim().slice(0, 140);
    }
    return "";
};
export const memorySummary = (text) => (String(text || "").match(/^> 摘要：(.+)$/m) || [])[1] || "";
export const tierFor = (text) => {
    const body = String(text || "");
    const bodyLines = body.split("\n").filter((l) => /^\s*-\s*\[/.test(l));
    const actionLines = bodyLines.filter((l) => /改\/读 |调用 /.test(l)).length;
    const hasThought = /(用户：|决定 |结论|分析|为什么|注意|边界|坑)/.test(body);
    if (hasThought)
        return "L2";
    if (bodyLines.length && actionLines / bodyLines.length > 0.6)
        return "L0";
    return "L1";
};
