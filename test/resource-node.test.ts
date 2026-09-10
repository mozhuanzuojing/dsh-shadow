// dsh-shadow —— resource NodeType（v1.14.0）：资源卡（.shadow/resources/）→ ShadowNode 投影，
// 以及「无 source 证据不上投影」的同一道门（Shadow Contract：卡片=source，节点=派生投影）。
import assert from "node:assert/strict";
import { parseResourceCard, deriveResourceNodes, resourceIdOf } from "../dist/core/resource.js";
import { validateAtomProjection } from "../dist/core/lineage-validator.js";
import { matchShadowNodes } from "../dist/core/node.js";

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
assert.ok(nodes[0].content.some((c) => c.includes("inspiration=★★★★★")), "投影分数进 content");
assert.ok(nodes[0].content.some((c) => c.startsWith("引用证据：")), "引用证据进 content");

// 无 source：不解析、不上投影（卡片留在磁盘上，但不进认知查询）
assert.equal(parseResourceCard("# X\n- type: GitHub\n- 一句话：没有出处", ".shadow/resources/x.md"), null, "无 source 不解析");
assert.equal(deriveResourceNodes([]).length, 0, "空卡片集 → 无节点");

// 同一道门：resource 无 evidence 拒绝
assert.equal(validateAtomProjection({ type: "resource" }).allowed, false, "无 lineage → 拒绝");
assert.equal(validateAtomProjection({ type: "resource", lineage: { source: "s", createdBy: "tool", evidence: [], createdAt: "2026-09-10 00:00:00" } }).allowed, false, "证据为空 → 拒绝");
assert.equal(validateAtomProjection({ type: "resource", lineage: { source: "s", createdBy: "tool", evidence: [{ type: "url", locator: "https://x" }], createdAt: "2026-09-10 00:00:00" } }).allowed, true, "有证据 → 放行");
// 既有门没被改动
assert.equal(validateAtomProjection({ type: "memory", kind: "metadata" }).allowed, false, "memory metadata 仍拒绝");
assert.equal(validateAtomProjection({ type: "memory", kind: "experience" }).allowed, true, "memory experience 仍放行");

// scope 过滤：resource 可单独筛，也可被排除
assert.equal(matchShadowNodes(nodes, "", ["resource"]).length, 1, "scope=[resource] 命中");
assert.equal(matchShadowNodes(nodes, "", ["memory"]).length, 0, "scope=[memory] 不含 resource");
assert.equal(matchShadowNodes(nodes, "pageindex", ["resource"]).length, 1, "按词命中");
assert.equal(matchShadowNodes(nodes, "查不到的词", ["resource"]).length, 0, "词不命中");

// id：ASCII 名走 slug；非 ASCII 名走短哈希，不互相撞
assert.equal(resourceIdOf("PageIndex"), "sr-pageindex", "ASCII 名 slug 化");
assert.notEqual(resourceIdOf("中文一号"), resourceIdOf("中文二号"), "中文名不撞 id");

// 中文卡片也能解析并投影
const cn = parseResourceCard("# 中文资源\n- source: D:/docs/a.md\n- 类型：文档\n- 风险：个人博客，未核实\n", ".shadow/resources/cn.md");
assert.ok(cn, "中文键名可解析");
assert.equal(cn!.fields.source, "D:/docs/a.md", "中文卡片 source");
assert.equal(cn!.fields.type, "文档", "中文 类型→type");
assert.equal(deriveResourceNodes([cn!])[0].id.startsWith("sr-"), true, "中文卡片也出节点");

// 卡片字段带控制字符/超长 → scrub 后仍可用（不崩、不绕读侧护栏）
const dirty = parseResourceCard("# D\n- source: https://e.com/x\n- 一句话：a\u202eb" + "长".repeat(300) + "\n", ".shadow/resources/d.md");
assert.ok(dirty, "脏值不影响解析");
assert.equal(deriveResourceNodes([dirty!])[0].content.every((c) => c.length <= 120), true, "content 逐行截断");

console.log("✔ resource：资源卡解析 → ShadowNode(type=resource) 投影 + 无 source 不上投影 + scope 过滤 + id 不撞");
console.log("ALL PASS ✅");
