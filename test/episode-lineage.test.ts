// dsh-shadow —— Episode/Decision Lineage 验证（mock host，驱动真实插件代码）。
// 覆盖：
//   1) 写侧：buildClueHeader 把「用户拍板」也计为决策（修正 `概况：0 决策` 根因），并输出 `> 决策：` 行；
//   2) 读侧 mode:"episode"：把 Event/Turn 级记忆原子按「项目/会话 + 时间间隔」串成连续任务（Episode）；
//   3) 读侧 mode:"decision"：把「决策」提升为可追踪血缘（按入口聚合）；
//   4) _index.md 含「## 任务回溯（Episodes）」段。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
const { apply, name, inject } = mod;

const WS = "D:/ws";

// —— 内存 fs，模拟 DSH fs 服务的 resolve/readText/writeText/listDir ——
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

const toolRegistry = new Map<string, any>();

// ─────────────────────────────────────────────
// 场景 1（写侧）：用户拍板被计为决策 + `> 决策：` 行
// ─────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const { m, agentsById, agent, listeners, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
  const T = agent("T1");
  const fire = (ev: string, ...a: any[]) => { const fn = listeners.get(ev); assert.ok(fn, `missing ${ev}`); return fn(...a); };
  fire("fs/observed", { targetKey: `${WS}/pkg-a/util.js`, displayPath: `${WS}/pkg-a/util.js` }, { kind: "present", version: "v1" }, { agent: { id: "T1" } });
  fire("session/event", { id: "T1", header: { cwd: WS } }, { type: "user/message", seq: 1, time: Date.now(), data: { id: "m1", role: "user", content: [{ type: "text", text: "就这么定了，按这个方案改成 bundle 模式。" }], source: { kind: "user" } } });
  fire("goal/changed", { agent: { id: "T1" }, change: { action: "complete", objective: "把入口改造为 bundle" } });
  await fire("agent/turn-stopping", { agent: T, turn: 1, signal: undefined });
  const memW = [...store.keys()].find((k) => k.replace(/\\/g, "/").includes("/.shadow/") && !k.endsWith("_index.md"));
  assert.ok(memW, "T1 记忆应落盘");
  const txtW = store.get(memW)!;
  assert.ok(txtW.includes("> 决策："), `用户拍板应输出 > 决策： 行：\n${txtW}`);
  assert.ok(/概况：\d+ 动作 · \d+ 用户消息 · [1-9]\d* 决策/.test(txtW), `决策计数应>0（含用户拍板）：\n${txtW}`);
  console.log("✔ 写侧决策：用户拍板计入决策 + 输出 `> 决策：` 行（修正 0 决策 根因）");
}

