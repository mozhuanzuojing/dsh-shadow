import { nodeTypeOf } from "./node.js";
/** 把一条规范/文档的内容按「标题层级」建成树（标题行 #/##/###/… → 层级）。纯派生，不补充事实。 */
const buildTree = (doc) => {
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
