// dsh-shadow —— query/observatory.ts：Shadow Query Observatory（Phase 1A.5）。
// 目的：观察真实查询模式，先不固化 nodes.jsonl。只旁路记录/汇总，不改查询真相路径。
// 契约：
//   - 观测是「系统派生记录」：写 .shadow/query-log/<date>.jsonl，rm -rf query-log 不影响任何 Atom；
//   - 只在 shadow_query（mode:"query"）入口打点，不进 derive 真相路径；
//   - 写失败**不再静默**（v1.15.65 / T8 第 4 条）：`recordQueryObservation` 返回
//     `{ ok, reason? }`（v1.15.94 由 `boolean` 收紧 —— `false` 说不清**为什么**），
//     调用方据此经 `deps.noteDegrade` 留痕 ⇒ 读侧横幅可见**真实原因**。它**仍然不改变 query 的返回值**
//     （这是本条契约里唯一没变的部分）—— 但「不冒泡」与「不可见」是两件事，
//     旧注释把后者也一并声明了，而那正是 T8 要修的缺陷。
//   - **「还没有这个文件」不是失败**（v1.15.94）：追加式写入要先读回已有内容，而首写时文件不存在
//     —— 真实 fs 对不存在的路径 `readText` 抛错，旧版把这个抛错归进失败 ⇒ 首写永远失败、
//     `.shadow/query-log/` 从未被创建过（默认开启的观测层因此**一次都没落盘**）。
//   - query/title 做轻量 scrub（密钥打码 + 剔除控制/双向字符），防敏感检索词与注入残留回显。
import { SHADOW_ROOT } from "../core/paths.js";
import { today, isNotFound, errText } from "../core/util.js";
import { appendJsonlLine } from "../persistence/jsonl-append.js";
import { nodeTypeOf } from "../core/node.js";
import { sanitizeText, scrubUnsafe } from "../security/scrub.js";
const scrubQuery = (s) => scrubUnsafe(sanitizeText(s)).slice(0, 200);
const tidy = (s) => scrubUnsafe(s).slice(0, 60);
// v1.8.0：从返回节点算出 Evidence Density 的三维分布（type/kind/createdBy 各自的 total/ev）。
export const evidenceBreakdownOf = (nodes) => {
    const inc = (m, k, hasEv) => {
        m[k] = m[k] || { total: 0, ev: 0 };
        m[k].total++;
        if (hasEv)
            m[k].ev++;
    };
    const byType = {};
    const byKind = {};
    const byCreatedBy = {};
    for (const n of nodes) {
        const hasEv = Array.isArray(n.evidence) && n.evidence.length > 0;
        inc(byType, String(n.type || "memory"), hasEv);
        if (n.kind)
            inc(byKind, String(n.kind), hasEv);
        if (n.createdBy)
            inc(byCreatedBy, String(n.createdBy), hasEv);
    }
    return { byType, byKind, byCreatedBy };
};
const logRel = (date) => `${SHADOW_ROOT}/query-log/${date}.jsonl`;
/**
 * 记录一次查询观测。返回**是否真的写入成功 + 失败原因**（T8-A / ADR-0049，v1.15.65；原因 v1.15.94）。
 *
 * 旧契约是 `Promise<void>` + `catch { /* best-effort *\/ }` —— 写失败时调用方**无从知道**，
 * 于是 `.shadow/query-log/` 丢的记录与「从没查过」不可区分（读侧只会显示「尚无记录」）。
 * 这条是**默认开启**的能力，所以它的静默在 T8 的 7 条里优先级最高。
 *
 * 现在返回 `{ ok:false, reason }` 时，唯一的租户（`query/reads.ts` 的观测写入点）会经
 * `deps.noteDegrade` 记一条**带真实原因**的降级留痕 ⇒ 读者在横幅上看到「queryLog 写失败（为什么）」。
 *
 * **v1.15.94 修首写永久失败（缺陷 A）**：这是「先读后写」的追加式写入，而旧版把
 * `readText` 那一步也当成**必成功** —— 真实 fs 对**不存在的路径**是**抛错**的
 * ⇒ 全新工作区（`query-log/` 目录都还不存在）上读必然抛 ⇒ `catch` ⇒ `false`
 * ⇒ **首写永远失败、目录永远建不出来、默认开启的观测层从未落盘过**。
 * 现在「读不到（不存在）」当空串处理（照 `persistence/meta.ts#readMetaVersioned` 的写法，
 * 判据复用 `core/util.ts` 的 `isNotFound`），**写失败仍然返回失败**。
 * 目录由宿主 `writeText` 的 `mkdir -p` 建出来（`dsh-fs-local`），本函数不必自己建。
 *
 * `fs`/`ws` 缺失与 `enabled === false` 仍返回 `{ ok:false }`（**不带 reason**）——
 * 前者是调用环境问题（调用点本来就有 fs 守卫），后者是用户**显式**关闭，都不是「坏了」。
 */
