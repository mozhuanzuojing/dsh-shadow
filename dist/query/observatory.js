// dsh-shadow —— query/observatory.ts：Shadow Query Observatory（Phase 1A.5）。
// 目的：观察真实查询模式，先不固化 nodes.jsonl。只旁路记录/汇总，不改查询真相路径。
// 契约：
//   - 观测是「系统派生记录」：写 .shadow/query-log/<date>.jsonl，rm -rf query-log 不影响任何 Atom；
//   - 只在 shadow_query（mode:"query"）入口打点，不进 derive 真相路径；
//   - 写失败静默（best-effort），绝不改变 query 的返回值；
//   - query/title 做轻量 scrub（密钥打码 + 剔除控制/双向字符），防敏感检索词与注入残留回显。
import { SHADOW_ROOT } from "../core/paths.js";
import { sanitizeText, scrubUnsafe } from "../security/scrub.js";
const scrubQuery = (s) => scrubUnsafe(sanitizeText(s)).slice(0, 200);
const tidy = (s) => scrubUnsafe(s).slice(0, 60);
const logRel = (date) => `${SHADOW_ROOT}/query-log/${date}.jsonl`;
export const recordQueryObservation = async (fs, ws, cfg, obs) => {
    // 默认开启（本阶段就是要观察真实查询）；显式 queryLog.enabled=false 才关。观测是旁路，写失败静默。
    if (!fs || !ws)
        return;
    if (cfg?.queryLog && cfg.queryLog.enabled === false)
        return;
    try {
        const rel = logRel(obs.date);
        const target = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        const prev = (await fs.readText(target)) || "";
        const line = JSON.stringify({ ...obs, query: scrubQuery(obs.query), nodeTitles: (obs.nodeTitles || []).map(tidy) });
        await fs.writeText(target, prev.endsWith("\n") || !prev.length ? prev + line + "\n" : prev + "\n" + line + "\n");
    }
    catch { /* best-effort：观测层失败不冒泡 */ }
};
/** 汇总所有 query-log（跨日期），供 read_shadow({mode:"query-log"}) 展示。 */
export const summarizeQueryLog = async (fs, ws) => {
    const obs = [];
    try {
        const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/query-log`, { cwd: ws });
        const files = await fs.listDir(root);
        for (const f of files) {
            if (!f?.name || !String(f.name).endsWith(".jsonl"))
                continue;
            const target = await fs.resolve(`${ws}/${SHADOW_ROOT}/query-log/${f.name}`, { cwd: ws });
            const text = (await fs.readText(target)) || "";
            for (const line of String(text).split("\n")) {
                const t = line.trim();
                if (!t)
                    continue;
                try {
                    obs.push(JSON.parse(t));
                }
                catch { /* 单行坏跳过 */ }
            }
        }
    }
    catch { /* query-log 目录不存在（尚未采集） */ }
    return aggregateObservations(obs);
};
const aggregateObservations = (obs) => {
    const total = obs.length;
    if (!total)
        return { total: 0, avgLatency: 0 };
    const sum = (k) => obs.reduce((a, o) => a + (Number(o[k]) || 0), 0);
    const avg = (k) => sum(k) / total;
    const typeDist = {};
    const scopeDist = {};
    let evSum = 0, evNodeSum = 0, relSum = 0, relNodeSum = 0;
    const byQuery = new Map();
    for (const o of obs) {
        for (const [t, c] of Object.entries(o.nodeTypes || {}))
            typeDist[t] = (typeDist[t] || 0) + (Number(c) || 0);
        const key = (o.scope || []).join(",") || "*";
        scopeDist[key] = (scopeDist[key] || 0) + 1;
        evSum += Number(o.evidenceCount) || 0;
        evNodeSum += Number(o.evidenceNodes) || 0;
        relSum += Number(o.relationCount) || 0;
        relNodeSum += Number(o.relationNodes) || 0;
        const q = String(o.query || "");
        if (!byQuery.has(q))
            byQuery.set(q, []);
        byQuery.get(q).push(o);
    }
    let repeatQueries = 0, stableQueries = 0, driftQueries = 0;
    const drift = [];
    for (const [q, list] of byQuery) {
        if (list.length < 2)
            continue;
        repeatQueries++;
        const keys = list.map((o) => JSON.stringify(o.nodeTitles || []));
        if (new Set(keys).size === 1)
            stableQueries++;
        else {
            driftQueries++;
            if (drift.length < 20)
                drift.push({ query: q, seen: list.length, distinctResultSets: new Set(keys).size });
        }
    }
    const retSum = sum("returnedNodes");
    return {
        total,
        avgCandidate: Math.round(avg("candidateNodes") * 10) / 10,
        avgReturned: Math.round(avg("returnedNodes") * 10) / 10,
        avgEvidence: Math.round(avg("evidenceCount") * 10) / 10,
        evidenceCoverage: retSum ? Math.round((evNodeSum / retSum) * 100) : 0, // 返回节点里带 evidence 的比例
        avgRelation: Math.round(avg("relationCount") * 10) / 10,
        relationCoverage: retSum ? Math.round((relNodeSum / retSum) * 100) : 0, // 返回节点里带 relations 的比例
        typeDist,
        scopeDist,
        repeatQueries, stableQueries, driftQueries,
        drift,
        avgLatency: Math.round(avg("latencyMs")),
    };
};
export const renderQueryLogSummary = (s, topic) => {
    if (!s || !s.total)
        return `（Query Observatory：尚无 shadow_query 记录。调用几次 shadow_query 后这里会给出命中/证据/关系/类型分布与 Node 稳定性。${topic ? ` topic=${topic}` : ""}）`;
    const lines = [`# Shadow Query Observatory · ${topic || "全部"}`, ""];
    lines.push(`总查询 ${s.total} · 平均候选节点 ${s.avgCandidate} → 返回 ${s.avgReturned} · 平均证据 ${s.avgEvidence} · 平均关系 ${s.avgRelation} · 平均延迟 ${s.avgLatency}ms`);
    lines.push(`- evidence 完整率：${s.evidenceCoverage}%（返回节点中带证据比例）`);
    lines.push(`- relation 覆盖：${s.relationCoverage}%（返回节点中带 relations 比例）`);
    if (s.typeDist && Object.keys(s.typeDist).length)
        lines.push(`- 返回节点类型分布：${Object.entries(s.typeDist).map(([t, c]) => `${t}×${c}`).join("、")}`);
    if (s.scopeDist && Object.keys(s.scopeDist).length)
        lines.push(`- scope 使用：${Object.entries(s.scopeDist).map(([k, c]) => `${k || "*"}×${c}`).join("、")}`);
    lines.push(`- 重复查询 ${s.repeatQueries}（Node 稳定 ${s.stableQueries} · 漂移 ${s.driftQueries}）：稳定=同一查询每次返回的 nodeTitles 一致；漂移=不一致（说明 Node 派生不稳定）`);
    if (s.drift && s.drift.length) {
        lines.push("");
        lines.push("## Node 漂移的重复查询");
        for (const d of s.drift)
            lines.push(`- "${d.query}" 见过 ${d.seen} 次 · 不同的结果集 ${d.distinctResultSets} 个`);
    }
    lines.push("");
    lines.push("> Query Observatory 为系统派生记录（.shadow/query-log/），rm -rf 不影响任何 Atom；仅观察，不改 nodes 结构。");
    return lines.join("\n");
};
