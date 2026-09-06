import { resolveWorkspace } from "../core/scope.js";
import { readRel, listMemories } from "../persistence/files.js";
import { readMeta, writeMeta } from "../persistence/meta.js";
import { readLedger, writeLedger } from "../retrieval/ledger.js";
import { tokenize, today, ageDaysOf, RECALL_PREFIX, parseAsOf } from "../core/util.js";
import { scoreMemory, breakdownOf, tierFor } from "../retrieval/rank.js";
import { renderByTier, noMatchText } from "../retrieval/render.js";
import { evidenceOf, provenanceText, newestByEntryOf, verdictOf, conflictOf, lessonOf, lineageOf } from "../observer/arbitrate.js";
import { evidencePathsOf, isPathLike } from "../evidence/paths.js";
import { lifecycleOf, hotnessOf } from "../core/lifecycle.js";
import { kgTrace } from "../observer/observer.js";
import { readSoul, soulText } from "../soul/soul.js";
import { readIdentity, renderIdentity } from "../soul/identity.js";
import { observerContextOf, renderObserverContext } from "../observer/core.js";
import { readObserverState } from "../observer/state.js";
import { recordObservationTrace } from "../observer/trace.js";
import { tasteOf, renderTaste } from "../soul/taste.js";
import { experienceOf, renderExperience } from "../core/experience.js";
import { judgmentOf, renderJudgment } from "../core/judgment.js";
import { projectContext, renderProjection } from "../observer/projection.js";
import { judgmentOfClaim, renderJudgments, claimOf } from "../observer/judgment.js";
import { reflectOf, renderReflection } from "../reflection/engine.js";
import { readCurrentIdentity } from "../identity/timeline.js";
import { advanceIdentity, renderEvaluator } from "../identity/evaluator.js";
import { scrubFinal, scrubUnsafe } from "../security/scrub.js";
export async function runReadShadow(deps, args, exec) {
    const agent = exec?.agent;
    const ws = resolveWorkspace(agent, deps.cwdBySession, deps.config);
    if (!ws)
        return "（无法确定工作区，shadow 不可用）";
    const fs = deps.fs;
    if (!fs)
        return "（fs 服务不可用）";
    const flushWarn = deps.getFlushWarn();
    // v0.24 Reflection：旁支（不是 Memory 查询），用 mode:"reflection" 而非 reflect:true 布尔。
    if (String(args?.mode) === "reflection") {
        const r = await reflectOf(fs, ws, { observerId: agent?.id || "unknown", period: { from: String(args?.from || ""), to: String(args?.to || today()) } });
        return scrubFinal(RECALL_PREFIX + renderReflection(r) + flushWarn);
    }
    // v0.25 Identity Continuity：读反思→Candidate→三道闸门→接受者推进 timeline（不自动改 soul.json）。
    if (String(args?.mode) === "identity") {
        const current = await readCurrentIdentity(fs, ws, agent?.id);
        const { model, decisions } = await advanceIdentity(fs, ws, current, {
            minCount: Math.max(1, Number(args?.minCount) || 5),
            minRecency: Number(args?.minRecency) || 0.4,
            maxContradiction: Number(args?.maxContradiction) || 0.3,
            halfLifeDays: Math.max(1, Number(args?.halfLifeDays) || 90),
        });
        return scrubFinal(RECALL_PREFIX + renderEvaluator(decisions, model) + flushWarn);
    }
    const recallCfg = deps.config.recall ?? {};
    const retentionCfg = deps.config.retention ?? {};
    if (args?.soul) {
        const soul = await readSoul(fs, ws);
        if (!soul)
            return scrubFinal(RECALL_PREFIX + "（无 Soul 配置：可在 shadow/soul/soul.json 定义 身份/价值观/原则/品味/边界）" + flushWarn);
        return scrubFinal(RECALL_PREFIX + soulText(soul) + flushWarn);
    }
    if (args?.taste) {
        const soul = await readSoul(fs, ws);
        const t = await tasteOf(fs, ws, soul);
        return scrubFinal(RECALL_PREFIX + renderTaste(t) + flushWarn);
    }
    // v0.20 Observer Kernel：Identity 主体锚 + ObserverContext（谁在看/为什么看/从哪层看）。
    if (args?.identity) {
        const identity = await readIdentity(fs, ws, agent?.id);
        return scrubFinal(RECALL_PREFIX + renderIdentity(identity) + flushWarn);
    }
    if (args?.context) {
        const identity = await readIdentity(fs, ws, agent?.id);
        const soul = await readSoul(fs, ws);
        const state = await readObserverState(fs, ws, soul, args.state);
        const ctx = observerContextOf(args, String(args?.topic || "").trim(), identity, agent?.id, state);
        return scrubFinal(RECALL_PREFIX + renderObserverContext(ctx) + flushWarn);
    }
    const topic = String(args?.topic || "").trim();
    if (!topic) {
        const idx = await readRel(fs, ws, "shadow/_index.md");
        return scrubFinal(RECALL_PREFIX + (idx || "（暂无 shadow 索引）") + flushWarn);
    }
    const limit = Math.max(1, Math.min(30, Number(args?.limit) || 10));
    const maxTokens = Math.max(256, Math.min(8000, Number(args?.max_tokens) || 1600));
    const maxChars = maxTokens * 4;
    let memories = await listMemories(fs, ws);
    const debugMode = recallCfg.debug === true || Boolean(args?.debug);
    const diag = [];
    const asOf = parseAsOf(args?.asOf);
    const observerMode = Boolean(args?.observer);
    if (asOf)
        memories = memories.filter((m) => m.date <= asOf.date);
    if (debugMode)
        diag.push(`候选 ${memories.length}${asOf ? ` · asOf<=${asOf.date}` : ""}`);
    // v0.23 Observation Trace：旁路记录观察轨迹（不影响 recall/排序/答案）；ObserverState 只读取不自动推断。
    const obsSoul = await readSoul(fs, ws);
    const obsIdentity = await readIdentity(fs, ws, agent?.id);
    const obsState = await readObserverState(fs, ws, obsSoul, args.state);
    const obsCtx = observerContextOf(args, topic, obsIdentity, agent?.id, obsState);
    let tokens = tokenize(topic);
    if (!tokens.length)
        tokens = [String(topic).toLowerCase()];
    if (recallCfg.enabled === true && recallCfg.provider && recallCfg.model) {
        const extra = await deps.expandTerms(topic);
        if (extra.length)
            tokens = Array.from(new Set([...tokens, ...extra]));
    }
    if (args?.project) {
        const soul = await readSoul(fs, ws);
        const identity = await readIdentity(fs, ws, agent?.id);
        const state = await readObserverState(fs, ws, soul, args.state);
        const ctx = observerContextOf(args, topic, identity, agent?.id, state);
        const project = ws.split(/[\\/]/).filter(Boolean).pop() || ws;
        const task = `${ctx.intent.goal} ${ctx.intent.question}`.trim() || topic;
        const p = await projectContext(fs, ws, memories, task, soul, deps.verifyEvidence, identity.observerLens || args.lens, identity, ctx.intent);
        await recordObservationTrace(fs, ws, {
            observerId: ctx.observerId,
            createdAt: today(),
            realityAnchor: ctx.realityAnchor,
            intent: ctx.intent,
            projection: { visible: p.visible || [], hidden: p.hidden || [], distortion: p.distortion?.reason ? [p.distortion.reason] : [] },
            uncertainty: { level: p.unc.length, reasons: p.unc.slice(0, 3) },
            metadata: { source: "projection" },
            state: ctx.state,
        });
        return scrubFinal(RECALL_PREFIX + renderProjection(p, topic, project, ctx) + flushWarn);
    }
    if (args?.judgment) {
        const js = await judgmentOf(fs, ws, memories, topic);
        return scrubFinal(RECALL_PREFIX + renderJudgment(js) + flushWarn);
    }
    if (args?.claim) {
        const identity = await readIdentity(fs, ws, agent?.id);
        const ctx = observerContextOf(args, topic, identity, agent?.id);
        const tokens = tokenize(topic);
        const js = [];
        for (const mm of memories) {
            let matched = !topic;
            if (!matched) {
                const text = await readRel(fs, ws, mm.rel);
                matched = !!text && tokens.some((t) => `${claimOf(text)} ${mm.rel}`.toLowerCase().includes(t));
            }
            if (!matched)
                continue;
            const j = await judgmentOfClaim(fs, ws, mm, { observerId: ctx.observerId, lens: ctx.lens, identity }, deps.verifyEvidence);
            if (j)
                js.push(j);
        }
        return scrubFinal(RECALL_PREFIX + renderJudgments(js) + flushWarn);
    }
    if (args?.verify) {
        const texts = [];
        for (const mm of memories) {
            const text = await readRel(fs, ws, mm.rel);
            if (!text)
                continue;
            const exp = experienceOf(text, mm);
            const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
            if (tokens.some((t) => hay.includes(t)))
                texts.push(text);
        }
        const rows = [];
        const ctx = { fs, ws };
        for (const text of texts.slice(0, 3)) {
            for (const p of evidencePathsOf(text).filter(isPathLike).slice(0, 6)) {
                const r = await deps.verifyEvidence({ path: p, kind: "path" }, ctx);
                rows.push(`${r.status}  ${p}  (provider=${r.source} · freshness=${r.freshness} · conf=${r.confidence.toFixed(2)})`);
            }
        }
        return scrubFinal(RECALL_PREFIX + "[Evidence Verify]" + (rows.length ? "\n" + rows.join("\n") : "\n（无可验证证据路径）") + flushWarn);
    }
    if (args?.experience) {
        const matched = [];
        const entryList = [];
        for (const mm of memories) {
            const text = await readRel(fs, ws, mm.rel);
            if (!text)
                continue;
            const exp = experienceOf(text, mm);
            entryList.push({ entry: exp.situation, date: mm.date, time: mm.time });
            const hay = `${exp.situation} ${exp.problem} ${exp.decision} ${exp.evidence}`.toLowerCase();
            if (tokens.some((t) => hay.includes(t)))
                matched.push({ exp, mm, text });
        }
        if (!matched.length)
            return noMatchText(topic, flushWarn);
        const newest = newestByEntryOf(entryList);
        const exps = [];
        for (const { exp, mm, text } of matched) {
            const conflict = await conflictOf(fs, ws, text, deps.verifyEvidence);
            const v = verdictOf(conflict.missing.length, exp.situation, mm.date, mm.time, newest);
            exp.verdict = v.verdict;
            exp.outcome = v.outcome;
            exp.reflection = v.reflection;
            exp.lesson = lessonOf(v);
            exps.push(exp);
        }
        return scrubFinal(RECALL_PREFIX + exps.map(renderExperience).join("\n\n") + flushWarn);
    }
    const scored = [];
    const entryList = [];
    const entryLineage = new Map();
    const meta = await readMeta(fs, ws);
    const halfLife = Math.max(0.01, Number(retentionCfg.halfLifeDays) || 7);
    for (const mm of memories) {
        const text = await readRel(fs, ws, mm.rel);
        if (!text)
            continue;
        const entry = (text.match(/^# (.+)$/m) || [])[1] || "";
        entryList.push({ entry, date: mm.date, time: mm.time });
        const decisionTxt = (text.match(/^> 用户提示\/决策：(.+)$/m) || [])[1] || "";
        if (!entryLineage.has(entry))
            entryLineage.set(entry, []);
        entryLineage.get(entry).push({ date: mm.date, time: mm.time, decision: decisionTxt });
        const tier = tierFor(text);
        let score = scoreMemory(text, mm.rel, entry, tokens);
        const originM = text.match(/^> 来源会话：(.+)$/m);
        const origin = originM ? scrubUnsafe(originM[1]).trim() : "";
        const staleDays = Math.max(1, Number(retentionCfg.staleDays) || 7);
        let stale = ageDaysOf(mm.rel) >= staleDays;
        if (retentionCfg.enabled) {
            const rec = meta[mm.rel];
            if (rec && rec.status && rec.status !== "active" && !rec.pinned)
                continue;
            const h = hotnessOf(rec ? rec.hits : 0, ageDaysOf(mm.rel), halfLife);
            score = score * (0.5 + h * 2);
            if (rec && rec.status === "stale")
                stale = true;
            if (h < 0.15)
                stale = true;
        }
        if (score > 0) {
            const conflict = await conflictOf(fs, ws, text, deps.verifyEvidence);
            if (conflict.missing.length) {
                score = score * 0.5;
                stale = true;
            }
            const ev = evidenceOf(text, mm, meta, stale);
            ev.conflict = conflict.missing.length;
            ev.lifecycle = lifecycleOf(meta[mm.rel], ageDaysOf(mm.rel), conflict.missing.length, stale);
            scored.push({ mm, text, entry, tier, score, tokens, origin, stale, currentOrigin: agent?.id, provenance: provenanceText(ev), evidence: ev, breakdown: breakdownOf(text, mm.rel, entry, tokens), conflict: conflict.missing, observer: observerMode, asOf });
        }
    }
    const newest = newestByEntryOf(entryList);
    for (const s of scored) {
        const v = verdictOf(s.evidence.conflict || 0, s.entry, s.mm.date, s.mm.time, newest);
        s.superseded = v.superseded;
        s.verdict = v.verdict;
        s.outcome = v.outcome;
        s.reflection = v.reflection;
        if (v.superseded)
            s.score = s.score * 0.7;
        s.evidence.verdict = v.verdict;
        s.evidence.outcome = v.outcome;
        s.evidence.reflection = v.reflection;
        s.evidence.lineage = lineageOf(entryLineage.get(s.entry) || []);
        s.provenance = provenanceText(s.evidence);
    }
    scored.sort((a, b) => b.score - a.score || b.mm.date.localeCompare(a.mm.date));
    if (debugMode)
        diag.push(`命中（打分>0）${scored.length}`);
    if (!scored.length)
        return noMatchText(topic, flushWarn) + (debugMode ? "\n\n" + diag.join("\n") : "");
    const cooldownTurns = Math.max(0, Number(recallCfg.cooldownTurns) || 0);
    const ledger = await readLedger(fs, ws);
    const turn = (ledger.turn || 0) + 1;
    const available = [];
    let cooledCount = 0;
    for (const s of scored) {
        const rec = ledger.served && ledger.served[s.mm.rel];
        const cooled = cooldownTurns > 0 && rec && rec.detail && typeof rec.turn === "number" && turn - rec.turn <= cooldownTurns;
        if (cooled) {
            if (debugMode)
                diag.push(`降权·cooldown ${s.mm.rel}`);
            cooledCount++;
            continue;
        }
        available.push(s);
    }
    if (debugMode)
        diag.push(`可用（未冷却）${available.length}${cooledCount ? ` · 冷却 ${cooledCount}` : ""}`);
    if (!available.length)
        return noMatchText(topic, flushWarn) + (debugMode ? "\n\n" + diag.join("\n") : "");
    const n = available.length;
    const parts = [];
    let used = 0;
    const servedDetail = [];
    for (const s of available) {
        if (parts.length >= limit)
            break;
        const sharedPool = Math.max(0, Math.floor((maxChars - used) / Math.max(1, n)));
        const cap = Math.max(120, Math.floor((maxChars / n) * 2) + sharedPool);
        let render = renderByTier(s, cap, false, tokens);
        if (used + render.length > maxChars) {
            const degraded = renderByTier(s, cap, true, tokens);
            if (used + degraded.length > maxChars)
                break;
            render = degraded;
        }
        parts.push(render);
        used += render.length;
        if (debugMode) {
            const b = s.breakdown || {};
            diag.push(`返回 ${s.mm.rel} · 命中 ${s.score} · 入口${b.entry || 0} 主题${b.topic || 0} 路径${b.path || 0} 正文${b.body || 0}${s.evidence ? ` · 状态${s.evidence.status}` : ""}`);
        }
        if (s.tier !== "L0" && render.includes("…"))
            servedDetail.push(s.mm.rel);
    }
    if (debugMode)
        diag.push(`预算 ${maxChars} 字 · 返回 ${parts.length} 条`);
    if (cooldownTurns > 0 && servedDetail.length) {
        const nextServed = Object.assign({}, ledger.served || {});
        for (const p of servedDetail)
            nextServed[p] = { turn, detail: true };
        for (const k of Object.keys(nextServed)) {
            if (turn - nextServed[k].turn > cooldownTurns * 4)
                delete nextServed[k];
        }
        const keys = Object.keys(nextServed);
        if (keys.length > 500) {
            keys.sort((a, b) => (nextServed[a].turn || 0) - (nextServed[b].turn || 0)).slice(0, keys.length - 500).forEach((k) => delete nextServed[k]);
        }
        await writeLedger(fs, ws, { turn, served: nextServed });
    }
    if (servedDetail.length) {
        const next = await readMeta(fs, ws);
        const observer = agent?.id ? String(agent.id) : "";
        for (const p of servedDetail) {
            const rec = next[p] || { created: today(), hits: 0, status: "active", confidence: 0.5, pinned: false, createdBy: "", confirmedBy: [] };
            rec.hits = (rec.hits || 0) + 1;
            rec.lastSeen = turn;
            if (observer) {
                const cb = Array.isArray(rec.confirmedBy) ? rec.confirmedBy : [];
                if (observer !== (rec.createdBy || "") && !cb.includes(observer)) {
                    cb.push(observer);
                    rec.confirmedBy = cb.slice(-10);
                }
            }
            next[p] = rec;
        }
        await writeMeta(fs, ws, next);
    }
    const kgBlock = args?.kg ? await kgTrace(fs, ws, memories, topic) : "";
    const out = scrubFinal(RECALL_PREFIX + (kgBlock ? kgBlock + "\n\n" : "") + (debugMode ? diag.join("\n") + "\n\n" : "") + parts.join("\n\n") + flushWarn);
    await recordObservationTrace(fs, ws, {
        observerId: obsCtx.observerId,
        createdAt: today(),
        realityAnchor: obsCtx.realityAnchor,
        intent: obsCtx.intent,
        projection: { visible: available.slice(0, limit).map((s) => s.entry || s.mm?.name || ""), hidden: [], distortion: obsCtx.intent.goal ? [obsCtx.intent.goal] : [] },
        uncertainty: { level: available.length ? 0 : memories.length, reasons: [] },
        metadata: { source: "read_shadow" },
        state: obsCtx.state,
    });
    return out;
}
