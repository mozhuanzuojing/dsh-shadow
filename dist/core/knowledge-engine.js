import { nodeTypeOf } from "./node.js";
/** 把一条规范/文档的内容按「标题层级」建成树（标题行 #/##/###/… → 层级）。纯派生，不补充事实。 */
export const buildTree = (doc) => {
    const root = { title: doc.entry || (doc.goal ? `目标：${doc.goal}` : "规范"), level: 0, content: "", children: [] };
    const stack = [root];
    const pushLine = (line, level) => {
        const heading = line.replace(/^#+\s*/, "").trim();
        const node = { title: heading || line, level, content: "", children: [] };
        // 压栈：只保留 <= level 的祖先
        while (stack.length > 1 && stack[stack.length - 1].level >= level)
            stack.pop();
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    };
    // 正文行：`- [time] ...`。`# ` 开头为标题，其余作为上一节点内容。
    for (const raw of String(doc.body || "").split("\n")) {
        const l = raw.trim();
        if (!l)
            continue;
        const m = l.match(/^(#{1,6})\s+(.+)$/);
        if (m) {
            pushLine(l, m[1].length);
            continue;
        }
        // 普通行归入栈顶节点
        const top = stack[stack.length - 1];
        if (top && l !== top.title)
            top.content = (top.content ? top.content + "；" : "") + l.slice(0, 60);
    }
    return root;
};
/** TreeKnowledgeEngine：从文档/规范/决策 Atom 派生知识树（保留层级，不转 chunk）。 */
export const createKnowledgeEngine = (config) => ({
    async build(parsed, nodes = []) {
        const docs = (parsed || []).filter((p) => nodeTypeOf(p) === "document" || /规范|spec|docs?/i.test(String(p.entry || "")));
        const sourceCount = docs.length;
        const root = docs.map((d) => buildTree(d));
        return { provider: "tree", root, sourceCount };
    },
});
/** 渲染知识树（缩进 + 层级）；供 report/查询展示。 */
export const renderKnowledgeTree = (tree) => {
    if (!tree.root.length)
        return "（knowledge: 尚无文档/规范树）";
    const lines = [`# Knowledge Tree · ${tree.provider} · 来源 ${tree.sourceCount}`, ""];
    const walk = (nodes, depth) => {
        for (const n of nodes) {
            lines.push(`${"  ".repeat(depth)}- ${n.title}${n.content ? ` — ${n.content}` : ""}`);
            if (n.children.length)
                walk(n.children, depth + 1);
        }
    };
    walk(tree.root, 0);
    return lines.join("\n");
};
// ── ADR-0047：吸收 PageIndex/zg 思想（免向量树 + 推理检索 + 语料树）──
/** 语句检索：在树里按 query 匹配节点（自然章节为单元；LLM 导航是后续 gated 步，此处为确定性走树）。 */
export const retrieveKnowledge = (tree, query, limit = 10) => {
    const q = String(query || "").toLowerCase();
    const tokens = Array.from(new Set(q.split(/[\s,，。、；:：]+/).filter(Boolean)));
    if (!tokens.length)
        return tree.root.slice(0, limit);
    const out = [];
    const walk = (nodes) => {
        for (const n of nodes) {
            const hay = `${n.title} ${n.content} ${n.children.map((c) => c.title).join(" ")}`.toLowerCase();
            if (tokens.every((t) => hay.includes(t)))
                out.push(n);
            if (n.children.length)
                walk(n.children);
        }
    };
    walk(tree.root);
    return out.slice(0, limit);
};
/** 渲染检索命中节点（可追溯：标题+内容+层级路径）。接受 KnowNode / KnowledgeSection 形状。 */
export const renderRetrieved = (nodes, query) => {
    if (!nodes.length)
        return `（knowledge retrieval 未命中：${query}）`;
    return `# Knowledge Retrieval · ${query}\n\n` + nodes.map((n) => `- [${n.level}] ${n.title} — ${n.content || "（节点）"}`).join("\n");
};
/** 把树展平成"章节候选"（含内容的节点 + 叶子）。LLM 导航只在这些里选编号。 */
export const flattenSections = (tree, limit = 50) => {
    const out = [];
    const walk = (nodes) => {
        for (const n of nodes) {
            if (out.length >= limit)
                return;
            out.push({ id: String(out.length), title: n.title, content: n.content || "", level: n.level });
            if (n.children.length)
                walk(n.children);
        }
    };
    walk(tree.root);
    return out;
};
/** 语料级 file-level 树（PageIndex File System）：模块→文件→章节，跨整个项目推理。 */
export const buildCorpusTree = (parsed) => {
    const modules = [];
    const find = (title) => modules.find((m) => m.title === title);
    for (const p of parsed || []) {
        const type = nodeTypeOf(p);
        if (type !== "document" && type !== "code")
            continue; // 只对文档/代码建文件树
        const segs = String(p.entry || "").split(/[\\/]/).filter(Boolean);
        const mod = segs[0] || "root";
        const file = segs.slice(1).join("/") || p.entry || "file";
        let modNode = find(mod);
        if (!modNode) {
            modNode = { title: mod, level: 0, content: "", children: [] };
            modules.push(modNode);
        }
        const fileNode = { title: file, level: 1, content: "", children: buildTree(p).children };
        if (!fileNode.children.length && p.goal)
            fileNode.content = p.goal;
        modNode.children.push(fileNode);
    }
    return modules;
};
