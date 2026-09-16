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
import { surveyCapabilities, renderSurvey, installCapability, renderInstall, precheckCapabilities, renderPrecheck } from "../core/toolset-exec.js";
import { createKnowledgeEngine, renderKnowledgeTree, buildCorpusTree, retrieveKnowledge, renderKnowledgeRetrieval, sectionPath, flattenSections, } from "../core/knowledge-engine.js";
import { summarizeQueryLog, renderQueryLogSummary, buildFitnessReport, renderFitnessReport, writeShadowReport } from "./observatory.js";
import { readManifest, renderManifest } from "../core/manifest.js";
import { loadOrBuildProjection, shadowSourcesFingerprint } from "../core/projection-store.js";
import { deriveShadowNodes, deriveShadowNodeFailures, queryShadow, matchShadowNodes, renderContext as renderShadowContext } from "../core/node.js";
import { listResourceCards, deriveResourceNodes } from "../core/resource.js";
import { recordQueryObservation, evidenceBreakdownOf } from "./observatory.js";
import { materializeAtoms } from "./materialize.js";
import { today, stamp, RECALL_PREFIX } from "../core/util.js";
import { scrubFinal } from "../security/scrub.js";
/**
 * 7 个 `materializeAtoms` 调用点共用的第 4 参（T17-B）：
 *   · `note`  —— D7 降级留痕（`deps.noteDegrade`，写进同一个能力降级台账 ⇒ 由 `getFlushWarn()` 渲染成横幅）；
 *   · `writable` / `dirtyRels` / `clearDirty` —— D13 可写吗 + D6 门③ 写侧精确信号。
 * 收敛成一处，免得同一件事在 7 个调用点各写一遍（本仓「判据收一处」）。
 */
