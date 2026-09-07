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
  // 索引懒构建：read_shadow 无参才构建/落盘 _index.md
  await rd({});
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

// ─────────────────────────────────────────────
// 场景 4（Decision Capture Boundary）：assistant 明确理由被捕获；「好/可以」不误判为决策；
//           Reason 只在原文明确时挂，无则「未明确」，绝不补写。
// ─────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const { m, agentsById, agent, listeners, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
  const T = agent("T4");
  const fire = (ev: string, ...a: any[]) => { const fn = listeners.get(ev); assert.ok(fn, `missing ${ev}`); return fn(...a); };
  // assistant 明确决策 + 明确理由（应捕获为 DecisionEvent 带 reason）
  fire("session/event", { id: "T4", header: { cwd: WS } },
    { type: "assistant/message", seq: 1, time: Date.now(), data: { message: { id: "am1", role: "assistant", content: [{ type: "text", text: "我决定：保留 RetryWorker，因为它仍然承担失败重试职责。" }] } } });
  // 用户纯确认（「好。」→ Confirmation，不应成为 Decision）
  fire("session/event", { id: "T4", header: { cwd: WS } },
    { type: "user/message", seq: 1, time: Date.now(), data: { id: "m4", role: "user", content: [{ type: "text", text: "好。" }], source: { kind: "user" } } });
  await fire("agent/turn-stopping", { agent: T, turn: 1, signal: undefined });
  const mem4 = [...store.keys()].find((k) => k.replace(/\\/g, "/").includes("/.shadow/") && !k.endsWith("_index.md"));
  assert.ok(mem4, "T4 记忆应落盘");
  const txt4 = store.get(mem4);
  // assistant 决策 + 明确理由入头
  assert.ok(txt4.includes("> 决策：〔assistant〕保留 RetryWorker"), `assistant 明确决策应入 决策：行：\n${txt4}`);
  assert.ok(txt4.includes("> 决策理由：〔assistant〕它仍然承担失败重试职责"), `明确理由应入 决策理由：行：\n${txt4}`);
  // 「好。」是 Confirmation，不是 Decision —— 决策数只算 assistant 那 1 条
  assert.ok(/概况：\d+ 动作 · \d+ 用户消息 · 1 决策/.test(txt4), `Confirmation 不应计为决策，决策数=1：\n${txt4}`);
  assert.ok(txt4.includes("〔confirmation〕"), "「好。」应归类为 confirmation 而非 decision");
  // 读侧：Decision Lineage 展示 Reason（可追溯 Why），且 Reason=原文明确内容
  const dl4 = await toolRegistry.get("read_shadow").execute({ mode: "decision" }, { agent: T });
  assert.ok(String(dl4).includes("共 1 条决策"), "Decision Capture 只捕获明确决策（1 条）");
  assert.ok(String(dl4).includes("因：它仍然承担失败重试职责"), "Reason 应来自原文明确表达");
  assert.ok(!String(dl4).includes("好。"), "「好。」不应混入 Decision Lineage");
  console.log("✔ Decision Capture：assistant 明确理由捕获 / Confirmation 不误判为决策 / Reason 不补写");
}

// ─────────────────────────────────────────────
// 场景 5（扩展 classifyUser）：范围/聚焦 + 锚点/定位 也捕获为 Decision；
//           "了解 当前 IO"（请求理解）不算决策，纯确认不算。
// ─────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const { m, agentsById, agent, listeners, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {} });
  const T = agent("T5");
  const fire = (ev: string, ...a: any[]) => { const fn = listeners.get(ev); assert.ok(fn, `missing ${ev}`); return fn(...a); };
  const userMsg5 = (text: string) =>
    fire("session/event", { id: "T5", header: { cwd: WS } }, { type: "user/message", seq: 1, time: Date.now(), data: { id: "m5", role: "user", content: [{ type: "text", text }], source: { kind: "user" } } });
  // 范围/聚焦（scope）→ 决策
  userMsg5("资产同步");
  // 锚点/定位（anchor）→ 决策
  userMsg5("/home/g/project/u8-workspace/u8cloud 这是 openapi 的 U8 工作区");
  // 请求理解（不是决策）
  userMsg5("了解 当前 IO");
  await fire("agent/turn-stopping", { agent: T, turn: 1, signal: undefined });
  const mem5 = [...store.keys()].find((k) => k.replace(/\\/g, "/").includes("/.shadow/") && !k.endsWith("_index.md"));
  assert.ok(mem5, "T5 记忆应落盘");
  const txt5 = store.get(mem5);
  assert.ok(txt5.includes("> 决策：〔user〕资产同步"), `范围/聚焦应捕获为决策：\n${txt5}`);
  assert.ok(txt5.includes("这是 openapi 的 U8 工作区"), `锚点/定位应捕获为决策：\n${txt5}`);
  assert.ok(/概况：\d+ 动作 · 3 用户消息 · 2 决策/.test(txt5), `决策数应为 2（资产同步+U8工作区；「了解当前IO」不算）：\n${txt5}`);
  assert.ok(!txt5.includes("〔decision〕了解"), "「了解 当前 IO」不应被判为决策");
  console.log("✔ 扩展 classifyUser：范围/聚焦 + 锚点/定位 捕获为 Decision；请求理解不算");
}

