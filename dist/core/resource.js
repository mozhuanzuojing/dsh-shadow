// dsh-shadow —— core/resource.ts：Resource Card（源层文件）→ ShadowNode(type:"resource") 投影。
// 定位（ADR-0043 Shadow Contract / ADR-0051）：
//   - Resource Card = **source**：由 tool/agent 写入的普通文件（`.shadow/resources/<name>.md`），不是派生数据。
//   - `resource` 节点 = **Projection**：从卡片确定性派生，可重建（删掉重派生即可），不覆盖卡片。
//   - Evidence：卡片必须给出 `source`（链接/路径）才允许上投影；没有的卡片留在磁盘、不进认知查询。
// 纪律：纯函数、无 LLM、不猜字段、不静默丢字段。解析不出来 = 不投影（不是猜一个），且不做半截解析。
import { SHADOW_ROOT } from "./paths.js";
import { slug, today } from "./util.js";
import { scrubUnsafe } from "../security/scrub.js";
import { validateAtomProjection } from "./lineage-validator.js";
/** 资源卡目录（相对工作区；位于 shadowRoot 内，写入受既有安全边界约束）。 */
export const RESOURCE_DIR = `${SHADOW_ROOT}/resources`;
/** 固有层字段别名（中英都收，值原样保留）。 */
const FIELD_ALIAS = {
    source: "source", url: "source", 来源: "source", 链接: "source", 地址: "source", 出处: "source",
    type: "type", 类型: "type", 类别: "type",
    authority: "authority", 权威性: "authority", 发布方: "authority",
    activity: "activity", 活跃度: "activity",
    risk: "risk", 风险: "risk",
    summary: "summary", 一句话: "summary", 说明: "summary", 简介: "summary",
    date: "date", 日期: "date", 入库日期: "date",
};
/** 投影层字段别名（按问题各存一份）。 */
const PROJECTION_ALIAS = {
    date: "date", 日期: "date",
    relevance: "relevance", 相关性: "relevance",
    novelty: "novelty", 新颖性: "novelty",
    usability: "usability", 可用性: "usability",
    inspiration: "inspiration", 启发度: "inspiration",
    reusability: "reusability", 可复用性: "reusability",
    citation: "citation", 引用证据: "citation",
    conclusion: "conclusion", 结论: "conclusion",
};
const LINE_RE = /^[-*]\s*([^:：]+)[:：]\s*(.*)$/;
const HEAD_RE = /^(#{1,6})\s+(.+)$/;
const MD_RE = /\.md$/i;
/** 非 ASCII 名字的 slug 会退化成 "mem"，用短哈希兜底避免碰撞。 */
const shortHash = (s) => {
    let h = 5381;
    for (let i = 0; i < s.length; i++)
        h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36).slice(0, 6);
};
/** 节点 id：以**文件名**（同一目录内天然唯一）为准，不用标题——两张卡可以同名，但不会有同名文件。 */
export const resourceIdOf = (relOrName) => {
    const base = String(relOrName || "").replace(/\\/g, "/").split("/").pop() || "";
    const stem = base.replace(MD_RE, "");
    const s = slug(stem);
    return s === "mem" ? `sr-${shortHash(stem)}` : `sr-${s}`;
};
/**
 * 解析一张资源卡。返回 null = 不上投影（无标题 / 无 source）。
 * 状态机：一级标题 = 名字；`## …投影…` = 开一段按问题的投影；**其它标题一律回到固有层**（否则后面的固有层字段会被投影段吞掉）。
 * 投影段里写了固有层字段（如 `source`）时回落到固有层，不静默丢。
 */