const matOpts = (deps, ctx) => ({
    note: deps.noteDegrade,
    writable: ctx.writable,
    dirtyRels: ctx.dirtyRels,
    clearDirty: ctx.clearDirty,
});
// ── episode / decision：连续任务关系层 + 决策血统 ──
const episodeDecision = {
    modes: ["episode", "decision"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const { parsed } = await materializeAtoms(fs, ws, deps.config, matOpts(deps, ctx));
        if (String(args?.mode) === "episode") {
            // T8-B（v1.15.64）：此处原先自己算了一遍 `Math.max(0, Number(...) || 60)` —— 与
            // `core/writer-core.ts` 和 `core/episode.ts` 三处口径分叉，且都吞显式 0。
            // 默认值现只在 `deriveEpisodes` 里落一处，本处**原样传配置**。
            const eps = deriveEpisodes(parsed, { gapMinutes: deps.config.episodes?.gapMinutes });
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
        const { parsed } = await materializeAtoms(fs, ws, deps.config, matOpts(deps, ctx));
        const tasks = deriveTasks(parsed);
        return scrubFinal(RECALL_PREFIX + renderTasks(tasks, String(args?.topic || "").trim()) + flushWarn);
    },
};
// ── context：ContextReference（当前是否还能用，ADR-0040）──
const context = {
    modes: ["context"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const { parsed } = await materializeAtoms(fs, ws, deps.config, matOpts(deps, ctx));
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
        const { parsed } = await materializeAtoms(fs, ws, deps.config, matOpts(deps, ctx));
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
        // `parsedAtoms` 只被 `failures` 在**真正 rebuild 时**读取（此时 derive 刚跑过 ⇒ 已填充）；
        // 命中投影缓存时不会多付一次物化/解析代价（那是投影缓存存在的意义）。
        let parsedAtoms;
        const { nodes, cached } = await loadOrBuildProjection(fs, ws, deps.config, async () => {
            const { parsed } = await materializeAtoms(fs, ws, deps.config, matOpts(deps, ctx));
            parsedAtoms = parsed;
            // 记忆原子投影 + 资源卡投影（.shadow/resources/，无证据的卡片不上投影）
            const cards = await listResourceCards(fs, ws);
            return [...deriveShadowNodes(parsed), ...deriveResourceNodes(cards)];
        }, () => shadowSourcesFingerprint(fs, ws), () => (parsedAtoms ? deriveShadowNodeFailures(parsedAtoms) : []));
        const scope = Array.isArray(args?.scope) ? args.scope.filter((t) => ["memory", "code", "document", "decision", "concept", "resource"].includes(t)) : [];
        const limit = Math.max(1, Math.min(30, Number(args?.limit) || 8));
        const items = queryShadow(nodes, topicQ, scope, limit);
        // **截断必须披露**（v1.15.58）：检索路径早就有 `truncationNote`（`retrieval/render.ts:26`，
        // 借 PageIndex 的 `part/total_parts/has_more`），而 `shadow_query` 这里只把 `returnedNodes`
        // 写进 query-log、**返回文本里一个字都不提** ⇒ 同一份数据两条读路径披露不一致，
        // 读到「8 条」的人不知道其实命中了 30 条。
        const allMatched = matchShadowNodes(nodes, topicQ, scope);
        const matchedNodes = allMatched.slice(0, limit);
        const droppedByLimit = Math.max(0, allMatched.length - matchedNodes.length);
        const truncNote = droppedByLimit > 0
            ? `\n> ⚠ 命中 **${allMatched.length}** 个，只返回前 **${limit}** 个（**还有 ${droppedByLimit} 个未显示**：调大 \`limit\` 或收窄 \`topic\`/\`scope\`）。\n`
            : "";
        const nodeTypes = matchedNodes.reduce((acc, n) => { acc[n.type] = (acc[n.type] || 0) + 1; return acc; }, {});
        const bd = evidenceBreakdownOf(matchedNodes);
        // T8-A（v1.15.65）：`queryLog` 是**默认开启**的能力，旧代码写失败时 `catch {}` 静默 ⇒
        // 观测数据丢了，而 `mode:"query-log"` 只显示「尚无记录」，与「从没查过」不可区分。
        // 现在用返回值判断，失败就留痕（横幅对本函数的 `flushWarn` 是本回合**之前**取的，
        // 故本次失败在**下一次**读时才可见 —— 这是可接受的：留痕本身是持久的，不会被丢掉）。
        const obs = await recordQueryObservation(fs, ws, deps.config, {
            date: today(), ts: stamp(), query: topicQ, scope, limit,
            candidateNodes: nodes.length, projectionCached: cached, returnedNodes: items.length,
            evidenceCount: Array.from(new Set(items.flatMap((it) => it.evidence))).length,
            evidenceNodes: matchedNodes.filter((n) => n.evidence.length > 0).length,
            relationCount: matchedNodes.reduce((a, n) => a + n.relations.length, 0),
            relationNodes: matchedNodes.filter((n) => n.relations.length > 0).length,
            nodeTypes, nodeTitles: matchedNodes.map((n) => n.title), latencyMs: Date.now() - qStart,
            evidenceByType: bd.byType, evidenceByKind: bd.byKind, evidenceByCreatedBy: bd.byCreatedBy,
        });
        // 只在「本该写而写失败」时留痕：`fs`/`ws` 缺失与用户显式 `enabled:false` 都不算降级
        //（这两种情况下 `reason` 也是空的 —— 契约见 `recordQueryObservation`）。
        // v1.15.94：横幅里的原因用**真实 reason**，不再写死「`.shadow/query-log/` 不可写」——
        // 写死的口径把「读既有文件时不存在」这类真实原因说成了「不可写」，把排障引向错误方向。
        if (!obs.ok && obs.reason && fs && ws && deps.config?.queryLog?.enabled !== false) {
            deps.noteDegrade?.("queryLog", `观测记录写入失败（${obs.reason}）`, "查询观测数据**丢失**：`mode:\"query-log\"` 的统计建立在被削过的样本上，而它只显示「尚无记录」，与「从没查过」不可区分");
        }
        return scrubFinal(RECALL_PREFIX + renderShadowContext(topicQ, items) + truncNote + flushWarn);
    },
};
// ── knowledge：保留树 + 树上推理检索（带引用）─- LLM 只导航 ──
const knowledge = {
    modes: ["knowledge"],
    run: async (deps, args, _exec, ctx) => {
        const { fs, ws, flushWarn } = ctx;
        const parsedK = (await materializeAtoms(fs, ws, deps.config, matOpts(deps, ctx))).parsed;
        // v1.15.34（D8）：**无条件**建树 —— 这里**没有** `knowledgeEngine.enabled` 闸门
        //（该键生产零读取；`createKnowledgeEngine` 也不再收 config —— 它从来没用过）。
        // 本 mode 的唯一闸门是 `llmNavigate`（`core/writer.ts:79`，默认关）。
        const tree = await createKnowledgeEngine().build(parsedK);
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
// ── toolset：工具集台账（只读巡检 / 能力预检）+ 显式安装（审批门）──
// 巡检与预检都是只读的；安装只在显式传 `install:"<id>"` 时发生，且**一律先要审批**、
// 拿不到 `allowed-once` 就不装（见 core/toolset-exec.ts 的权限模型注释）。
const toolset = {
    modes: ["toolset"],
    run: async (deps, args, exec, _ctx) => {
        const flushWarn = deps.getFlushWarn();
        const installId = String(args?.install || "").trim();
        if (installId) {
            const o = await installCapability(installId, { approval: deps.approval, agent: exec?.agent });
            return scrubFinal(RECALL_PREFIX + renderInstall(o) + flushWarn);
        }
        // 能力预检（v1.15.13）：把「需要什么能力」翻译成「本机是否就位 / 缺了退到哪」。
        // 这是委派 × 工具集的接缝：派活前查，产出只用于**降级决策**，不是派活闸门。
        const needArgs = Array.isArray(args?.need) ? args.need : (args?.need ? [args.need] : []);
        if (needArgs.length) {
            const rows = await precheckCapabilities(needArgs.map((n) => String(n)));
            return scrubFinal(RECALL_PREFIX + renderPrecheck(rows) + flushWarn);
        }
        const opts = {
            survey: args?.survey === "all" ? "all" : "providers",
            category: args?.category ? String(args.category) : undefined,
        };
        const rows = await surveyCapabilities(opts);
        return scrubFinal(RECALL_PREFIX + renderSurvey(rows, opts) + flushWarn);
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
            parsedForReport = (await materializeAtoms(fs, ws, deps.config, matOpts(deps, ctx))).parsed;
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
export const readQueries = [episodeDecision, task, context, recovery, shadowQuery, knowledge, index, queryLog, shadowReport, shadowManifest, toolset];
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
