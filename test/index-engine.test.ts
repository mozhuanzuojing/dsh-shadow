// dsh-shadow —— Phase 2 Index Engine（候选生成）：fs 默认 / zg 复用 provider / semble（ADR-0054）
//   三者未装/不可用一律 unavailable，**绝不 fallback 成 verified**。
import assert from "node:assert/strict";
import { createIndexEngine, rankRefs } from "../dist/core/index-engine.js";
import { stripBracketedNoProxy, parseSembleRefs } from "../dist/core/semble.js";

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

// ─────────────────────────────────────────────
// ADR-0054：Semble 作为第三个候选 provider（检索层，不是裁决层）
// ─────────────────────────────────────────────

// semble：未装 → unavailable=true，且不产出候选（绝不冒充有候选）
const smUnavailable = createIndexEngine({ indexEngine: { provider: "semble" } }, undefined, async () => ({ unavailable: true, refs: [] }));
const smR = await smUnavailable.generateCandidates("auth filter", { ws: "D:/ws", workspace: "D:/ws" });
assert.equal(smR.provider, "semble", "semble provider");
assert.equal(smR.unavailable, true, "semble 未装 → unavailable");
assert.equal(smR.refs.length, 0, "unavailable 时不产出候选（不 fallback 成 verified）");

// semble：可用 → 候选 refs（file + 行号范围）+ 词汇级重排（rankRefs 生效）
// 注意用**绝对** locator：生产路径下 sembleCandidates 已绝对化（见 parseSembleRefs），
// 而 authorizeScope({workspace}) 是绝对前缀匹配 —— 相对路径会被整批滤掉。
const smOk = createIndexEngine({ indexEngine: { provider: "semble" } }, undefined, async () => ({
  refs: [
    { type: "file", locator: "D:/ws/src/other/Util.java", fragment: { start: 9 } },
    { type: "file", locator: "D:/ws/src/AuthFilter.java", fragment: { start: 120, end: 140 } },
  ],
}));
const smOkR = await smOk.generateCandidates("auth src", { ws: "D:/ws", workspace: "D:/ws" });
assert.equal(smOkR.unavailable, undefined, "semble 可用 → 不 unavailable");
assert.equal(smOkR.refs.length, 2, "semble 候选 2 条（授权范围内）");
assert.equal(smOkR.refs[0].locator, "D:/ws/src/AuthFilter.java", "rankRefs 应把含更多 query 词的候选排前");
assert.equal(smOkR.refs[0].fragment.start, 120, "候选保留行号");
assert.equal(smOkR.refs[0].fragment.end, 140, "候选保留行号范围（end）");

// authorizeScope 是绝对前缀匹配：workspace 外的候选被滤掉（这正是必须绝对化的原因）
const smOutOfScope = createIndexEngine({ indexEngine: { provider: "semble" } }, undefined, async () => ({
  refs: [
    { type: "file", locator: "D:/ws/src/in.java", fragment: { start: 1 } },
    { type: "file", locator: "D:/elsewhere/out.java", fragment: { start: 2 } },
  ],
}));
const smScopeR = await smOutOfScope.generateCandidates("x", { ws: "D:/ws", workspace: "D:/ws" });
assert.equal(smScopeR.refs.length, 1, "workspace 外候选被 authorizeScope 滤掉");
assert.equal(smScopeR.refs[0].locator, "D:/ws/src/in.java", "只留范围内候选");

// 纯函数：stripBracketedNoProxy 剔掉带方括号的条目（本机 NO_PROXY=[::1] 会让 httpx 崩的根因）
assert.equal(stripBracketedNoProxy("127.0.0.1,localhost,::1,[::1],*deepseek*"), "127.0.0.1,localhost,::1,*deepseek*", "剔掉 [::1] 但保留不带括号的 ::1");
assert.equal(stripBracketedNoProxy("[::1]"), "", "全是方括号条目 → 空");
assert.equal(stripBracketedNoProxy(""), "", "空值 → 空");
assert.equal(stripBracketedNoProxy(undefined), "", "undefined → 空");

// 纯函数：parseSembleRefs 从 CLI stdout 取 JSON（含前后噪声/坏 JSON 的容错），并把 locator 绝对化
const good = 'noise {"query":"q","results":[{"file_path":"src/a.ts","start_line":3,"end_line":8},{"file_path":"","start_line":1}]} tail';
const parsed = parseSembleRefs(good, "D:/ws");
assert.equal(parsed.length, 1, "空 file_path 的命中被丢弃");
assert.equal(parsed[0].locator, "D:/ws/src/a.ts", "相对路径 → 绝对化到 workspace");
assert.deepEqual(parsed[0].fragment, { start: 3, end: 8 }, "fragment 取 start_line/end_line");
assert.equal(parseSembleRefs('{"results":[{"file_path":"C:\\\\ws\\\\b.ts","start_line":1}]}', "D:/ws")[0].locator, "C:/ws/b.ts", "已是绝对路径 → 原样（反斜杠归一化）");
assert.equal(parseSembleRefs('{"results":[{"file_path":"src/c.ts"}]}', "")[0].locator, "src/c.ts", "无 ws → 保持原样（不造路径）");
assert.deepEqual(parseSembleRefs("not json at all"), [], "坏 JSON → 空（不抛）");
assert.deepEqual(parseSembleRefs(""), [], "空 stdout → 空");
assert.deepEqual(parseSembleRefs('{"results":[]}'), [], "无命中 → 空");
console.log("✔ 场景 Index-Engine-2 ADR-0054 semble：未装 unavailable 不 fallback / 可用给 refs+rankRefs+授权过滤 / stripBracketedNoProxy / parseSembleRefs 绝对化与容错");
console.log("ALL PASS ✅");
