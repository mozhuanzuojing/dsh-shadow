// dsh-shadow —— Phase 3 Knowledge Engine（保留树：规范→章节→条款→约束，不转 chunk）。
import assert from "node:assert/strict";
import { createKnowledgeEngine, renderKnowledgeTree } from "../dist/core/knowledge-engine.js";
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
console.log("✔ 场景 Knowledge-Engine-1 规范→保留层级树(章节/条款，不转 chunk) + 渲染");
console.log("ALL PASS ✅");
