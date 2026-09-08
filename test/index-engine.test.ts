// dsh-shadow —— Phase 2 Index Engine（候选生成）：fs 默认 / zg 复用 provider（未装→unavailable，不 fallback）。
import assert from "node:assert/strict";
import { createIndexEngine, rankRefs } from "../dist/core/index-engine.js";

// fs 默认：空候选（走全量扫描），provider=fs
const fsEngine = createIndexEngine({}, { verify: async () => ({ status: "verified", matches: [] }), discover: async () => [] });
const fsR = await fsEngine.generateCandidates("appid", { ws: "D:/ws" });
assert.equal(fsR.provider, "fs", "默认 provider=fs");
assert.equal(fsR.unavailable, undefined, "fs 无 unavailable 标记");
assert.equal(fsR.refs.length, 0, "fs 空候选（全量扫描）");

// zg：未装 → unavailable=true，且不产出候选（绝不冒充 verified）
const zgUnavailable = createIndexEngine({ indexEngine: { provider: "zg" } }, { verify: async () => ({ status: "unavailable", matches: [], confidence: 0, freshness: "stale", source: "zg", provenance: {} }), discover: async () => [] });
const zgR = await zgUnavailable.generateCandidates("appid", { ws: "D:/ws" });
assert.equal(zgR.provider, "zg", "zg provider");
assert.equal(zgR.unavailable, true, "zg 未装 → unavailable");
assert.equal(zgR.refs.length, 0, "unavailable 时不产出候选");

// zg：可用 → 候选 refs（file + 行号 fragment）
const zgOk = createIndexEngine({ indexEngine: { provider: "zg" } }, {
  verify: async () => ({ status: "verified", matches: [{ path: "src/AuthFilter.java", startLine: 120 }], confidence: 0.8, freshness: "fresh", source: "zg", provenance: {} }),
  discover: async () => [{ path: "src/AuthFilter.java", startLine: 120 }],
});
const zgOkR = await zgOk.generateCandidates("appid", { ws: "D:/ws" });
assert.equal(zgOkR.unavailable, undefined, "zg 可用 → 不 unavailable");
assert.equal(zgOkR.refs.length, 1, "zg 候选 1 条");
assert.equal(zgOkR.refs[0].type, "file", "候选 type=file");
assert.equal(zgOkR.refs[0].locator, "src/AuthFilter.java", "候选 locator=路径");
assert.equal(zgOkR.refs[0].fragment.start, 120, "候选 fragment.start=行号");

// —— ADR-0047：zg 思想 rank 步（词汇级排序锚定精确标识）——
const ranked = rankRefs([{ type: "file", locator: "src/other/Util.java" }, { type: "file", locator: "src/AuthFilter.java" }, { type: "file", locator: "docs/Auth.md" }], "auth src");
assert.equal(ranked[0].locator, "src/AuthFilter.java", "rankRefs 应把含更多 query 词的候选排前");
assert.ok(ranked.some((r) => r.locator === "docs/Auth.md"), "含部分词的仍在候选");
console.log("✔ 场景 Index-Engine-1 fs 默认空候选 / zg 未装 unavailable 不 fallback / zg 可用给 refs + rankRefs 按词排序");
console.log("ALL PASS ✅");