// ─────────────────────────────────────────────
// 场景 6（L2 增量索引 + 遗忘）：forget.enabled 时，低价值/旧/已归档记忆从「活跃索引」与
//           召回集剔除（文件保留，Forget≠Delete）；索引仍正确、含新增、不含被遗忘。
// ─────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const { m, agentsById, agent, listeners, ctx } = mkCtx(store);
  // 种子：活跃(act, hits5) / 已归档(old, archived) / 旧低命中(low, 2020, hits0)
  store.set("D:/ws/.shadow/2026-09-05/2026-09-05--100000-act.md", "# act\n\n> 完整线索\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [10:00:00] [act] 用户：活跃记忆 A\n");
  store.set("D:/ws/.shadow/2026-09-05/2026-09-05--110000-old.md", "# old\n\n> 完整线索\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [11:00:00] [old] 用户：已归档记忆 OLD\n");
  store.set("D:/ws/.shadow/2020-01-01/2020-01-01--000000-low.md", "# low\n\n> 完整线索\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [00:00:00] [low] 用户：旧低命中记忆 LOW\n");
  store.set("D:/ws/.shadow/_meta.json", JSON.stringify({
    ".shadow/2026-09-05/2026-09-05--100000-act.md": { created: "2026-09-05", hits: 5, status: "active", pinned: false },
    ".shadow/2026-09-05/2026-09-05--110000-old.md": { created: "2026-09-05", hits: 0, status: "archived", pinned: false },
    ".shadow/2020-01-01/2020-01-01--000000-low.md": { created: "2020-01-01", hits: 0, status: "active", pinned: false },
  }));
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: true, staleDays: 14, minHits: 1 } });
  const T = agent("T6");
  const fire = (ev: string, ...a: any[]) => { const fn = listeners.get(ev); assert.ok(fn, `missing ${ev}`); return fn(...a); };
  fire("session/event", { id: "T6", header: { cwd: WS } }, { type: "user/message", seq: 1, time: Date.now(), data: { id: "m6", role: "user", content: [{ type: "text", text: "触发一次索引重建" }], source: { kind: "user" } } });
  await fire("agent/turn-stopping", { agent: T, turn: 1, signal: undefined });
  // 索引懒构建：read_shadow 无参才构建/落盘 _index.md（同时验证遗忘在该路径生效）
  await toolRegistry.get("read_shadow").execute({}, { agent: T });
  const idx = store.get("D:/ws/.shadow/_index.md");
  assert.ok(idx && idx.includes("2026-09-05--100000-act.md"), "活跃记忆应保留在索引");
  assert.ok(!idx.includes("2026-09-05--110000-old.md"), "已归档(old)遗忘：不应出现在索引");
  assert.ok(!idx.includes("2020-01-01--000000-low.md"), "旧低命中(low)遗忘：不应出现在索引");
  const rs = toolRegistry.get("read_shadow");
  const ex = { agent: T };
  assert.ok(String(await rs.execute({ topic: "act" }, ex)).includes("活跃记忆 A"), "活跃记忆可召回");
  assert.ok(String(await rs.execute({ topic: "OLD" }, ex)).includes("无匹配"), "已归档(old)应被遗忘不出现在召回");
  assert.ok(String(await rs.execute({ topic: "LOW" }, ex)).includes("无匹配"), "旧低命中(low)应被遗忘");
  console.log("✔ L2 增量索引 + 遗忘：低价值/旧/已归档从活跃索引与召回剔除（文件保留）");
}

