// dsh-shadow —— observer/arbitrate.ts：Evidence 仲裁（proof 是什么 → 裁决 Verified/Stale/Superseded）。
// zg/fs 是"发现了什么"（discover/verify），这里才是"它意味着什么"（Arbitration）。从 index.ts 迁出。
import { confidenceOf } from "../retrieval/rank.js";
import { ageDaysOf } from "../core/util.js";
import { evidencePathsOf, isPathLike, isConcreteLocator } from "../evidence/paths.js";
export const evidenceOf = (text, mm, meta, stale) => {
    const body = String(text || "");
    const clue = (body.match(/^> 证据链：(.+)$/m) || [])[1] || "";
    const srcM = clue.match(/来源\(([^)]*)\)/);
    const dateM = clue.match(/日期\(([^)]*)\)/);
    const evM = clue.match(/证据\(([^)]*)\)/);
    const rec = meta && mm?.rel ? (meta[mm.rel] || {}) : {};
    const status = rec.status || (stale ? "stale" : "active");
    const hits = Number(rec.hits) || 0;
    const evidence = evM ? evM[1] : (body.match(/^> 背景\/材料：(.+)$/m) || [])[1] || "";
    const hasExperience = /^> 摘要：|^> 概况：/m.test(body);
    const hasDecision = /^> 用户提示\/决策：/.test(body);
    return {
        kinds: srcM ? srcM[1] : "—",
        date: dateM ? dateM[1] : (mm?.date || ""),
        session: (body.match(/^> 来源会话：(.+)$/m) || [])[1] || "",
        project: (body.match(/^> 项目：(.+)$/m) || [])[1] || "",
        goal: (body.match(/^> 目标：(.+)$/m) || [])[1] || "",
        evidence,
        status,
        stale,
        hits,
        confidence: confidenceOf(hits, ageDaysOf(mm?.rel), status, { hasExperience, hasDecision }),
    };
};
export const provenanceText = (ev) => {
    const parts = [];
    if (ev.kinds && ev.kinds !== "—")
        parts.push(`来源 ${ev.kinds}`);
    if (ev.date)
        parts.push(ev.date);
    if (ev.lifecycle)
        parts.push(`生命周期 ${ev.lifecycle}`);
    parts.push(`状态 ${ev.status}${ev.stale ? "(过时)" : ""}${Number(ev.conflict) > 0 ? `(⚠证据缺${ev.conflict})` : ""}`);
    if (ev.verdict)
        parts.push(`裁决 ${ev.verdict}`);
    if (ev.outcome)
        parts.push(`结果 ${ev.outcome}`);
    if (ev.reflection && ev.reflection !== "无后续修正记录")
        parts.push(`反思 ${ev.reflection}`);
    parts.push(`命中 ${ev.hits}`);
    const c = ev.confidence;
    if (c && typeof c === "object")
        parts.push(`置信 检索${c.retrieval.toFixed(2)}/证据${c.evidence.toFixed(2)}/经验${c.experience.toFixed(2)}/判断${c.judgment.toFixed(2)}/投影${c.projection.toFixed(2)}（总${c.overall.toFixed(2)}）`);
    else
        parts.push(`置信 ${Number(c).toFixed(2)}`);
    if (ev.lineage && ev.lineage.length > 1)
        parts.push(`修正链 ${ev.lineage.map((x) => x.date.slice(5)).join("→")}`);
    if (ev.goal)
        parts.push(`目标 ${ev.goal.slice(0, 24)}`);
    if (ev.project)
        parts.push(`项目 ${ev.project.slice(0, 16)}`);
    if (ev.evidence && ev.evidence !== "—")
        parts.push(`证据 ${ev.evidence.slice(0, 60)}`);
    return `（${parts.join(" · ")}）`;
};
// Memory ≠ Evidence 裁决：记忆 "记得什么" vs 证据 "当下是否成立"。由 证据路径存在性 + 同入口更新记忆 派生。
export const newestByEntryOf = (list) => {
    const m = {};
    for (const e of list) {
        const t = `${e.date} ${e.time}`;
        if (!m[e.entry] || t > m[e.entry])
            m[e.entry] = t;
    }
    return m;
};
export const verdictOf = (conflictCount, entry, date, time, newest) => {
    const t = `${date} ${time}`;
    const superseded = !!newest[entry] && t < newest[entry];
    const verdict = superseded ? "superseded" : (conflictCount > 0 ? "stale" : "fresh");
    const outcome = superseded ? "superseded" : (conflictCount > 0 ? "evidence_stale" : "evidence_live");
    const reflection = superseded ? "后续已迭代（存在同入口更新记忆）" : (conflictCount > 0 ? "证据缺失，需重新验证" : "无后续修正记录");
    return { superseded, verdict, outcome, reflection };
};
// Lesson（教训）≠ Summary（摘要）：教训由裁决派生，与"发生了什么"的摘要解耦，给出可迁移的提醒。
export const lessonOf = (v) => v.superseded ? "同入口已被更新，引用前先查最新记忆" : (v.outcome === "evidence_stale" ? "证据路径缺失，需重新验证后再引用" : "结论仍有效");
// Decision Lineage（ADR-0003 §3-4）：同一 entry 的记忆按时间排成修正确 A→Correction→B→…，保留"为何变化"。
export const lineageOf = (list) => {
    const seen = new Set();
    const chain = [];
    for (const e of list) {
        const t = `${e.date} ${e.time}`;
        if (seen.has(t))
            continue;
        seen.add(t);
        chain.push({ date: e.date, time: e.time, decision: e.decision || "" });
    }
    return chain.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
};
/** 一次裁决最多核验多少条具体路径（上限存在的理由是成本：每条都要走一次 provider）。 */
export const EVIDENCE_PATH_CAP = 12;
export const conflictOf = async (fs, ws, text, verifyEvidence) => {
    // **双条件**（ADR-0059，借 CASCADE/FSE 2026 的思路）：只有在
    //   ① 引用是**可检查的具体路径**（`isConcreteLocator` 排除通配符 `scripts/*.ps1`、git ref `origin/main`）
    //   ② 它确实解析不到
    // 同时成立时，才判「证据缺失」。缺 ① 就去验存在性必然判缺失 → 会误降权（见 `evidence/paths.ts` 注释）。
    //
    // **上限必须披露**（v1.15.58）：超过 `EVIDENCE_PATH_CAP` 的具体路径**没有核验** ——
    // 旧实现只是 `.slice(0, 12)`，调用方拿到 `missing: []` 会以为「全查过了、都没有缺失」，
    // 而真实含义是「**前 12 条**都不是缺失的」。故把被截掉的条数一并返回（`droppedByCap`）。
    const concrete = evidencePathsOf(text).filter(isPathLike).filter(isConcreteLocator);
    const paths = concrete.slice(0, EVIDENCE_PATH_CAP);
    const droppedByCap = Math.max(0, concrete.length - paths.length);
    if (!paths.length)
        return { missing: [], droppedByCap: 0 };
    const missing = [];
    for (const p of paths) {
        const res = await verifyEvidence({ path: p, kind: "path" }, { fs, ws });
        // zg 未装/unavailable → 不当作"缺失"（避免把"证据不可验证"猜成"证据已失效"）。
        if (res.status === "not_found")
            missing.push(p);
    }
    return { missing, droppedByCap };
};
