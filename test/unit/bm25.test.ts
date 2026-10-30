import assert from "node:assert/strict";
import { searchTerms, bm25Rank } from "../../dist/domain/bm25.js";

// 1) 分词：中文连续段切 2-gram、拉丁词按词、停用 bigram 剔除
const terms = searchTerms("后端工程入口 src/server/index.ts 可以");
assert.ok(terms.includes("后端"), "应含中文 bigram 后端");
assert.ok(terms.includes("入口"), "应含中文 bigram 入口");
assert.ok(terms.includes("src") && terms.includes("server") && terms.includes("index"), "应含拉丁词");
assert.ok(!terms.includes("可以"), "停用 bigram 应被剔除");

// 2) 相关性排序：更相关的文档排第一；命中 term 数可读
const docs = [
  { id: "a", text: "后端工程入口是 src/server/index.ts" },
  { id: "b", text: "前端样式调整" },
  { id: "c", text: "后端接口文档" },
];
const ranked = bm25Rank("后端入口", docs);
assert.ok(ranked.length >= 1);
assert.equal(ranked[0]!.id, "a", "最相关文档应排第一");
for (const h of ranked) assert.ok(h.matched >= 1, "命中项 matched 应 ≥1");

// 3) 无关查询：没有任何文档达到「≥2 个 term 命中」
assert.equal(bm25Rank("完全不存在主题zzz", docs).filter((x) => x.matched >= 2).length, 0);

console.log("✔ bm25：中文 2-gram + 拉丁词分词 / IDF×TF 排序 / 无关查询零命中");
