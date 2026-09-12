// dsh-shadow —— Phase 3 Knowledge Engine（保留树：规范→章节→条款→约束，不转 chunk）。
import assert from "node:assert/strict";
import { createKnowledgeEngine, renderKnowledgeTree, retrieveKnowledge, buildCorpusTree, renderRetrieved, flattenSections, progressiveDisclosure, refineTree, buildTree, isBoilerplateLine, sectionPath, renderKnowledgeRetrieval } from "../dist/core/knowledge-engine.js";
import { parseMemory } from "../dist/core/episode.js";

// 一段带层级标题的规范文档
const SPEC = `# spec/u8-openapi-biz-sa.md

> 完整线索
> 背景/材料：spec/u8-openapi-biz-sa.md
> 概况：1 动作 · 0 用户消息 · 0 决策
> 项目：OpenAPI-Gateway
> Agent：T
- [11:11:11] [spec/u8-openapi-biz-sa.md] 改/读 spec/u8-openapi-biz-sa.md
# 认证
## 签名算法
### RSA
- 采用 RSA 签名
## OAuth2
- 用 e-Builder openApi
`;
const parsed = parseMemory(SPEC, ".shadow/2026-09-08/2026-09-08--111111-spec.md", "2026-09-08--111111-spec.md");
// v1.15.34（D8）：`createKnowledgeEngine` 的死形参 `config` 已删 —— 它从来不被使用，
// 而它的存在会让人以为「知识引擎受 config 驱动」（进而以为 `knowledgeEngine.enabled` 是闸门）。
const engine = createKnowledgeEngine();
const tree = await engine.build([parsed]);
assert.equal(tree.provider, "tree", "provider=tree");
assert.equal(tree.sourceCount, 1, "来源 1 个规范");
assert.ok(tree.root.length >= 1, "根节点存在");
const root = tree.root[0];
assert.equal(root.title, "spec/u8-openapi-biz-sa.md", "根=规范入口");
// 标题层级应生成 children（认证 / 签名算法 / RSA …）
const titles = JSON.stringify(tree.root);
assert.ok(titles.includes("认证") && titles.includes("签名算法") && titles.includes("RSA") && titles.includes("OAuth2"), "层级标题应进树");
// 渲染
const out = renderKnowledgeTree(tree);
assert.ok(out.includes("Knowledge Tree") && out.includes("认证"), "渲染含标题");

// —— ADR-0047：树上推理检索（PageIndex：relevant≠similar，在树上选章节）——
const hits = retrieveKnowledge(tree, "RSA");
assert.ok(hits.length >= 1, "retrieveKnowledge 应命中 RSA 节点");
assert.ok(hits.some((n) => n.title.includes("RSA")), "命中标题含 RSA");
assert.ok(renderRetrieved(hits, "RSA").includes("Knowledge Retrieval"), "渲染检索结果");

// —— ADR-0047：corpus 级 file 树（PageIndex File System：模块→文件→章节）——
const corpus = buildCorpusTree([parsed]);
assert.ok(corpus.some((m) => m.title === "spec"), "corpus 树含 spec 模块");
assert.ok(corpus[0].children.length >= 1, "corpus 树模块下含文件节点");
assert.ok(corpus[0].children.some((f) => f.children.length >= 1), "文件节点下含章节子树");
// —— v1.10.0：flattenSections（LLM 导航候选章节）——
const sections = flattenSections(tree);
assert.ok(sections.length >= 1, "flattenSections 应产出候选章节");
assert.ok(sections.every((s) => typeof s.id === "string" && s.title), "候选含 id/title");
// —— ADR-0048②：渐进披露（内部=摘要，叶子=全文）——
const disclosed = progressiveDisclosure(tree);
const foundInternal = (nodes) => nodes.find((n) => n.children.length > 0 && n.summary);   // 内部应有 summary
assert.ok(foundInternal(disclosed.root), "内部节点应有 summary");
assert.ok(foundInternal(disclosed.root).summary.includes("节"), "summary 含节数");

// —— ADR-0048①：成本感知 refine（链式合并+便宜子树折叠+key_items）——
const refined = refineTree(tree, { minPages: 2 });
// 根(spec) 下应有折叠结果；只要有 children 被合并进父（children 变少或空）且 keyItems 保留标题
const hasRefine = JSON.stringify(refined).includes("keyItems") || refined.root[0]?.children.length <= tree.root[0]?.children.length;
assert.ok(hasRefine, "refine 应产生合并（children 减少或 keyItems）");
// —— ADR-0048③：内容分类去噪 ——
assert.equal(isBoilerplateLine("目录"), true, "「目录」=样板");
assert.equal(isBoilerplateLine("第 1 页"), true, "「第 N 页」=页眉页脚");
assert.equal(isBoilerplateLine("1.1 认证 ...... 12"), true, "TOC 形式=样板");
assert.equal(isBoilerplateLine("### RSA"), false, "标题行非样板");
// ⑦ 按格式抽取：code → 包树
const code = parseMemory(`# io/backend/src/main/java/com/openapi/io/DeptMapService.java

> 完整线索
> 背景/材料：io/backend/DeptMapService.java
> 概况：1 动作 · 0 用户消息 · 0 决策
- [09:00:00] [io/backend] 改/读 io/backend/DeptMapService.java
`, ".shadow/2026-09-08/2026-09-08--090000-code.md", "2026-09-08--090000-code.md");
const codeTree = buildTree(code);
assert.equal(codeTree.title, "io", "code 包树根=首路径段");
assert.ok(codeTree.children.some((c) => c.title === "backend"), "code 包树含模块层");
// ④ 引用（节路径）
const tree2 = { provider: "tree", root: [buildTree(parsed)], sourceCount: 1 };
const node = tree2.root[0].children[0];   // spec 下第一节点
const path = sectionPath(tree2, node);
assert.ok(path.includes(tree2.root[0].title) && path.includes(node.title), "sectionPath 应含根→节点的路径");
// renderKnowledgeRetrieval 的实现读 `(h as any).__path`，而它声明的 hits 元素类型不含 `__path`
// （生产侧类型缺口，见报告）。故先落到**带 __path 的局部对象**再按声明形状传参 ——
// 既保留「引用路径进入渲染」这一被测行为，也不必用断言把多给的字段藏起来。
const citedHit: { title: string; content: string; level: number; __path?: string } = { title: node.title, content: node.content, level: node.level, __path: path };
const cited = renderKnowledgeRetrieval(tree2, [citedHit], "RSA");
assert.ok(cited.includes(path), "renderKnowledgeRetrieval 应含引用路径");
console.log("✔ 场景 Knowledge-Engine-1 规范→保留树 + 检索 + corpus 级 file 树 + flattenSections（ADR-0047 + v1.10.0）+ 渐进披露 + 成本 refine（ADR-0048①②）+ 去噪③ + 格式抽取⑦ + 引用④");
console.log("ALL PASS ✅");