// ─────────────────────────────────────────────
// 场景 7（Episode 收口归档 / compact）：关闭的 episode 原子被合并成一个 consolidated 文件，
//           个体原子 mark compacted 移出活跃索引/召回（文件保留可回放）；活跃热集文件数大降。
// ─────────────────────────────────────────────
{
  const store = new Map<string, string>();
  const { m, agentsById, agent, listeners, ctx } = mkCtx(store);
  // Episode A（关闭）：09:00/09:01/09:05 三个原子（entry pkg-a，含决策"采用 bundle 模式"）
  const seedA = (rel: string, decision: string, path: string) =>
    store.set(`D:/ws/.shadow/${rel}`,
      `# pkg-a\n\n> 完整线索\n> 背景/材料：${path}\n> 用户提示/决策：「${decision}」〔decision〕\n> 概况：1 动作 · 1 用户消息 · 1 决策\n> 项目：ws\n> Agent：T7\n\n- [10:00:00] [pkg-a] 改/读 ${path}\n`);
  seedA("2026-09-07/2026-09-07--090000-pkg-a.md", "采用 bundle 模式", "pkg-a/x.js");
  seedA("2026-09-07/2026-09-07--090100-pkg-a.md", "拆分模块", "pkg-a/x2.js");
  seedA("2026-09-07/2026-09-07--090500-pkg-a.md", "重构 resolver", "pkg-a/x3.js");
  // Episode B（当前/打开）：12:00
  store.set("D:/ws/.shadow/2026-09-07/2026-09-07--120000-pkg-b.md", "# pkg-b\n\n> 完整线索\n> 背景/材料：pkg-b/y.js\n> 概况：1 动作 · 0 用户消息 · 0 决策\n> 项目：ws\n> Agent：T7\n\n- [12:00:00] [pkg-b] 改/读 pkg-b/y.js\n");
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, compact: { enabled: true, gapMinutes: 60 } });
  const T = agent("T7");
  const rs = toolRegistry.get("read_shadow");
  // 读索引 → ensureIndex → rebuildIndex → runCompact 收口 Episode A
  const r0 = await rs.execute({}, { agent: T });
  assert.ok(!String(r0).startsWith("ERR"), "compaction 下 read_shadow 不应报错");
  const consolidatedKey = [...store.keys()].find((k) => k.replace(/\\/g, "/").includes("/.shadow/") && k.includes("-consolidated.md"));
  assert.ok(consolidatedKey, "应生成 consolidated 文件");
  const ctext = store.get(consolidatedKey);
  assert.ok(ctext.includes("采用 bundle 模式"), "consolidated 文件保留决策");
  assert.ok(ctext.includes("改/读 pkg-a/x.js"), "consolidated 文件保留动作");
  // 索引只含 consolidated + 当前 episode，不再列 3 个 pkg-a 原子
  const idx = store.get("D:/ws/.shadow/_index.md");
  assert.ok(idx && idx.includes("consolidated.md") && idx.includes("120000-pkg-b.md"), "索引应含 consolidated+当前episode");
  assert.ok(!idx.includes("090000-pkg-a.md") && !idx.includes("090500-pkg-a.md"), "已收口原子不应出现在索引");
  // 原子已标记 compacted（meta 持久化），文件保留（Forget≠Delete）
  const meta = JSON.parse(store.get("D:/ws/.shadow/_meta.json") || "{}");
  assert.equal(meta[".shadow/2026-09-07/2026-09-07--090000-pkg-a.md"]?.status, "compacted", "原子应标记 compacted");
  assert.ok(store.has("D:/ws/.shadow/2026-09-07/2026-09-07--090000-pkg-a.md"), "原子文件应保留（未删除）");
  // 召回：bundle 由 consolidated 提供
  assert.ok(String(await rs.execute({ topic: "bundle" }, { agent: T })).includes("采用 bundle 模式"), "收口后决策可召回");
  console.log("✔ Episode 收口归档：关闭 episode → consolidated 文件 + 原子压缩归档（文件数大降、可回放）");
}

console.log("ALL PASS ✅");
