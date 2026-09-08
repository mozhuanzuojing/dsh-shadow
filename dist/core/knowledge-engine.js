import { nodeTypeOf } from "./node.js";
// ── ADR-0048 ③：内容分类去噪（PageIndex `flash/classification`：TOC/页眉页脚剔除，只留正文/标题）──
/** 判定一行是否为「样板/噪声」（目录、页眉页脚、代码块标记）。确定性，无 LLM。 */
export const isBoilerplateLine = (line) => {
    const l = String(line || "").trim();
    if (!l)
        return false;
    if (/^(#{0,6}\s*)?(目录|contents|toc|页眉|页脚|附录)\s*$/i.test(l))
        return true;
    if (/^第\s*\d+\s*页$/i.test(l) || /^\s*page\s+\d+\s*$/i.test(l))
        return true;
    if (/^```/.test(l))
        return true; // 代码块标记（非正文）
    if (/^.{2,6}\s*(\.\s*){2,}\s*\d+$/.test(l))
        return true; // TOC 形：章节…页码
    return false;
};
const cleanLines = (body) => {
    const out = [];
    let inCode = false;
    for (const raw of String(body || "").split("\n")) {
        const l = raw.trim();
        if (/^```/.test(l)) {
            inCode = !inCode;
            continue;
        } // 跳代码块标记，代码内容也不入树
        if (inCode)
            continue;
        if (isBoilerplateLine(l))
            continue; // 剔除 TOC/页眉页脚
        out.push(l);
    }
    return out;
};
/** ⑦ doc 标题树：按 `#/##/###…` 层级建树（纯标题，无 LLM）。 */
const buildHeadingTree = (doc) => {
    const root = { title: doc.entry || (doc.goal ? `目标：${doc.goal}` : "规范"), level: 0, content: "", children: [] };
    const stack = [root];
    const pushLine = (line, level) => {
        const heading = line.replace(/^#+\s*/, "").trim();
        const node = { title: heading || line, level, content: "", children: [] };
        while (stack.length > 1 && stack[stack.length - 1].level >= level)
            stack.pop();
        stack[stack.length - 1].children.push(node);
        stack.push(node);
    };
    for (const l of cleanLines(doc.body)) {
        const m = l.match(/^(#{1,6})\s+(.+)$/);
        if (m) {
            pushLine(l, m[1].length);
            continue;
        }
        const top = stack[stack.length - 1];
        if (top && l !== top.title)
            top.content = (top.content ? top.content + "；" : "") + l.slice(0, 60);
    }
    return root;
};
/** ⑦ code 包树：按 entry 路径（package/class）建模块树。 */
const buildCodeTree = (entry, content) => {
    const segs = String(entry || "").split(/[\\/]/).filter(Boolean);
    const root = { title: segs[0] || entry || "code", level: 0, content: "", children: [] };
    let cur = root;
    for (let i = 1; i < segs.length; i++) {
        const node = { title: segs[i], level: i, content: "", children: [] };
        cur.children.push(node);
        cur = node;
    }
    if (content)
        cur.content = content;
    return root;
};
/** ⑦ text 段落树：按空行分段落作为子节。 */
const buildTextTree = (doc) => {
    const root = { title: doc.entry || "text", level: 0, content: "", children: [] };
    const paras = cleanLines(doc.body).join(" ").split(/\s{2,}/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
    for (const p of paras)
        root.children.push({ title: p.slice(0, 24) || "节", level: 1, content: p.slice(0, 80), children: [] });
    if (!root.children.length && doc.goal)
        root.content = doc.goal;
    return root;
};
/** ⑦ 按格式结构化抽取：code→包树 / document→标题树 / text→段落树。统一入口。 */
export const buildTree = (doc) => {
    const type = nodeTypeOf(doc);
    const content = [...(doc.goal ? [doc.goal] : []), ...(doc.thinkLines || [])].join(" ");
    if (type === "code")
        return buildCodeTree(doc.entry, content);
    if (type === "document")
        return buildHeadingTree(doc);
    return buildTextTree(doc);
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
// ── ADR-0048 ④：树即 agent 工具 + 引用（PageIndex `agent_tools.py`）──
/** 计算节点在树中的路径（根→…→node），用作引用/溯源。 */
export const sectionPath = (tree, node) => {
    const walk = (nodes, trail) => {
        for (const n of nodes) {
            if (n === node)
                return [...trail, n.title];
            if (n.children.length) {
                const r = walk(n.children, [...trail, n.title]);
                if (r)
                    return r;
            }
        }
        return null;
    };
    return walk(tree.root, [])?.join(" / ") || node.title;
};
/** 渲染检索结果 + 引用（节路径溯源）。 */
export const renderKnowledgeRetrieval = (tree, hits, query) => {
    if (!hits.length)
        return `（knowledge retrieval 未命中：${query}）`;
    const lines = [`# Knowledge Retrieval · ${query}`, ""];
    for (const h of hits) {
        const path = h.__path || "";
        lines.push(`- [${h.level}] ${h.title}${path ? `  (${path})` : ""} — ${h.content || "（节点）"}`);
    }
    return lines.join("\n");
};
// ── ADR-0048 ①/②：成本感知树优化（refineTree）+ 渐进披露（progressiveDisclosure）──
/** 子树叶子/内容节点数（≈"页/节"规模，PageIndex 的 S(v)）。 */
const leafCount = (n) => (n.children.length ? n.children.reduce((a, c) => a + leafCount(c), 0) : 1);
/** ② 渐进披露：内部节点设 routing 摘要（标题+节数），叶子保留 content=全文；返回新树（不覆盖输入）。 */
export const progressiveDisclosure = (tree) => {
    const clone = (n) => {
        const c = cloneNode(n);
        if (n.children.length)
            c.summary = `${n.title}（${leafCount(n) - 1} 节）`; // 内部=路由摘要
        return c;
    };
    return { ...tree, root: tree.root.map(clone) };
};
const cloneNode = (n) => ({
    title: n.title, level: n.level, content: n.content, children: n.children.map(cloneNode),
    summary: n.summary, keyItems: n.keyItems ? [...n.keyItems] : undefined,
});
/** ① 成本感知 refine：链式合并（单叶子孩子吸收）+ 便宜子树折叠（≤minPages 的子树合并，标题存 key_items）。 */
export const refineTree = (tree, opts = {}) => {
    const minPages = Math.max(1, Number(opts.minPages) || 3);
    const refine = (n) => {
        const children = n.children.map(refine);
        // 链式合并：只有 1 个孩子且孩子是叶子 → 吸收（孩子在树上不值得单独路由）
        if (children.length === 1 && !children[0].children.length) {
            return { title: n.title, level: n.level, content: children[0].content || n.content, children: [], summary: n.summary, keyItems: [children[0].title] };
        }
        // 便宜子树折叠：整棵子树规模 ≤ minPages → 折叠进本节点（可线性扫描），子标题存 key_items
        if (children.length && leafCount({ ...n, children }) <= minPages) {
            const kept = [...(n.keyItems || [])];
            const text = children.map((c) => `${c.title}${c.content ? `：${c.content}` : ""}`).join("；");
            for (const c of children)
                kept.push(c.title);
            return { title: n.title, level: n.level, content: [n.content, text].filter(Boolean).join("；"), children: [], summary: n.summary, keyItems: kept };
        }
        return { ...n, children };
    };
    return { ...tree, root: tree.root.map(refine) };
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