// ─────────────────────────────────────────────
// 场景 2（读侧）：派生 Episode 分组 + 索引任务回溯段
// ─────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const { m, agentsById, agent, listeners, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
  const T = agent("T2");
  const rd = (x: any) => toolRegistry.get("read_shadow").execute(x, { agent: T });
  // 直接种 4 条记忆（绕开写侧时间戳不确定性，专测读侧派生分组）：
  //   09:00 / 09:01 / 09:05 → 同上一任务（间隔 < 60min）
  //   12:00 → 另一任务（间隔 > 60min → 新 Episode）
  const seed = (rel: string, entry: string, at: string, decision: string, goal: string) => {
    store.set(`D:/ws/.shadow/${rel}`,
      `# ${entry}\n\n> 完整线索\n> 背景/材料：${entry}/x.js\n> 用户提示/决策：「${decision}」〔decision〕\n> 证据链：来源(动作·用户) · 日期(2026-09-07) · 证据(${entry}/x.js)\n> 概况：1 动作 · 1 用户消息 · 1 决策\n> 项目：ws\n> Agent：T2\n> 目标：${goal}\n\n- [${at}] [${entry}] 改/读 ${entry}/x.js\n`);
  };
  seed("2026-09-07/2026-09-07--090000-pkg-a.md", "pkg-a", "09:00:00", "采用 bundle 模式", "把入口改造为 bundle");
  seed("2026-09-07/2026-09-07--090100-pkg-b.md", "pkg-b", "09:01:00", "拆分模块", "把入口改造为 bundle");
  seed("2026-09-07/2026-09-07--090500-pkg-a.md", "pkg-a", "09:05:00", "重构 resolver", "把入口改造为 bundle");
  seed("2026-09-07/2026-09-07--120000-other.md", "pkg-other", "12:00:00", "另外一个任务", "处理另一个需求");
  // 触发一次真实 flush → rebuildIndex 扫描全部记忆并派生 Episode 段
  const fire = (ev: string, ...a: any[]) => { const fn = listeners.get(ev); assert.ok(fn, `missing ${ev}`); return fn(...a); };
  fire("session/event", { id: "T2", header: { cwd: WS } }, { type: "user/message", seq: 1, time: Date.now(), data: { id: "m2", role: "user", content: [{ type: "text", text: "触发一次索引重建" }], source: { kind: "user" } } });
  await fire("agent/turn-stopping", { agent: T, turn: 1, signal: undefined });
  // 索引应含「任务回溯（Episodes）」段
  const idx = store.get("D:/ws/.shadow/_index.md");
  assert.ok(idx && idx.includes("## 任务回溯（Episodes）"), `索引应含任务回溯段：\n${(idx || "").slice(-400)}`);
  // mode:episode → 应分出独立 Episode：3 条同任务聚合、12:00 单独
  const ep = await rd({ mode: "episode" });
  assert.ok(!String(ep).startsWith("ERR"), "mode:episode 不应报错");
  assert.ok(String(ep).includes("把入口改造为 bundle"), `Episode 应含任务标题：\n${String(ep).slice(0, 300)}`);
  assert.ok(String(ep).includes("3 条记忆"), `第一个 Episode 应聚合 3 条记忆：\n${String(ep).slice(0, 300)}`);
  assert.ok(String(ep).includes("3 决策"), `第一个 Episode 应有 3 条决策（用户拍板，目标不算决策）：\n${String(ep).slice(0, 300)}`);
  assert.ok(String(ep).includes("另外一个任务"), "跨任务（时间间隔大）应另成 Episode");
  console.log("✔ 读侧 Episode：按项目/会话+时间间隔串成连续任务，索引含任务回溯段");
}

// ─────────────────────────────────────────────
// 场景 3（读侧）：Decision Lineage 血缘
// ─────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const { m, agentsById, agent, listeners, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
  const T = agent("T3");
  const rd = (x: any) => toolRegistry.get("read_shadow").execute(x, { agent: T });
  store.set("D:/ws/.shadow/2026-09-07/2026-09-07--090000-io.md",
    "# io-backend\n\n> 完整线索\n> 用户提示/决策：「删除 TodoSyncJob」〔decision〕；「保留 RetryWorker」〔decision〕\n> 概况：0 动作 · 2 用户消息 · 0 决策\n> 项目：ws\n> Agent：T3\n\n- [09:00:00] [io-backend] 用户：删除 TodoSyncJob。\n- [09:00:01] [io-backend] 用户：保留 RetryWorker。\n");
  const dl = await rd({ mode: "decision" });
  assert.ok(!String(dl).startsWith("ERR"), "mode:decision 不应报错");
  assert.ok(String(dl).includes("2 条决策"), `Decision Lineage 应统计决策数：\n${String(dl).slice(0, 200)}`);
  assert.ok(String(dl).includes("删除 TodoSyncJob"), "决策血缘应含具体决策文本");
  assert.ok(String(dl).includes("保留 RetryWorker"), "决策血缘应含另一条决策");
  assert.ok(String(dl).includes("io-backend"), "决策血缘应按入口聚合（io-backend）");
  console.log("✔ 读侧 Decision Lineage：把「决策」提升为可追踪血缘，按入口聚合");
}

console.log("ALL PASS ✅");
