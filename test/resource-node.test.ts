// dsh-shadow —— resource NodeType（v1.14.0）：资源卡（.shadow/resources/）→ ShadowNode 投影，
// 「无 source 不上投影」的同一道门（卡片=source，节点=派生投影），以及两条**用户可见行为**的回归：
//   A1 解析状态机不得吞掉固有层字段（投影段在前 / 投影段后再写固有层）；
//   A2 结论与引用证据必须出现在真实 shadow_query 渲染输出里（queryShadow 只取前 6 行）。
import assert from "node:assert/strict";
import { parseResourceCard, deriveResourceNodes, resourceIdOf, listResourceCards, RESOURCE_DIR } from "../dist/core/resource.js";
import { validateAtomProjection } from "../dist/core/lineage-validator.js";
import { matchShadowNodes, queryShadow, renderContext } from "../dist/core/node.js";

const CARD = `# PageIndex
- source: https://github.com/VectifyAI/PageIndex
- type: GitHub
- authority: 社区（有论文背书）
- activity: 活跃（最近提交 2026-09）
- risk: 低（MIT，未归档）
- 一句话：免向量库、基于推理的文档索引

## 投影 @ 投影模式怎么召回
- date: 2026-09-10
- relevance: ★★★★
- novelty: ★★★★
- usability: ★★★
- inspiration: ★★★★★
- 引用证据：促成「分层召回 L0/L1/L2」方案
- 结论：采用其分层思想，不采用其实现
`;

const card = parseResourceCard(CARD, ".shadow/resources/pageindex.md");
assert.ok(card, "有 source 的卡片应解析成功");
assert.equal(card!.name, "PageIndex", "一级标题=名字");
assert.equal(card!.fields.source, "https://github.com/VectifyAI/PageIndex", "source 收进固有层");
assert.equal(card!.fields.type, "GitHub", "type 收进固有层");
assert.equal(card!.fields.summary, "免向量库、基于推理的文档索引", "一句话→summary");
assert.equal(card!.projections.length, 1, "识别 1 段按问题的投影");
assert.equal(card!.projections[0].forQuestion, "投影模式怎么召回", "投影问题从标题 @ 后取");
assert.equal(card!.projections[0].scores.inspiration, "★★★★★", "启发度进投影分数");
assert.equal(card!.projections[0].citation, "促成「分层召回 L0/L1/L2」方案", "引用证据单独存");

const nodes = deriveResourceNodes([card!]);
assert.equal(nodes.length, 1, "一张有证据的卡 → 一个节点");
assert.equal(nodes[0].type, "resource", "节点类型是 resource");
assert.equal(nodes[0].source, ".shadow/resources/pageindex.md", "节点 source 指向卡片文件");
assert.deepEqual(nodes[0].evidence, ["https://github.com/VectifyAI/PageIndex"], "证据 = 卡片的 source");
assert.equal(nodes[0].createdBy, "tool", "卡片由 tool 写入");
assert.ok(nodes[0].relations.some((r) => r.type === "references" && r.target === "https://github.com/VectifyAI/PageIndex"), "关系只作 references 派生");

// ── A2 回归：真实读侧输出（queryShadow 只取前 6 行）必须能看到「引用证据 / 结论」──
const qItems = queryShadow(nodes, "pageindex", ["resource"], 8);
assert.equal(qItems.length, 1, "queryShadow 返回 1 条");
const rendered = renderContext("pageindex", qItems);
assert.ok(rendered.includes("引用证据："), "渲染输出含引用证据（用户可见）");
assert.ok(rendered.includes("结论："), "渲染输出含结论（用户可见）");
assert.ok(rendered.includes("inspiration=★★★★★"), "渲染输出含启发度分数");
assert.ok(rendered.includes("类型：GitHub"), "固有层信息也仍在（只是排在后）");

// ── A1 回归：解析状态机不得吞字段 ──
const projFirst = parseResourceCard("# T\n## 投影 @ q\n- relevance: 高\n- source: https://a.b\n", ".shadow/resources/t.md");
assert.ok(projFirst, "投影段在前、source 在后 → 仍能解析（旧版这里整张卡变 null）");
assert.equal(projFirst!.fields.source, "https://a.b", "投影段里的固有层字段回落到 fields");

const afterProj = parseResourceCard("# T\n- source: https://a.b\n## 投影 @ q\n- relevance: 高\n## 备注\n- type: GitHub\n- 一句话：后写的\n", ".shadow/resources/t.md");
assert.ok(afterProj, "解析成功");
assert.equal(afterProj!.fields.type, "GitHub", "投影段之后的普通标题回到固有层（旧版会被吞）");
assert.equal(afterProj!.fields.summary, "后写的", "同上：一句话不丢");
assert.equal(afterProj!.projections.length, 1, "投影段仍只有 1 段");

// 出处 = source（旧版归到 authority，导致该卡直接不上投影）
const chuchu = parseResourceCard("# X\n- 出处: https://example.com/x\n", ".shadow/resources/x.md");
assert.ok(chuchu, "`出处` 认作 source");
assert.equal(chuchu!.fields.source, "https://example.com/x", "出处 → source");

// 无 source：不解析、不上投影（卡片留在磁盘上，但不进认知查询）
assert.equal(parseResourceCard("# X\n- type: GitHub\n- 一句话：没有出处", ".shadow/resources/x.md"), null, "无 source 不解析");
assert.equal(deriveResourceNodes([]).length, 0, "空卡片集 → 无节点");

