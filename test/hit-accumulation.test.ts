// dsh-shadow —— 命中数累积的**触发条件**回归锁（ADR-0067）。
//
// 背景（实测的真缺陷）：主题召回曾用 `servedDetail`（「渲染里展开了片段」）累 hits，
// 而 `servedDetail` 要求 `tier !== "L0" && render.includes("…")`。
// ⇒ L0（真语料约 74%）永不累积；L1/L2 还要预算够展开片段。
//
// 现行：`hits` =「被任何返回 Memory Atom 的读入口读过」（D7=②）。
//   写入门 `noteServedAtoms` → `recordServedHits`；
//   主题召回的 rel 只来自 `renderWithinBudget` 的 `servedRels`（≠ `servedDetail`）；
//   ReadQuery 用 `relsFromMemoryRefs` / `relsFromDecisionRels` / `relsFromSources`。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
const { apply, name, inject } = mod;

const WS = "D:/ws";
const toolRegistry = new Map<string, any>();

const mkFs = (m: Map<string, string>) => ({
  async resolve(path: string) { return { targetKey: path, displayPath: path }; },
  async readText(t: any) { return m.get(t.displayPath) ?? ""; },
  async writeText(t: any, c: string) { m.set(t.displayPath, c); return { version: "v1" }; },
  async listDir(t: any) {
    const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/";
    const names = new Set<string>();
    for (const k of m.keys()) {
      const nk = k.replace(/\\/g, "/");
      if (!nk.startsWith(prefix)) continue;
      const f = nk.slice(prefix.length).split("/")[0];
      if (f !== "_index.md") names.add(f);
    }
    return [...names].map((n) => ({ name: n }));
  },
});

const mkCtx = (m: Map<string, string>) => {
  const agentsById = new Map<string, any>();
  const agent = (id: string, cwd = WS) => { const a = { id, session: { header: { cwd } } }; agentsById.set(id, a); return a; };
  const services = { fs: mkFs(m), agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) }, systemPrompt: { context: () => {} }, tools: { register: (d: any) => toolRegistry.set(d.name, d) }, llm: undefined, agentDefaultModel: undefined };
  const listeners = new Map<string, Function>();
  const ctx: any = { get: (k: string) => (services as any)[k], on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); }, inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => (services as any)[k] }) };
  return { m, agentsById, agent, listeners, ctx, services };
};

const { tierFor } = await import("../dist/retrieval/rank.js");
const { renderWithinBudget } = await import("../dist/retrieval/budget-render.js");

// ── ① 前置事实：这段文本的 tier 必须是 L0（否则本测试测不到目标的那个分支） ──
const L0_BODY =
  "# pkg-a\n\n> 完整线索\n> 概况：3 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n> Agent：T1\n\n" +
  "- [10:00:00] [pkg-a] 改/读 pkg-a/x.js\n" +
  "- [10:00:01] [pkg-a] 改/读 pkg-a/y.js\n" +
  "- [10:00:02] [pkg-a] 调用 build\n";
assert.equal(tierFor(L0_BODY), "L0", "前置条件：这段文本的 tier 必须是 L0（本测试专测 tier=L0 的记忆）");
console.log("✔ ① 前置条件成立：动作行占满 ⇒ tierFor 返回 L0（真语料 74.3% 的记忆是这个形态）");

// ── ①b 主锁：renderWithinBudget 两集合分家 ──
{
  const L0_scored = {
    mm: { rel: ".shadow/2026-09-07/l0.md", date: "2026-09-07", time: "100000", name: "l0" },
    text: L0_BODY, entry: "pkg-a", tier: "L0", score: 2, tokens: ["build"], breakdown: {},
  };
  const r0 = renderWithinBudget([L0_scored], { limit: 10, maxChars: 8000, tokens: ["build"] });
  assert.ok(r0.servedRels.includes(L0_scored.mm.rel), "L0 返回 ⇒ servedRels 含该 rel");
  assert.equal(r0.servedDetail.length, 0, "L0 不得进 servedDetail");

  const L2_BODY =
    "# pkg-b\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n\n" +
    "- [10:00:00] [pkg-b] 改/读 pkg-b/z.js\n\n我分析了为什么这样改，注意边界。\n";
  assert.equal(tierFor(L2_BODY), "L2");
  const L2_scored = {
    mm: { rel: ".shadow/2026-09-07/l2.md", date: "2026-09-07", time: "110000", name: "l2" },
    text: L2_BODY, entry: "pkg-b", tier: "L2", score: 3, tokens: ["pkg-b", "边界"],
    breakdown: {}, evidence: { status: "active" },
  };
  // 大预算 ⇒ L2 会展开片段（含 …）
  const r2 = renderWithinBudget([L2_scored], { limit: 10, maxChars: 8000, tokens: ["pkg-b", "边界"] });
  assert.ok(r2.servedRels.includes(L2_scored.mm.rel), "L2 返回 ⇒ servedRels");
  assert.ok(r2.servedDetail.includes(L2_scored.mm.rel), "L2 展开片段 ⇒ servedDetail");
  assert.ok(r2.servedDetail.every((r: string) => r2.servedRels.includes(r)), "servedDetail ⊆ servedRels");
  console.log("✔ ①b 主锁：renderWithinBudget 上 L0 只有 servedRels；L2 两集合分家且 detail ⊆ rels");
}

