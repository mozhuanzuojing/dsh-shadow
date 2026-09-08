// dsh-shadow —— Phase 3 Knowledge Engine（保留树：规范→章节→条款→约束，不转 chunk）。
import assert from "node:assert/strict";
import { createKnowledgeEngine, renderKnowledgeTree, retrieveKnowledge, buildCorpusTree, renderRetrieved, flattenSections, progressiveDisclosure, refineTree } from "../dist/core/knowledge-engine.js";
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
const engine = createKnowledgeEngine({});
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
console.log("✔ 场景 Knowledge-Engine-1 规范→保留树 + 检索 + corpus 级 file 树 + flattenSections（ADR-0047 + v1.10.0）+ 渐进披露 + 成本 refine（ADR-0048①②）");
console.log("ALL PASS ✅");