// 同一道门：resource 的 evidence 必须有一个非空 locator
assert.equal(validateAtomProjection({ type: "resource" }).allowed, false, "无 lineage → 拒绝");
assert.equal(validateAtomProjection({ type: "resource", lineage: { source: "s", createdBy: "tool", evidence: [], createdAt: "2026-09-10 00:00:00" } }).allowed, false, "证据为空 → 拒绝");
assert.equal(validateAtomProjection({ type: "resource", lineage: { source: "s", createdBy: "tool", evidence: [{ type: "url", locator: "   " }], createdAt: "2026-09-10 00:00:00" } }).allowed, false, "全是空白 locator → 拒绝");
assert.equal(validateAtomProjection({ type: "resource", lineage: { source: "s", createdBy: "tool", evidence: [{ type: "url", locator: "https://x" }], createdAt: "2026-09-10 00:00:00" } }).allowed, true, "有证据 → 放行");
// 既有门没被改动
assert.equal(validateAtomProjection({ type: "memory", kind: "metadata" }).allowed, false, "memory metadata 仍拒绝");
assert.equal(validateAtomProjection({ type: "memory", kind: "experience" }).allowed, true, "memory experience 仍放行");

// scope 过滤：resource 可单独筛，也可被排除
assert.equal(matchShadowNodes(nodes, "", ["resource"]).length, 1, "scope=[resource] 命中");
assert.equal(matchShadowNodes(nodes, "", ["memory"]).length, 0, "scope=[memory] 不含 resource");
assert.equal(matchShadowNodes(nodes, "pageindex", ["resource"]).length, 1, "按词命中");
assert.equal(matchShadowNodes(nodes, "查不到的词", ["resource"]).length, 0, "词不命中");

// id 以**文件名**为准：两张同名标题的卡片不会撞 id
assert.equal(resourceIdOf(".shadow/resources/PageIndex.md"), "sr-pageindex", "文件名 slug 化");
assert.equal(resourceIdOf(".shadow/resources/a.md"), "sr-a");
const sameTitleA = parseResourceCard("# PageIndex\n- source: https://a\n", ".shadow/resources/a.md");
const sameTitleB = parseResourceCard("# PageIndex\n- source: https://b\n", ".shadow/resources/b.md");
const ids = deriveResourceNodes([sameTitleA!, sameTitleB!]).map((n) => n.id);
assert.equal(new Set(ids).size, 2, "同名标题、不同文件 → id 不撞");
assert.notEqual(resourceIdOf(".shadow/resources/中文一号.md"), resourceIdOf(".shadow/resources/中文二号.md"), "中文文件名不撞 id");

// 中文卡片也能解析并投影
const cn = parseResourceCard("# 中文资源\n- source: D:/docs/a.md\n- 类型：文档\n- 风险：个人博客，未核实\n", ".shadow/resources/cn.md");
assert.ok(cn, "中文键名可解析");
assert.equal(cn!.fields.source, "D:/docs/a.md", "中文卡片 source");
assert.equal(cn!.fields.type, "文档", "中文 类型→type");
assert.equal(deriveResourceNodes([cn!])[0].id.startsWith("sr-"), true, "中文卡片也出节点");

// 长 source 不被二次截断（卡片是事实源，截短会让来源不可回查）
const longUrl = "https://example.com/" + "a".repeat(150);
const longCard = parseResourceCard(`# L\n- source: ${longUrl}\n`, ".shadow/resources/l.md");
assert.ok(longCard, "长 source 卡片可解析");
assert.equal(deriveResourceNodes([longCard!])[0].evidence[0], longUrl, "证据不被二次截断");

// 卡片字段带控制字符/超长 → scrub 后仍可用（不崩、不绕读侧护栏）
const dirty = parseResourceCard("# D\n- source: https://e.com/x\n- 一句话：a\u202eb" + "长".repeat(300) + "\n", ".shadow/resources/d.md");
assert.ok(dirty, "脏值不影响解析");
assert.equal(deriveResourceNodes([dirty!])[0].content.every((c) => c.length <= 120), true, "content 逐行截断");

// ── fs 层（唯一生产入口）：listResourceCards ──
const files = new Map<string, string>([
  [`${RESOURCE_DIR}/pageindex.md`, CARD],
  [`${RESOURCE_DIR}/UPPER.MD`, "# Upper\n- source: https://upper.example\n"],
  [`${RESOURCE_DIR}/no-source.md`, "# N\n- type: GitHub\n"],
  [`${RESOURCE_DIR}/notes.txt`, "source: https://x\n"],
  [`${RESOURCE_DIR}/sub`, ""],
]);
const ws = "D:/ws";
const mockFs = {
  resolve: async (p: string) => ({ displayPath: String(p).replace(/\\/g, "/") }),
  listDir: async () => [...files.keys()].map((k) => ({ name: k.split("/").pop() })),
  readText: async (p: any) => files.get(String(p.displayPath || p).replace(`${ws}/`, "")) ?? "",
};
const listed = await listResourceCards(mockFs, ws);
assert.equal(listed.length, 2, `目录里 4 个文件：只有 2 张有效卡（no-source 与 .txt 排除），实际 ${listed.length}`);
assert.deepEqual(listed.map((c) => c.name).sort(), ["PageIndex", "Upper"].sort(), "大写 .MD 也收（大小写不敏感）");
assert.equal(listed.every((c) => c.rel.startsWith(RESOURCE_DIR + "/")), true, "rel 指向 .shadow/resources/");
// 目录不存在 = 0 张卡，不抛错
assert.equal((await listResourceCards({ resolve: async () => ({ displayPath: "nope" }), listDir: async () => { throw new Error("ENOENT"); }, readText: async () => "" }, ws)).length, 0, "目录不存在 → 0 张卡");

console.log("✔ resource：解析（投影段在前/后 + 标题复位 + 出处→source）→ 节点投影 → 渲染层可见结论与引用证据 → 无 source 不上投影 → scope 过滤 → 文件名 id 不撞 → fs 层大小写与容错");
console.log("ALL PASS ✅");
