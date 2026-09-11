// dsh-shadow —— 命中数累积的**触发条件**回归锁（ADR-0067）。
//
// 背景（实测的真缺陷，与 v1.15.13/15/18、D5 同类）：`query/query.ts` 里
// 「给被服务的记忆累加 hits / confirmedBy」那段用的是 `servedDetail`，而它的定义是
// `s.tier !== "L0" && render.includes("…")` —— 即「**渲染里展开了片段**」的那些记忆。
// ⇒ 两个后果：
//   ① `tierFor` 对「动作行占比 > 60%」的记忆返回 **L0**（真语料实测 **74.3%**，5342/7185），
//      它们**永不可能**累积命中数；
//   ② 即便 tier 是 L1/L2，还要该次预算够展开片段（`budgetChars >= out.length + 30`）才会进集合。
// 实测佐证：本机 7000+ 条记忆、多次召回之后 `.shadow/_meta.json` **仍不存在**。
//
// 语义：`hits` 在文档里的定义是「召回**命中数**」（README「记忆遗忘」节：hotness = 命中数 × 半衰期衰减），
// 被返回一条记忆就是一次命中 —— 与「是否展开了片段」无关。故累积应基于 `servedRels`（**每条被返回的**）。
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

// ── ① 前置事实：这段文本的 tier 必须是 L0（否则本测试测不到目标的那个分支） ──
// 「动作行占比 > 60%」+ 无思维词 ⇒ L0。这正是真语料里 74.3% 的记忆的形态。
const L0_BODY =
  "# pkg-a\n\n> 完整线索\n> 概况：3 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n> Agent：T1\n\n" +
  "- [10:00:00] [pkg-a] 改/读 pkg-a/x.js\n" +
  "- [10:00:01] [pkg-a] 改/读 pkg-a/y.js\n" +
  "- [10:00:02] [pkg-a] 调用 build\n";
assert.equal(tierFor(L0_BODY), "L0", "前置条件：这段文本的 tier 必须是 L0（本测试专测 tier=L0 的记忆）");
console.log("✔ ① 前置条件成立：动作行占满 ⇒ tierFor 返回 L0（真语料 74.3% 的记忆是这个形态）");

// ── ② 复现：tier=L0 的记忆被**返回**了，但命中数没有累积 ──
{
  const store = new Map<string, string>();
  const { m, agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
  const T = agent("T1");
  m.set(`${WS}/.shadow/2026-09-07/2026-09-07--100000-pkg-a.md`, L0_BODY);

  const rs = toolRegistry.get("read_shadow");
  assert.ok(rs, "read_shadow 工具应已注册");
  const out = String(await rs.execute({ topic: "build" }, { agent: T }));

  // 先确认「确实返回了这条记忆」（否则本测试测的是别的东西）
  assert.ok(out.includes("pkg-a"), "前置条件：召回应返回该记忆（否则测不到累积逻辑）");
  // tier=L0 ⇒ 渲染里不会展开片段 ⇒ 不含 "…"
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
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
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
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
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

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · `servedRels` 与「冷却/预算截断后再返回」的交互只按代码路径覆盖，未做端到端时序测试；");
console.log("  · 真语料上的 74.3% 是离线探针读数（`_research/tier-l0-share.ts`），不放进单元测试。");
console.log("ALL PASS ✅");
