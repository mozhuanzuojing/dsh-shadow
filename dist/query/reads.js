// dsh-shadow —— query/reads.ts：ReadQuery 深 seam（候选 1，方案 A）。
// 把「read 概念」从 query.ts 的 61 分支 god monolith 立成满足同一 seam 的深模块。
//   每个读概念一个 ReadQuery handler：mode 命中 -> run(deps,args,exec,ctx) -> 派生+渲染（带 RECALL_PREFIX+flushWarn）。
// 共享物化由 query/materialize.ts 提供（`materializeAtoms` 唯一定义，收敛重复脚手架）。
import { deriveEpisodes, renderEpisodes, deriveDecisions, renderDecisions, } from "../core/episode.js";
import { deriveTasks, renderTasks } from "../core/task.js";
import { deriveContextReferences, renderContextRefs } from "../core/context.js";
import { renderRecovery, renderRecoveryFor } from "../core/recall.js";
import { createIndexEngine } from "../core/index-engine.js";
import { unavailableHint } from "../core/toolset.js";
import { createKnowledgeEngine, renderKnowledgeTree, buildCorpusTree, retrieveKnowledge, renderKnowledgeRetrieval, sectionPath, flattenSections, } from "../core/knowledge-engine.js";
import { summarizeQueryLog, renderQueryLogSummary, buildFitnessReport, renderFitnessReport, writeShadowReport } from "./observatory.js";
import { readManifest, renderManifest } from "../core/manifest.js";
import { loadOrBuildProjection } from "../core/projection-store.js";
import { deriveShadowNodes, queryShadow, matchShadowNodes, renderContext as renderShadowContext } from "../core/node.js";
import { listResourceCards, deriveResourceNodes } from "../core/resource.js";
import { recordQueryObservation, evidenceBreakdownOf } from "./observatory.js";
import { materializeAtoms } from "./materialize.js";
import { today, stamp, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
// ── episode / decision：连续任务关系层 + 决策血统 ──
const episodeDecision = {
    modes: ["episode", "decision"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const { parsed } = await materializeAtoms(fs, ws, deps.config);
        if (String(args?.mode) === "episode") {
            const eps = deriveEpisodes(parsed, { gapMinutes: Math.max(0, Number(deps.config.episodes?.gapMinutes) || 60) });
            return scrubFinal(RECALL_PREFIX + renderEpisodes(eps, String(args?.topic || "").trim()) + flushWarn);
        }
        const dl = deriveDecisions(parsed, { topic: String(args?.topic || "").trim(), entry: String(args?.entry || "").trim() });
        return scrubFinal(RECALL_PREFIX + renderDecisions(dl) + flushWarn);
    },
};
// ── task：任务生命周期一等视图（ADR-0039）──
const task = {
    modes: ["task"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const { parsed } = await materializeAtoms(fs, ws, deps.config);
        const tasks = deriveTasks(parsed);
        return scrubFinal(RECALL_PREFIX + renderTasks(tasks, String(args?.topic || "").trim()) + flushWarn);
    },
};
// ── context：ContextReference（当前是否还能用，ADR-0040）──
const context = {
    modes: ["context"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const { parsed } = await materializeAtoms(fs, ws, deps.config);
        const mappings = (deps.config.context && deps.config.context.mappings) || [];
        const refs = await deriveContextReferences(parsed, deps.verifyEvidence, { fs, ws }, mappings);
        return scrubFinal(RECALL_PREFIX + renderContextRefs(refs, String(args?.topic || "").trim()) + flushWarn);
    },
};
// ── recovery：Task Recovery Bundle + Active Context（LLM 只导航/排序，内容仍派生）──
// ADR-0050：正名 mode:"recovery"；废止 mode:"recall"。
// 易混：≠ Continuity 的 recall-*（query/recall.ts）；≠ 主题召回（无 mode + topic）；≠ config.recall（语义扩词）。
// 工具名 recall_shadow 仍合法，内部即本 handler。
const recovery = {
    modes: ["recovery"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const { parsed } = await materializeAtoms(fs, ws, deps.config);
        const tasks = deriveTasks(parsed);
        const mappings = (deps.config.context && deps.config.context.mappings) || [];
        const refs = await deriveContextReferences(parsed, deps.verifyEvidence, { fs, ws }, mappings);
        const llmCfg = deps.config.llmRecall ?? {};
        let out;
        if (llmCfg.enabled === true && deps.recallSelect) {
            const candidates = tasks.map((t, i) => ({ id: String(i), title: t.title, objective: t.objective, summary: (t.decisions[0] && t.decisions[0].text) || t.outcomes[0] || "" }));
            const idx = await deps.recallSelect(String(args?.topic || "").trim(), candidates);
            out = (idx.length && idx[0] < tasks.length) ? renderRecoveryFor(String(args?.topic || "").trim(), tasks[idx[0]], refs) : renderRecovery(String(args?.topic || "").trim(), tasks, refs);
        }
        else {
            out = renderRecovery(String(args?.topic || "").trim(), tasks, refs);
        }
        return scrubFinal(RECALL_PREFIX + out + flushWarn);
    },
};
// ── shadow_query：统一 ShadowNode View + 跨类型上下文 + 旁路观测 + 可选 Projection 缓存 ──
const shadowQuery = {
    modes: ["query"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const topicQ = String(args?.topic || "").trim();
        const qStart = Date.now();
        const { nodes, cached } = await loadOrBuildProjection(fs, ws, deps.config, async () => {
            const { parsed } = await materializeAtoms(fs, ws, deps.config);
            // 记忆原子投影 + 资源卡投影（.shadow/resources/，无证据的卡片不上投影）
            const cards = await listResourceCards(fs, ws);
            return [...deriveShadowNodes(parsed), ...deriveResourceNodes(cards)];
        });
        const scope = Array.isArray(args?.scope) ? args.scope.filter((t) => ["memory", "code", "document", "decision", "concept", "resource"].includes(t)) : [];
        const limit = Math.max(1, Math.min(30, Number(args?.limit) || 8));
        const items = queryShadow(nodes, topicQ, scope, limit);
        const matchedNodes = matchShadowNodes(nodes, topicQ, scope).slice(0, limit);
        const nodeTypes = matchedNodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
        const bd = evidenceBreakdownOf(matchedNodes);
        await recordQueryObservation(fs, ws, deps.config, {
            date: today(), ts: stamp(), query: topicQ, scope, limit,
            candidateNodes: nodes.length, projectionCached: cached, returnedNodes: items.length,
            evidenceCount: Array.from(new Set(items.flatMap((it) => it.evidence))).length,
            evidenceNodes: matchedNodes.filter((n) => n.evidence.length > 0).length,
            relationCount: matchedNodes.reduce((a, n) => a + n.relations.length, 0),
            relationNodes: matchedNodes.filter((n) => n.relations.length > 0).length,
            nodeTypes, nodeTitles: matchedNodes.map((n) => n.title), latencyMs: Date.now() - qStart,
            evidenceByType: bd.byType, evidenceByKind: bd.byKind, evidenceByCreatedBy: bd.byCreatedBy,
        });
        return scrubFinal(RECALL_PREFIX + renderShadowContext(topicQ, items) + flushWarn);
    },
};
// ── knowledge：保留树 + 树上推理检索（带引用）─- LLM 只导航 ──
const knowledge = {
    modes: ["knowledge"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const parsedK = (await materializeAtoms(fs, ws, deps.config)).parsed;
        const tree = await createKnowledgeEngine(deps.config).build(parsedK);
        const topicK = String(args?.topic || "").trim();
        if (topicK) {
            let hits = retrieveKnowledge(tree, topicK);
            const cited = hits.map((h) => ({ ...h, __path: sectionPath(tree, h) }));
            if (deps.knowledgeNavigate) {
                const sections = flattenSections(tree);
                const picks = await deps.knowledgeNavigate(topicK, sections.map((s) => ({ id: s.id, title: s.title, content: s.content })));
                if (picks.length) {
                    const picked = picks.map((i) => sections[i]).filter(Boolean).map((s) => ({ ...s, __path: s.summary || "" }));
                    return scrubFinal(RECALL_PREFIX + renderKnowledgeRetrieval(tree, picked, topicK) + "\n\n（v1.10.0 LLM 树上导航：LLM 只选章节编号，事实仍从树派生；未纳入生成）" + flushWarn);
                }
            }
            return scrubFinal(RECALL_PREFIX + renderKnowledgeRetrieval(tree, cited, topicK) + "\n\n（ADR-0047：树上推理检索；LLM 导航未启用/失败 → 确定性检索）" + flushWarn);
        }
        const corpus = buildCorpusTree(parsedK);
        const corpusTree = { provider: "tree", root: corpus, sourceCount: corpus.length };
        return scrubFinal(RECALL_PREFIX + renderKnowledgeTree(corpusTree) + "\n\n（ADR-0047：免向量保留树；不转 vector/chunk）" + flushWarn);
    },
};
// ── index：Index Engine 候选生成（fs 默认全量 | zg 复用 provider | semble 本地语义检索）──
const index = {
    modes: ["index"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const engine = createIndexEngine(deps.config);
        const r = await engine.generateCandidates(String(args?.topic || "").trim(), { ws, workspace: ws });
        const lines = [`# Index Engine · provider=${r.provider}${r.unavailable ? " · unAvailable(未装，勿当 verified)" : ""}`, ""];
        if (r.refs.length)
            for (const ref of r.refs)
                lines.push(`- ${ref.type} ${ref.locator}${ref.fragment?.start ? `:${ref.fragment.start}` : ""}`);
        else
            lines.push(r.provider === "fs" ? "- （fs: 全量扫描，无候选预筛）" : `- （${r.provider} 未产出候选：未装、超时或未命中）`);
        // ADR-0049 的延伸（v1.15.8）：缺件不只报 unavailable，还给**可执行的确切命令**。
        // 插件不代装（见 core/toolset.ts 头的边界依据）；命令由 agent 经宿主 approval 栈执行。
        if (r.unavailable) {
            const hint = unavailableHint(r.provider, r.reason);
            if (hint)
                lines.push("", hint);
        }
        return scrubFinal(RECALL_PREFIX + lines.join("\n") + flushWarn);
    },
};
// ── query-log：Shadow Query Observatory 汇总（命中/证据/关系/类型分布 + 稳定性）──
const queryLog = {
    modes: ["query-log"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const s = await summarizeQueryLog(fs, ws);
        return scrubFinal(RECALL_PREFIX + renderQueryLogSummary(s, String(args?.topic || "").trim()) + flushWarn);
    },
};
// ── shadow-report：Shadow Fitness Report（诊断而非增强；生成 .shadow/shadow-report.md）──
const shadowReport = {
    modes: ["shadow-report"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const agg = await summarizeQueryLog(fs, ws);
        let parsedForReport = [];
        if (agg.total > 0)
            parsedForReport = (await materializeAtoms(fs, ws, deps.config)).parsed;
        const report = buildFitnessReport(agg, parsedForReport);
        const text = renderFitnessReport(report);
        await writeShadowReport(fs, ws, scrubFinal(text));
        return scrubFinal(RECALL_PREFIX + text + flushWarn);
    },
};
// ── shadow-manifest：索引投影元数据 + 诊断（ADR-0048⑧）──
const shadowManifest = {
    modes: ["shadow-manifest"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const m = await readManifest(fs, ws);
        return scrubFinal(RECALL_PREFIX + renderManifest(m) + flushWarn);
    },
};
export const readQueries = [episodeDecision, task, context, recovery, shadowQuery, knowledge, index, queryLog, shadowReport, shadowManifest];
const modeOf = (args) => String(args?.mode || "");
export const findReadQuery = (args) => {
    const m = modeOf(args);
    return readQueries.find((q) => q.modes.includes(m) || (m === "query" && args?.shadowQuery));
};
/** 若 mode 命中某 ReadQuery，则交给它并返回；否则返回 undefined（交由 runReadShadow 继续走内联分支）。 */
export const dispatchReadQuery = async (deps, args, exec, ctx) => {
    const q = findReadQuery(args);
    if (!q)
        return undefined;
    return q.run(deps, args, exec, ctx);
};
