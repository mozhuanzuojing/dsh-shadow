// dsh-shadow —— core/node.ts：Shadow Projection Layer（ADR-0042/0043，Phase 1A）。
// ShadowNode = 派生投影（不是事实源）：从 Memory Atom（memory/decision/code/document）
// 聚合出的统一节点视图。投影可重建（shadow-index/ 可 rm -rf），Node 不覆盖 Atom。
// 契约：Evidence=所有返回项带 evidence(指向 Atom)；relations 只从可观察信号派生(AST/路径/目标/证据)，
//       LLM 不能制造关系；无证据的 context 不返回。
import { slug } from "./util.js";
import { scrubUnsafe } from "../security/scrub.js";
const CODE_EXT = /\.(java|kt|ts|tsx|js|jsx|py|go|rs|vue|scala|cs|cpp|c|h|sql|xml|json|yaml|yml)$/i;
const DOC_EXT = /\.(md|markdown|pdf|docx?|txt|rst)$/i;
const CODE_PREFIX = /(src|backend|frontend|impl|core|main|api|io|service|controller|module)\//;
export const nodeTypeOf = (p) => {
    const entry = String(p.entry || "");
    if (p.decisions.length || p.goal)
        return "decision";
    if (CODE_EXT.test(entry) || CODE_PREFIX.test(entry))
        return "code";
    if (DOC_EXT.test(entry))
        return "document";
    if (/^(spec|adr|docs?|规范|文档)/.test(entry))
        return "document";
    return "memory";
};
// ShadowNode 视图：每条 Memory Atom → 一个 ShadowNode（投影，不覆盖 Atom）。
export const deriveShadowNodes = (parsed) => {
    const nodes = [];
    for (const p of parsed) {
        const entry = p.entry || p.goal || "memory";
        const type = nodeTypeOf(p);
        const id = `sn-${p.date}-${p.time || "000000"}-${slug(entry)}`;
        const content = [...(p.decisions || []).slice(0, 5), ...(p.actions || []).slice(0, 3), ...(p.thinkLines || []).slice(0, 3)].map((x) => scrubUnsafe(String(x || "")).slice(0, 80));
        const evidence = (p.materials || []).slice(0, 6).map((x) => scrubUnsafe(String(x || "")).slice(0, 80));
        const relations = [];
        for (const ev of evidence)
            relations.push({ type: "references", target: ev, source: "evidence" });
        if (p.goal && p.goal !== entry)
            relations.push({ type: "objective", target: scrubUnsafe(String(p.goal || "")).slice(0, 60), source: "goal" });
        if (p.project)
            relations.push({ type: "belongs_to", target: scrubUnsafe(String(p.project || "")).slice(0, 60), source: "project" });
        nodes.push({ id, type, source: p.rel, title: scrubUnsafe(String(entry || "")).slice(0, 60), content, evidence, relations });
    }
    return nodes;
};
// shadow.query 的匹配：按 scope + query 过滤，返回命中节点（AND 匹配），供上下文组装与观测层复用。
export const matchShadowNodes = (nodes, query, scope) => {
    const q = String(query || "").toLowerCase();
    const scopeSet = scope && scope.length ? new Set(scope) : null;
    const tokens = q ? Array.from(new Set(q.split(/[\s,，。、；:：]+/).filter(Boolean))) : [];
    return nodes.filter((n) => {
        if (scopeSet && !scopeSet.has(n.type))
            return false;
        if (!q)
            return true;
        const hay = [n.title, ...n.content, ...n.evidence, ...n.relations.map((r) => r.target)].join(" ").toLowerCase();
        return tokens.every((t) => hay.includes(t)); // AND 匹配（需全部词命中）
    });
};
export const queryShadow = (nodes, query, scope, limit = 8) => matchShadowNodes(nodes, query, scope).slice(0, limit).map((n) => ({ type: n.type, title: n.title, content: n.content.slice(0, 6), evidence: n.evidence, source: n.source }));
export const renderContext = (query, items) => {
    if (!items.length)
        return `（${query ? `shadow.query 未命中：${query}` : "无节点"}）`;
    const seg = [`# Shadow Query · ${query || "（全部）"}`, ""];
    for (const it of items) {
        seg.push(`## [${it.type}] ${it.title}`);
        seg.push(`- 内容：${it.content.join("；") || "—"}`);
        seg.push(`- 证据：${it.evidence.join("、") || "—"}  ·  源：${it.source.split("/").slice(-1)[0]}`);
        seg.push("");
    }
    seg.push("> ShadowNode 为派生投影（非事实源）；证据指向 Atom（源文件/文档），可追溯。");
    return seg.join("\n");
};