export const recordQueryObservation = async (fs, ws, cfg, obs) => {
    // 默认开启（本阶段就是要观察真实查询）；显式 queryLog.enabled=false 才关。
    if (!fs || !ws)
        return { ok: false };
    if (cfg?.queryLog && cfg.queryLog.enabled === false)
        return { ok: false };
    // 追加实现**收一处**（v1.19.0，`adr/0097` D2）：与审计流共用 `persistence/jsonl-append.ts`。
    // 那份实现已含本条原先自己处理的两件事：**「还没有这个文件」不是失败**（真实 fs 对不存在的路径抛错 ⇒
    // v1.15.94 缺陷 A：首写永远失败、目录永远建不出来）与**同进程内「读-改-写」排队**
    // （原来两次并发 query 会各自读到同一份 `prev`、后写把先写覆盖掉）。
    // **仍然不静默**：失败由返回值上抛给调用方经 `deps.noteDegrade` 留痕。
    const line = JSON.stringify({ ...obs, query: scrubQuery(obs.query), nodeTitles: (obs.nodeTitles || []).map(tidy) });
    const r = await appendJsonlLine(fs, ws, logRel(obs.date), line);
    return r.ok ? { ok: true } : { ok: false, reason: r.reason };
};
/** 汇总所有 query-log（跨日期），供 `read_shadow({mode:"query-log"})` 展示。 */
export const summarizeQueryLog = async (fs, ws) => {
    const obs = [];
    let badLines = 0; // 无法解析的行数（**必须披露**，见下）
    // **「还没有采集」与「读失败」必须分开**（v1.15.95，项③；ADR-0049）。
    // 前者（目录/文件还不存在）是正常的新工作区 ⇒ 静默；后者必须**可见**。
    // 旧版把两者并入同一个 `catch { }`，于是「EACCES / 后端故障 / 只读挂载」读出来
    // 与「从没查过」**逐字不可区分**（都渲染成「尚无 shadow_query 记录」）——
    // 一句把人引向「多查几次」的话，掩盖了真正要人处理的事故。
    let readFailure;
    try {
        const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/query-log`, { cwd: ws });
        let files = [];
        // 目录不存在 ⇒ `isNotFound` ⇒ 尚未采集（正常）；其余 ⇒ 披露。
        try {
            files = (await fs.listDir(root)) || [];
        }
        catch (e) {
            if (!isNotFound(e))
                readFailure = `列举 .shadow/query-log 失败：${errText(e)}`;
        }
        for (const f of files) {
            if (!f?.name || !String(f.name).endsWith(".jsonl"))
                continue;
            const target = await fs.resolve(`${ws}/${SHADOW_ROOT}/query-log/${f.name}`, { cwd: ws });
            // 单个文件读失败**不得**丢弃已累计的样本（旧版落在外层 `catch` 里 ⇒ 整体吞掉、
            // 且与「目录为空」不可区分 ⇒ 静默削样本，与 v1.15.56 修坏行是同一类）。
            let text = "";
            try {
                text = (await fs.readText(target)) || "";
            }
            catch (e) {
                if (!isNotFound(e))
                    readFailure = readFailure ?? `读取 ${f.name} 失败：${errText(e)}`;
                continue;
            }
            for (const line of String(text).split("\n")) {
                const t = line.trim();
                if (!t)
                    continue;
                // **坏行必须计数**（v1.15.56）：旧版 `catch { /* 单行坏跳过 */ }` 只丢不报，
                // 于是 `total` / 覆盖率 / drift 统计都建立在**被削过的样本**上，读数字的人无从知道丢了几行。
                try {
                    obs.push(JSON.parse(t));
                }
                catch {
                    badLines += 1;
                }
            }
        }
    }
    catch (e) {
        if (!isNotFound(e))
            readFailure = readFailure ?? `定位 .shadow/query-log 失败：${errText(e)}`;
    }
    const agg = aggregateObservations(obs);
    const withBad = badLines > 0 ? { ...agg, badLines, badLinesNote: `⚠ query-log 有 ${badLines} 行**无法解析**（已从统计中剔除）：下面的 total/覆盖率/drift 基于**被削过的样本**，不代表全部采集。` } : agg;
    if (!readFailure)
        return withBad;
    return {
        ...withBad,
        readFailure,
        readFailureNote: `⚠ **读取 .shadow/query-log 失败**（这不是「还没有采集」）：${readFailure} —— 下面的数字只基于**读到的部分**，可能不完整。`,
    };
};
const aggregateObservations = (obs) => {
    const total = obs.length;
    if (!total)
        return { total: 0, avgLatency: 0 };
    const sum = (k) => obs.reduce((a, o) => a + (Number(o[k]) || 0), 0);
    const avg = (k) => sum(k) / total;
    const typeDist = {};
    const scopeDist = {};
    // v1.8.0：Evidence Density 三维聚合（跨观测累加）。
    const evByType = {};
    const evByKind = {};
    const evByCreatedBy = {};
    const merge = (dst, src) => {
        for (const [k, v] of Object.entries(src || {})) {
            dst[k] = dst[k] || { total: 0, ev: 0 };
            dst[k].total += Number(v.total) || 0;
            dst[k].ev += Number(v.ev) || 0;
        }
    };
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
        merge(evByType, o.evidenceByType);
        merge(evByKind, o.evidenceByKind);
        merge(evByCreatedBy, o.evidenceByCreatedBy);
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
        evByType, evByKind, evByCreatedBy, // v1.8.0 Evidence Density 三维
    };
};
// 渲染一个「维度 → 覆盖率」段（total/ev → %；ev 为 0 的维度显示 0%）。
const renderDim = (label, m) => {
    const entries = Object.entries(m);
    if (!entries.length)
        return null;
    const parts = entries.map(([k, v]) => `${k} ${v.total ? Math.round((v.ev / v.total) * 100) : 0}%`).join(" · ");
    return `- ${label}：${parts}`;
};
export const renderQueryLogSummary = (s, topic) => {
    const suffix = topic ? ` topic=${topic}` : "";
    if (!s || !s.total) {
        // **读失败必须可见**（v1.15.95）：`total:0` 有两个来源 —— 「还没有采集」（正常，照旧提示去查几次）
        // 与「读失败」（要人管）。旧版一律渲染成「尚无记录」⇒ 把后者的信号抹掉（ADR-0049）。
        if (s?.readFailureNote)
            return `（Query Observatory：**total=0 但不代表「从没查过」—— 读不到 query-log**。${suffix}）\n\n> ${s.readFailureNote}`;
        return `（Query Observatory：尚无 shadow_query 记录。调用几次 shadow_query 后这里会给出命中/证据/关系/类型分布与 Node 稳定性。${suffix}）`;
    }
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
    // **两条披露都必须落到正文上**（v1.15.95）：`badLinesNote` 自 v1.15.56 起就只挂在返回对象上、
    // 渲染时被丢掉 ⇒ 「坏行已披露」只对**直接读返回对象**的测试成立，**读工具输出的人看不到**。
    if (s.badLinesNote)
        lines.push(`> ${s.badLinesNote}`);
    if (s.readFailureNote)
        lines.push(`> ${s.readFailureNote}`);
    lines.push("> Query Observatory 为系统派生记录（.shadow/query-log/），rm -rf 不影响任何 Atom；仅观察，不改 nodes 结构。");
    return lines.join("\n");
};
// ─────────────────────────────────────────────────────────────────────────────
// Phase 1A.6 Shadow Fitness Report：把 query-log 变成「是否升级索引层」的客观依据。
// 输入 .shadow/query-log/*.jsonl（+ 扫记忆原子做 missing-types 启发式），输出 shadow-report.md。
// 只做「诊断」，不做「变强」；判定是启发式（best-effort、无 LLM、不下结论），标注依据。
// ─────────────────────────────────────────────────────────────────────────────
/** Evidence Density 健康阈值：dsh-shadow 坚持「宁可少回答，不要无证据上下文」。 */
export const EVIDENCE_HEALTHY = 90; // 有证据返回节点 / 总返回节点 %
// 约束型 / 任务型语言标记（启发式，用来推测「内容被归错类型」）。只作呈现，不替数据作决定。
const CONSTRAINT_RE = /禁止|严禁|不得|不能|不允许|必须|永不|不可|切勿|务必|只允许|前提|约束|dependency rule/;
const TASK_RE = /待办|todo|尚未|未完成|下一步|继续做|还需要|要做|未闭环|还剩/;
const nodeText = (p) => [p.entry, p.goal, ...(p.decisions || []), ...(p.actions || []), ...(p.thinkLines || []), ...(p.userMessages || []), ...(p.materials || [])].join(" ");
/** 从记忆原子扫描「约束型/任务型」内容，推测可能缺失的 Node 类型（如 constraint/task）。 */
export const missingTypesOf = (parsed) => {
    const markers = {
        constraint: { re: CONSTRAINT_RE, count: 0, byType: {} },
        task: { re: TASK_RE, count: 0, byType: {} },
    };
    for (const p of parsed || []) {
        const t = nodeTypeOf(p);
        const text = nodeText(p);
        for (const name of Object.keys(markers)) {
            const m = markers[name];
            if (m.re.test(text)) {
                m.count++;
                m.byType[t] = (m.byType[t] || 0) + 1;
            }
        }
    }
    const out = [];
    for (const name of Object.keys(markers)) {
        const m = markers[name];
        if (m.count >= 3)
            out.push({ type: name, count: m.count, currentTypes: m.byType }); // ≥3 次才提示，避免单例噪声
    }
    return out;
};
/** 从 query-log 聚合 + 记忆扫描，构造健身报告数据。 */
export const buildFitnessReport = (agg, parsed) => {
    const missing = missingTypesOf(parsed);
    const evidenceDensity = agg.evidenceCoverage || 0;
    const repeat = agg.repeatQueries || 0;
    const driftQ = agg.driftQueries || 0;
    // 判定为「观察/建议」，非结论。
    const observations = [];
    if (agg.total > 0) {
        if (evidenceDensity >= EVIDENCE_HEALTHY)
            observations.push(`证据覆盖 ${evidenceDensity}%：多数返回节点带证据，符合「无证据不返回」契约。`);
        else
            observations.push(`证据覆盖 ${evidenceDensity}%（低于 ${EVIDENCE_HEALTHY}%）：存在无证据上下文被返回，健康度需关注。`);
        if (repeat > 0) {
            if (driftQ === 0)
                observations.push(`重复查询 ${repeat} 次 Node 全部稳定：派生规则可靠，暂无索引层压力。`);
            else
                observations.push(`重复查询 ${repeat} 次中有 ${driftQ} 次漂移：Node 派生可能不稳定，先别上索引，查派生规则。`);
        }
        else
            observations.push("重复查询为 0：样本不足，先积累重复查询再评稳定性。");
        for (const m of missing)
            observations.push(`检测到「${m.type}」型内容 ${m.count} 处，当前归类 [${Object.entries(m.currentTypes).map(([t, c]) => `${t}×${c}`).join("、")}]：如真实查询反复需要，再考虑补 ${m.type} 类型。`);
    }
    return { date: today(), agg, evidenceDensity, missing, observations, evByType: agg.evByType, evByKind: agg.evByKind, evByCreatedBy: agg.evByCreatedBy };
};
export const renderFitnessReport = (r) => {
    if (!r.agg || !r.agg.total) {
        // 与 `renderQueryLogSummary` 同款（v1.15.95）：`total:0` 不等于「还没采集」——
        // 读失败必须在这里也说真话，否则 `mode:"shadow-report"` 是同一个静默口的第二个出口。
        const why = r.agg?.readFailureNote
            ? `**读不到查询样本**（不是「还没采集」）：${r.agg.readFailure}`
            : `**无查询样本**：尚无 shadow_query 记录。先跑一轮真实工程任务，再回来生成报告。`;
        return `# Shadow Fitness Report\n\n> 生成：${r.date} · 依据：.shadow/query-log/*.jsonl（系统派生，rm -rf 可重建）\n\n${why}\n\n> 只诊断、不增强；判定为启发式观察，非结论。`;
    }
    const a = r.agg;
    const lines = [
        `# Shadow Fitness Report`,
        ``,
        `> 生成：${r.date} · 依据：.shadow/query-log/*.jsonl（系统派生，rm -rf 可重建）`,
        ``,
        `## Query Summary`,
        `- 总查询 ${a.total} · 平均候选节点 ${a.avgCandidate} → 返回 ${a.avgReturned} · 平均延迟 ${a.avgLatency}ms`,
        `- scope 使用：${Object.entries(a.scopeDist || {}).map(([k, c]) => `${k || "*"}×${c}`).join("、") || "—"}`,
        ``,
        `## Evidence Density（核心指标：dsh-shadow vs 普通 RAG）`,
        `- 有证据节点 / 总返回节点 = **${r.evidenceDensity}%**（阈值 ${EVIDENCE_HEALTHY}%）`,
        `- 平均每条返回节点证据数：${a.avgEvidence}`,
        ...(renderDim("按 type", r.evByType) ? [renderDim("按 type", r.evByType)] : []),
        ...(renderDim("按 kind（metadata 已排除）", r.evByKind) ? [renderDim("按 kind（metadata 已排除）", r.evByKind)] : []),
        ...(renderDim("按 createdBy", r.evByCreatedBy) ? [renderDim("按 createdBy", r.evByCreatedBy)] : []),
        ``,
        `## Stability（Node 是否稳定）`,
        `- 重复查询 ${a.repeatQueries} · 稳定 ${a.stableQueries} · 漂移 ${a.driftQueries}`,
        ...(a.drift && a.drift.length ? ["- 漂移查询：", ...a.drift.map((d) => `  - "${d.query}" 见过 ${d.seen} 次 · 不同结果集 ${d.distinctResultSets}`)] : []),
        ``,
        `## Node Distribution（返回节点类型分布）`,
        `- ${Object.entries(a.typeDist || {}).map(([t, c]) => `${t} ${c}`).join(" · ") || "—"}`,
        ``,
        `## Potential Missing Types`,
        ...(r.missing && r.missing.length
            ? r.missing.map((m) => `- **candidate: ${m.type}** — 「${m.type}」型内容 ${m.count} 处，当前归类 [${Object.entries(m.currentTypes).map(([t, c]) => `${t}×${c}`).join("、")}]。如真实查询反复需要，再补该类型（不提前设计）。`)
            : ["- 未检测到明显的缺失类型（约束/任务标记 < 3 处）。"]),
        ``,
        `## 观察与建议`,
        ...(r.observations && r.observations.length ? r.observations.map((o) => `- ${o}`) : []),
        ``,
        `> 只诊断、不增强；判定为启发式观察，非结论。`,
    ];
    // 有样本也可能**只读到一部分**（v1.15.95）：坏行与读失败都要落到正文上。
    if (a.badLinesNote)
        lines.push(`> ${a.badLinesNote}`);
    if (a.readFailureNote)
        lines.push(`> ${a.readFailureNote}`);
    return lines.join("\n");
};
/**
 * 把报告写成 .shadow/shadow-report.md（系统派生记录，rm -rf 可重建）。
 *
 * **裁定：这里的静默是正当的**（判据见 `core/projection-store.ts` 的「正当静默类判据」）——
 * 报告**正文**由调用方 `query/reads.ts:259` **原样返回给读者**，落盘只是留一份副本
 * ⇒ 写失败时**读者拿到的内容逐字节不变**。
 * 这正是它与 sidecar 写失败的区别（后者会让 `_index.md` 少一行 ⇒ 必须有信号）。
 *
 * **残留风险（写给后来者）**：本函数的**调用点**在 `mode:"shadow-report"` 的输出里说
 * 「生成 `.shadow/shadow-report.md`」，而这句话在写失败时**不成立**且无处可知。
 * 若将来有人依赖「跑过就一定有这个文件」，这条裁定要重新审 —— 那时它就不再是「冗余副本」了。
 */
export const writeShadowReport = async (fs, ws, text) => {
    if (!fs || !ws)
        return;
    try {
        const rel = `${SHADOW_ROOT}/shadow-report.md`;
        const target = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(target, text);
    }
    catch { /* 正当静默：正文已随返回值交付（见上方裁定），此处只是副本 */ }
};