export const parseResourceCard = (text, rel) => {
    const lines = String(text || "").split(/\r?\n/);
    const fields = {};
    const projections = [];
    let name = "";
    let cur = null;
    for (const raw of lines) {
        const line = raw.trim();
        if (!line)
            continue;
        const h = line.match(HEAD_RE);
        if (h) {
            const level = h[1].length;
            const title = h[2].trim();
            if (level === 1) {
                name = name || title;
                cur = null;
                continue;
            }
            if (/投影/.test(title)) {
                const at = title.split(/@|＠/)[1];
                cur = { forQuestion: (at || title.replace(/^.*?投影\s*/, "")).trim(), date: "", scores: {}, citation: "", conclusion: "" };
                projections.push(cur);
            }
            else {
                cur = null; // 回到固有层
            }
            continue;
        }
        const m = line.match(LINE_RE);
        if (!m)
            continue;
        const rawKey = m[1].trim();
        const key = rawKey.toLowerCase();
        const value = scrubUnsafe(m[2].trim()).slice(0, 200);
        if (!value)
            continue;
        if (cur) {
            const alias = PROJECTION_ALIAS[key] || PROJECTION_ALIAS[rawKey];
            if (alias === "date") {
                cur.date = value;
                continue;
            }
            if (alias === "citation") {
                cur.citation = value;
                continue;
            }
            if (alias === "conclusion") {
                cur.conclusion = value;
                continue;
            }
            if (alias) {
                cur.scores[alias] = value;
                continue;
            }
            // 投影段里的固有层字段 → 回落，不静默丢
            const fa = FIELD_ALIAS[key] || FIELD_ALIAS[rawKey];
            if (fa)
                fields[fa] = value;
            continue;
        }
        const fa = FIELD_ALIAS[key] || FIELD_ALIAS[rawKey];
        if (fa)
            fields[fa] = value;
    }
    if (!name || !fields.source)
        return null;
    return { rel, name: scrubUnsafe(name).slice(0, 80), fields, projections };
};
/** 读 `.shadow/resources/*.md`（目录不存在 / 读失败 = 没有资源卡：这是「无数据」，不是「缺件」）。 */
export const listResourceCards = async (fs, ws) => {
    const out = [];
    if (!fs || !ws)
        return out;
    try {
        const root = await fs.resolve(`${ws}/${RESOURCE_DIR}`, { cwd: ws });
        const files = (await fs.listDir(root)) || [];
        for (const f of files) {
            const n = f && f.name;
            if (!n || !MD_RE.test(String(n)))
                continue;
            const abs = await fs.resolve(`${ws}/${RESOURCE_DIR}/${n}`, { cwd: ws });
            const txt = await fs.readText(abs).catch(() => "");
            const card = parseResourceCard(String(txt || ""), `${RESOURCE_DIR}/${n}`);
            if (card)
                out.push(card);
        }
    }
    catch { /* 目录不存在 / 不可读：等价于「没有资源卡」 */ }
    return out;
};
/** 卡片 → 节点用的 lineage（event-sourced：只记录卡片里写着的事实，不推断）。 */
export const resourceLineage = (card) => {
    const locator = card.fields.source;
    const kind = /^https?:\/\//i.test(locator) ? "url" : "file";
    return {
        source: card.rel,
        createdBy: "tool",
        evidence: [{ type: kind, locator }],
        createdAt: `${card.fields.date || today()} 00:00:00`,
    };
};
/**
 * 资源卡 → ShadowNode(type:"resource")。
 * content 顺序：**按问题的投影段在前**（分数 / 引用证据 / 结论 —— 这是收卡的用处所在），固有层在后；
 * 读侧 `queryShadow` 只取前 6 行，倒过来会让结论/引用证据永远看不见。
 * 过 validateAtomProjection：解析层已挡「无 source」，这里仍走同一道门（口径单一 + 兜底）。
 */
export const deriveResourceNodes = (cards) => {
    const nodes = [];
    for (const card of cards || []) {
        const lineage = resourceLineage(card);
        const gate = validateAtomProjection({ type: "resource", lineage });
        if (!gate.allowed)
            continue;
        const content = [];
        for (const p of card.projections) {
            const scores = Object.entries(p.scores).map(([k, v]) => `${k}=${v}`).join(" ");
            const head = `投影 @ ${p.forQuestion || "（未写问题）"}${p.date ? `（${p.date}）` : ""}`;
            content.push(`${head}：${scores || "—"}`);
            if (p.citation)
                content.push(`引用证据：${p.citation}`);
            if (p.conclusion)
                content.push(`结论：${p.conclusion}`);
        }
        if (card.fields.type)
            content.push(`类型：${card.fields.type}`);
        if (card.fields.authority)
            content.push(`权威性：${card.fields.authority}`);
        if (card.fields.activity)
            content.push(`活跃度：${card.fields.activity}`);
        if (card.fields.risk)
            content.push(`风险：${card.fields.risk}`);
        if (card.fields.summary)
            content.push(`一句话：${card.fields.summary}`);
        // 证据不做二次截断：卡片是事实源，截短会让来源不可回查（解析层已把字段值限在 200 字内）
        const evidence = lineage.evidence.map((e) => scrubUnsafe(String(e.locator || "")));
        const relations = evidence.map((ev) => ({ type: "references", target: ev, source: "resource-card" }));
        nodes.push({
            id: resourceIdOf(card.rel),
            type: "resource",
            source: card.rel,
            title: card.name,
            content: content.map((x) => scrubUnsafe(String(x || "")).slice(0, 120)).slice(0, 10),
            evidence,
            relations,
            createdBy: lineage.createdBy,
        });
    }
    return nodes;
};