// ── ② 复现：tier=L0 的记忆被**返回**了，但命中数没有累积 ──
{
  const store = new Map<string, string>();
  const { m, agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  // ⚠ 本场景与遗忘无关 ⇒ 显式关掉 forget（v1.15.85 起默认全开、staleDays 14）：
//   否则 fixture 里的旧日期会被 isForgettable 滤掉，把被测行为一起滤没（T12 重判，v1.15.97）。
P.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T1");
  m.set(`${WS}/.shadow/2026-09-07/2026-09-07--100000-pkg-a.md`, L0_BODY);

  const rs = toolRegistry.get("read_shadow");
  assert.ok(rs, "read_shadow 工具应已注册");
  const out = String(await rs.execute({ topic: "build" }, { agent: T }));

  assert.ok(out.includes("pkg-a"), "前置条件：召回应返回该记忆（否则测不到累积逻辑）");
  const metaRaw = store.get(`${WS}/.shadow/_meta.json`);
  const meta = metaRaw ? JSON.parse(metaRaw) : {};
  const rel = ".shadow/2026-09-07/2026-09-07--100000-pkg-a.md";
  const rec = meta[rel];
  assert.ok(rec, "被返回的记忆必须在 _meta.json 里有记录（hits 是「召回命中数」，与是否展开片段无关）");
  assert.ok(Number(rec.hits) >= 1, `被返回一次应记 hits >= 1；实际 ${JSON.stringify(rec)}`);
  console.log("✔ ② tier=L0 的记忆被返回后，命中数正确累积（hits >= 1，_meta.json 已落盘）");
}

// ── ③ 对照：L2 的记忆同样累积（两种 tier 都要覆盖，避免只修好一条路） ──
{
  const store = new Map<string, string>();
  const { m, agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T2");
  const L2_BODY = "# pkg-b\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n\n- [10:00:00] [pkg-b] 改/读 pkg-b/z.js\n\n我分析了为什么这样改，注意边界。\n";
  assert.equal(tierFor(L2_BODY), "L2", "对照前提：含思维词 ⇒ L2");
  m.set(`${WS}/.shadow/2026-09-07/2026-09-07--110000-pkg-b.md`, L2_BODY);
  const rs = toolRegistry.get("read_shadow");
  const out = String(await rs.execute({ topic: "pkg-b" }, { agent: T }));
  assert.ok(out.includes("pkg-b"), "对照：召回应返回该记忆");
  const meta = JSON.parse(store.get(`${WS}/.shadow/_meta.json`) || "{}");
  const rec = meta[".shadow/2026-09-07/2026-09-07--110000-pkg-b.md"];
  assert.ok(rec && Number(rec.hits) >= 1, `L2 记忆同样应累积 hits；实际 ${JSON.stringify(rec)}`);
  console.log("✔ ③ 对照：tier=L2 的记忆同样累积 hits（两条路都覆盖）");
}

// ── ④ 不变量：**没被返回**的记忆不得被记 hits（避免修成「凡候选即命中」） ──
{
  const store = new Map<string, string>();
  const { m, agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T3");
  m.set(`${WS}/.shadow/2026-09-07/2026-09-07--100000-hit.md`, "# hit\n\n> 完整线索\n\n- [10:00:00] [hit] 调用 build\n");
  m.set(`${WS}/.shadow/2026-09-07/2026-09-07--100001-miss.md`, "# miss\n\n> 完整线索\n\n- [10:00:01] [miss] 调用 deploy\n");
  const rs = toolRegistry.get("read_shadow");
  await rs.execute({ topic: "build" }, { agent: T });
  const meta = JSON.parse(store.get(`${WS}/.shadow/_meta.json`) || "{}");
  assert.ok(meta[".shadow/2026-09-07/2026-09-07--100000-hit.md"], "命中的记忆应有记录");
  assert.equal(meta[".shadow/2026-09-07/2026-09-07--100001-miss.md"], undefined,
    "**未命中/未返回**的记忆不得被记 hits（hits 是「被返回」，不是「被扫描」）");
  console.log("✔ ④ 不变量：只记「被返回」的记忆，未返回者不记（不是「凡候选即命中」）");
}

const seedTaskish = (m: Map<string, string>, rel: string, title: string) => {
  const BODY =
    `# ${title}\n\n> 完整线索\n> 决策：〔user〕采用方案\n> 概况：1 动作 · 1 用户消息 · 1 决策\n> 项目：ws\n> Agent：Tx\n> 目标：${title}\n\n` +
    `- [10:00:00] [${title}] 用户：${title}\n` +
    `- [10:00:01] [${title}] 改/读 todo.md\n` +
    `- [10:00:02] [${title}] 决定 采用方案\n`;
  m.set(`${WS}/${rel}`, BODY);
};

// ── ⑤ D7=②：mode:"recovery" 也累积 hits ──
{
  toolRegistry.clear();
  const store = new Map<string, string>();
  const { m, agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T4");
  const rel = ".shadow/2026-09-07/2026-09-07--120000-todo.md";
  seedTaskish(m, rel, "Todo清理");
  const rs = toolRegistry.get("read_shadow");
  const out = String(await rs.execute({ mode: "recovery", topic: "Todo" }, { agent: T }));
  assert.ok(out.includes("Todo") || out.includes("记忆恢复"), `recovery 应产出恢复包；实际前 200 字：${out.slice(0, 200)}`);
  const meta = JSON.parse(store.get(`${WS}/.shadow/_meta.json`) || "{}");
  assert.ok(meta[rel] && Number(meta[rel].hits) >= 1, `D7=② recovery 应记 hits；实际 ${JSON.stringify(meta[rel])}`);
  console.log("✔ ⑤ D7=②：mode:\"recovery\" 返回任务记忆后累积 hits");
}

// ── ⑥ D7=②：mode:"query"（shadow_query）也累积 hits ──
{
  toolRegistry.clear();
  const store = new Map<string, string>();
  const { m, agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent("T5");
  const BODY =
    "# oauth-fix\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n\n" +
    "- [10:00:00] [oauth-fix] 改/读 oauth.ts\n\n分析 OAuth 刷新边界。\n";
  const rel = ".shadow/2026-09-07/2026-09-07--130000-oauth.md";
  m.set(`${WS}/${rel}`, BODY);
  const rs = toolRegistry.get("read_shadow");
  const out = String(await rs.execute({ mode: "query", topic: "oauth" }, { agent: T }));
  assert.ok(out.length > 20, "shadow_query 应有输出");
  const meta = JSON.parse(store.get(`${WS}/.shadow/_meta.json`) || "{}");
  assert.ok(meta[rel] && Number(meta[rel].hits) >= 1, `D7=② query 应记 hits；实际 ${JSON.stringify(meta[rel])}`);
  console.log("✔ ⑥ D7=②：mode:\"query\" 返回 ShadowNode 后累积 hits");
}

// ── ⑦–⑩ 接线冒烟：episode / decision / task / context ──
const smokeMode = async (mode: string, topic: string, label: string) => {
  toolRegistry.clear();
  const store = new Map<string, string>();
  const { m, agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false } });
  const T = agent(`T-${mode}`);
  const rel = `.shadow/2026-09-07/2026-09-07--140000-${mode}.md`;
  seedTaskish(m, rel, topic);
  // context 需要材料路径才会有 ContextReference.source
  if (mode === "context") {
    const BODY =
      `# ${topic}\n\n> 完整线索\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n> 背景/材料：\`D:/ws/foo.ts\`\n\n` +
      `- [10:00:00] [${topic}] 改/读 foo.ts\n`;
    m.set(`${WS}/${rel}`, BODY);
  }
  const rs = toolRegistry.get("read_shadow");
  const out = String(await rs.execute({ mode, topic }, { agent: T }));
  assert.ok(out.length > 10, `${label} 应有输出`);
  const meta = JSON.parse(store.get(`${WS}/.shadow/_meta.json`) || "{}");
  assert.ok(meta[rel] && Number(meta[rel].hits) >= 1, `${label} 应记 hits；实际 ${JSON.stringify(meta[rel])}`);
  console.log(`✔ ${label}`);
};

await smokeMode("episode", "EpSmoke", "⑦ D7=②：mode:\"episode\" 记 hits");
await smokeMode("decision", "DecSmoke", "⑧ D7=②：mode:\"decision\" 记 hits");
await smokeMode("task", "TaskSmoke", "⑨ D7=②：mode:\"task\" 记 hits");
await smokeMode("context", "CtxSmoke", "⑩ D7=②：mode:\"context\" 记 hits");

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 端到端「cooldown ledger 写入 vs hits」时序未做（主锁已在 renderWithinBudget 锁两集合）；");
console.log("  · 真语料上的 74.3% 是离线探针读数（`_research/tier-l0-share.ts`），不放进单元测试。");
console.log("ALL PASS ✅");
