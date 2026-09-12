// dsh-shadow —— T8-A 回归锁：**能力降级必须有可见信号**（v1.15.65 / ADR-0049）。
//
// 背景：T8（`BACKLOG.md`，立账于 v1.15.34）列了 **7 条静默降级**，判据是 ADR-0049 的
// 「`unavailable` 状态 / flush warn / debug trace **三者至少一个** —— **`console.log` 不算**」。
// 其中最彻底的一例是 `streamText`：它的 catch 分支是 `if (opts.label) console.log(...)`，
// 而 `recallSelect` / `knowledgeNavigate` 传的是 `label: ""` ⇒ **连 log 都没有**；
// 并且 `!llm`、`!route`、`finish.reason.kind === "error"|"aborted"` 三条路径
// **从不进 catch** ⇒ 即使有 label 也不出声。
//
// 本轮建立**一个**机制：`WriterCore.degrade` 台账 + `getFlushWarn()` 渲染成横幅
// （`flushWarn` 已被每一个读路径带在返回值里 ⇒ 一处渲染，所有 mode 同时获得信号）。
//
// 本文件锁三层：
//   ① `streamText` 的**四条**静默路径都回传原因（`onSkip`），且健康路径**不**回传（负对照）；
//   ② 台账 → 横幅的机制：有留痕必有横幅、**无留痕必无横幅**、多条按能力名排序（输出稳定）；
//   ③ 各生产者真的写台账：`summary` / `llmRecall` / `recallExpansion`（写侧，直接可调）
//      + `queryLog`（读侧，走真实 `read_shadow` 端到端）。
//
// **反例正控**写在每一组里：若把机制改成「永远打印横幅」或「永远不打印」，
// 正/负对照中必有一侧变红 —— 防止本测试退化成恒真。
import assert from "node:assert/strict";
import { streamText } from "../dist/core/writer-llm.js";
import { createShadowCollector } from "../dist/core/writer.js";
import { recordQueryObservation, summarizeQueryLog } from "../dist/query/observatory.js";
import { readLedger } from "../dist/retrieval/ledger.js";
import * as mod from "../dist/index.js";

// ─────────────────────────────────────────────
// ① streamText 的四条静默路径
// ─────────────────────────────────────────────
{
  const base = { label: "", system: "s", messages: [], maxTokens: 4, timeoutMs: 50 };
  const collect = () => { const seen: string[] = []; return { seen, onSkip: (r: string) => { seen.push(r); } }; };

  // (a) `llm` 服务缺失 —— 旧版 `if (!llm || !route) return ""` 静默
  {
    const { seen, onSkip } = collect();
    const out = await streamText({ get: () => undefined }, { provider: "p", model: "m" }, { ...base, onSkip });
    assert.equal(out, "", "llm 缺失应返回空串（契约不变）");
    assert.deepEqual(seen, ["llm-service-unavailable"], `llm 缺失必须回传原因；实际 ${JSON.stringify(seen)}`);
  }
  // (b) 路由缺失
  {
    const { seen, onSkip } = collect();
    const out = await streamText({ get: () => ({ stream: async function* () {} }) }, undefined, { ...base, onSkip });
    assert.equal(out, "");
    assert.deepEqual(seen, ["no-route"], `无路由必须回传原因；实际 ${JSON.stringify(seen)}`);
  }
  // (c) `finish` 报错 —— 旧版 `return ""` 且**不进 catch**（所以有 label 也不出声）
  {
    const { seen, onSkip } = collect();
    const llm = { stream: async function* () { yield { type: "finish", reason: { kind: "error", message: "boom" } }; } };
    const out = await streamText({ get: () => llm }, { provider: "p", model: "m" }, { ...base, onSkip });
    assert.equal(out, "", "finish error 应返回空串");
    assert.deepEqual(seen, ["llm-finish-error"], `finish error 必须回传原因；实际 ${JSON.stringify(seen)}`);
  }
  // (d) `finish` 被中止（超时）
  {
    const { seen, onSkip } = collect();
    const llm = { stream: async function* () { yield { type: "finish", reason: { kind: "aborted" } }; } };
    await streamText({ get: () => llm }, { provider: "p", model: "m" }, { ...base, onSkip });
    assert.deepEqual(seen, ["llm-finish-aborted"], `finish aborted 必须回传原因；实际 ${JSON.stringify(seen)}`);
  }
  // (e) 流抛异常 —— 旧版只在 `label` 非空时 log
  {
    const { seen, onSkip } = collect();
    const llm = { stream: async function* () { throw new Error("stream blew up"); } };
    await streamText({ get: () => llm }, { provider: "p", model: "m" }, { ...base, onSkip });
    assert.deepEqual(seen, ["llm-error"], `流异常必须回传原因（且**与 label 无关**）；实际 ${JSON.stringify(seen)}`);
  }
  // (f) **负对照**：健康流 ⇒ 一次都不许回传（否则横幅会被健康路径污染）
  {
    const { seen, onSkip } = collect();
    const llm = { stream: async function* () { yield { type: "text-delta", text: "42" }; yield { type: "finish", reason: { kind: "stop" } }; } };
    const out = await streamText({ get: () => llm }, { provider: "p", model: "m" }, { ...base, onSkip });
    assert.equal(out, "42", "健康流应返回文本");
    assert.deepEqual(seen, [], `**负对照**：健康路径不得回传任何降级原因；实际 ${JSON.stringify(seen)}`);
  }
  console.log("✔ ① streamText 四条静默路径（llm 缺 / 无路由 / finish error / finish aborted / 流异常）全部回传原因；健康流一次都不回传");
}

// ─────────────────────────────────────────────
// ② 台账 → 横幅的机制（正/负对照 + 输出稳定性）
// ─────────────────────────────────────────────
{
  const files = new Map<string, string>();
  const fs = { resolve: async (p: string) => p, writeText: async (p: string, t: string) => { files.set(p, t); }, readText: async (p: string) => files.get(p) || "" };
  const mk = (config: any) => createShadowCollector({
    context: { get: (k: string) => (k === "fs" ? fs : undefined) },
    config: { summary: { enabled: false }, writeConsent: false, forget: {}, compact: {}, retention: { enabled: false }, ...config },
    getAgentById: (id: string | undefined) => ({ id }),
  });

  const c1 = mk({});
  // **负对照**：没有任何降级 ⇒ 横幅必须是空串（逐字节，不是「不含关键词」）
  assert.equal(c1.getFlushWarn(), "", "**负对照**：无降级时 getFlushWarn() 必须逐字节为空（健康路径输出不得变化）");

  c1.noteDegrade("zeta", "原因 Z", "后果 Z");
  c1.noteDegrade("alpha", "原因 A", "后果 A");
  const w = c1.getFlushWarn();
  assert.ok(w.includes("能力降级") && w.includes("alpha") && w.includes("zeta"), `两条留痕都应出现在横幅里；实际 ${JSON.stringify(w)}`);
  assert.ok(w.includes("原因 A") && w.includes("后果 A"), "横幅必须同时说清**原因**与**后果**（只说原因等于没告诉读者丢了什么）");
  assert.ok(w.indexOf("alpha") < w.indexOf("zeta"), `**输出稳定性**：必须按能力名排序，而不是插入序（插入序会让逐字节比对的门禁变脆）；实际 ${JSON.stringify(w)}`);

  // 同类**覆盖**而不是追加：一直坏着的能力不该每回合刷一条（否则信号变成噪音）
  const count = (s: string) => s.split("能力降级").length - 1;
  assert.equal(count(w), 2, "两条留痕应渲染成两行");
  // 注意：新原因**不能**是旧原因的前缀子串，否则「覆盖」与「追加」用 `includes` 分不开
  // （第一版就踩了这个：用「原因 A2」覆盖「原因 A」，而 "原因 A2".includes("原因 A") 为真 ⇒ 断言恒真）。
  c1.noteDegrade("alpha", "原因 B", "后果 B");
  const after = c1.getFlushWarn();
  assert.ok(after.includes("原因 B") && after.includes("后果 B"), "同能力应被**最新一条覆盖**");
  assert.ok(!after.includes("原因 A"), `被覆盖的旧原因必须消失（否则就是追加，能力坏了会一直刷屏）；实际 ${JSON.stringify(after)}`);
  assert.equal(count(after), 2, `覆盖不得增加行数（仍应是 alpha + zeta 两条）；实际 ${JSON.stringify(after)}`);

  // **负对照 2**：另一个实例的台账必须干净（台账在 WriterCore 上，不是模块级单例）
  const c2 = mk({});
  assert.equal(c2.getFlushWarn(), "", "**负对照**：台账必须随插件实例隔离，不得跨实例泄漏（模块级单例会污染多会话）");
  console.log("✔ ② 台账→横幅：有留痕必有横幅（含原因+后果、按能力名排序、同类覆盖）· 无留痕逐字节为空 · 实例间隔离");
}

// ─────────────────────────────────────────────
// ③ 写侧生产者真的写台账：summary / llmRecall / recallExpansion
//    三者都经 `streamText` 的 onSkip，而 mock context **没有 `llm` 服务** ⇒ 必走 `llm-service-unavailable`。
// ─────────────────────────────────────────────
{
  const files = new Map<string, string>();
  const fs = { resolve: async (p: string) => p, writeText: async (p: string, t: string) => { files.set(p, t); }, readText: async (p: string) => files.get(p) || "" };
  const collector = createShadowCollector({
    context: { get: (k: string) => (k === "fs" ? fs : undefined) },
    config: {
      // 三者都**显式开启** —— 关闭不算降级（那是用户的选择，T8 的判据是「关掉或**缺件**后无信号」）
      summary: { enabled: true },
      recall: { enabled: true },
      llmRecall: { enabled: true },
      writeConsent: false, forget: {}, compact: {}, retention: { enabled: false },
    },
    getAgentById: (id: string | undefined) => ({ id }),
  });

  // (a) `summary`：走真实 flush（push → onTurnStopping），`patchSummary` 会调 `summarizeTurn`
  collector.push("a1", { kind: "action", text: "改/读 spec/x.md", comp: "spec/x.md", source: "fs" });
  await collector.onTurnStopping({ agent: { id: "a1" } });
  const wSummary = collector.getFlushWarn();
  assert.ok(wSummary.includes("summary"), `\`summary\` 降级必须留痕（T8 第 2 条：文件里「没有摘要」与「尚未生成」不可区分）；实际 ${JSON.stringify(wSummary)}`);

  // (b) `llmRecall`：`recallSelect` 是 collector 的公开方法
  const picked = await collector.recallSelect("查什么", [{ title: "t", objective: "", summary: "" } as any]);
  assert.deepEqual(picked, [], "无 llm 时 recallSelect 必须回退返回 []（行为不变）");
  assert.ok(collector.getFlushWarn().includes("llmRecall"), `\`llmRecall\` 降级必须留痕（T8 第 1 条：label:"" 使 catch 分支连 log 都不打）；实际 ${JSON.stringify(collector.getFlushWarn())}`);

  // (c) `recallExpansion`：`expandTerms` 是 collector 的公开方法
  const terms = await collector.expandTerms("pkg-a");
  assert.deepEqual(terms, [], "无 llm 时 expandTerms 必须回退返回 []（行为不变）");
  assert.ok(collector.getFlushWarn().includes("recallExpansion"), `语义扩词降级必须留痕（T8 第 3 条：README 自称「静默退回 A 档」）；实际 ${JSON.stringify(collector.getFlushWarn())}`);

  // **负对照**：三条都在，且各自只说自己的原因 ⇒ 区分得出是哪一条降级了
  const all = collector.getFlushWarn();
  for (const cap of ["summary", "llmRecall", "recallExpansion"]) {
    assert.ok(all.includes(cap), `横幅应含 ${cap}`);
  }
  console.log("✔ ③ 写侧三条生产者（summary / llmRecall / recallExpansion）在缺 llm 时各留一条痕，且读得清是哪一条降级");

  // **负对照 2**：把三者都显式关掉 ⇒ 不许留痕（「用户关掉」不是降级）
  const off = createShadowCollector({
    context: { get: (k: string) => (k === "fs" ? fs : undefined) },
    config: { summary: { enabled: false }, recall: { enabled: false }, llmRecall: { enabled: false }, writeConsent: false, forget: {}, compact: {}, retention: { enabled: false } },
    getAgentById: (id: string | undefined) => ({ id }),
  });
  off.push("a2", { kind: "action", text: "改/读 spec/y.md", comp: "spec/y.md", source: "fs" });
  await off.onTurnStopping({ agent: { id: "a2" } });
  await off.expandTerms("t");
  await off.recallSelect("q", [{ title: "t" } as any]);
  assert.equal(off.getFlushWarn(), "", `**负对照**：显式关闭的能力不得留痕（关掉是用户选择，不是降级）；实际 ${JSON.stringify(off.getFlushWarn())}`);
  console.log("✔ ③b 负对照：三者显式 `enabled: false` 时**零留痕**（「关掉」≠「坏了」）");
}

// ─────────────────────────────────────────────
// ④ 读侧生产者（单元层）：`queryLog` 与 `recallLedger`
// ─────────────────────────────────────────────
{
  const goodFs = { resolve: async (p: string) => p, writeText: async () => ({}), readText: async () => "" };
  const badFs = { resolve: async (p: string) => p, writeText: async () => { throw new Error("readonly"); }, readText: async () => "" };
  const obs: any = { date: "2026-09-13", ts: "10:00:00", query: "q", scope: "all", limit: 8, candidateNodes: 0, projectionCached: false, returnedNodes: 0, evidenceCount: 0, evidenceNodes: 0, relationCount: 0, relationNodes: 0, nodeTypes: {}, nodeTitles: [], latencyMs: 1 };

  assert.equal(await recordQueryObservation(goodFs, "D:/ws", { queryLog: { enabled: true } }, obs), true, "写成功必须返回 true（调用方据此区分「没记」与「没写成」）");
  assert.equal(await recordQueryObservation(badFs, "D:/ws", { queryLog: { enabled: true } }, obs), false, "写失败必须返回 false（旧契约 `Promise<void>` + `catch {}` 让调用方无从知道）");
  assert.equal(await recordQueryObservation(badFs, "D:/ws", { queryLog: { enabled: false } }, obs), false, "显式关闭返回 false，但调用点**不得**据此留痕（用户选择）");
  console.log("✔ ④a recordQueryObservation 返回真假（写成功 true / 写失败 false / 显式关闭 false）");

  // `readLedger` 的三种失败必须**分别**标出（旧版 `corrupt` 标记没有任何消费者 = 等价于没留）
  const okLedger = { resolve: async () => "t", readText: async () => JSON.stringify({ turn: 7, served: {} }) };
  const badJson = { resolve: async () => "t", readText: async () => "{ not json" };
  const wrongShape = { resolve: async () => "t", readText: async () => JSON.stringify({ nope: 1 }) };
  const thrown = { resolve: async () => { throw new Error("EACCES: denied"); }, readText: async () => "" };
  const empty = { resolve: async () => "t", readText: async () => "" };
  assert.equal((await readLedger(okLedger, "D:/ws")).turn, 7, "正常台账应读回 turn");
  assert.equal((await readLedger(badJson, "D:/ws")).corrupt, true, "解析失败应标 corrupt");
  assert.equal((await readLedger(wrongShape, "D:/ws")).corrupt, true, "结构不对应标 corrupt");
  const un = await readLedger(thrown, "D:/ws");
  assert.equal(un.unreadable, true, "读不到（抛错）应标 unreadable —— 旧版这个 catch 什么都不带");
  assert.match(String(un.error), /EACCES/, "unreadable 必须带上原因，否则读者只知道「坏了」不知道「为什么」");
  const emp = await readLedger(empty, "D:/ws");
  assert.equal(emp.corrupt, undefined, "空文件是「真的还没有台账」，**不是**坏件（坏件 ≠ 空件）");
  assert.equal(emp.unreadable, undefined, "空文件不是 unreadable");
  console.log("✔ ④b readLedger 区分「正常 / 坏件 corrupt / 读不到 unreadable / 真的还没有」四种，且 unreadable 带原因");
}

// ─────────────────────────────────────────────
// ⑤ **端到端**：读侧两个生产者写失败时，读者在真实读输出里真的看得到横幅
//    · `queryLog`（T8 第 4 条）—— **默认开启**的观测层，T8 里优先级最高的一条；
//    · `recallLedger`（T8 第 5 条）—— `recall.cooldownTurns` 的台账（读不到 / 坏件 / 写失败）。
//    两条都必须**端到端**锁：只锁单元会漏掉「producer 写了台账，但读路径没带 flushWarn」这类断线。
// ─────────────────────────────────────────────
{
  const WS = "D:/ws";
  // 读与写**分开**拒绝：⑤a 要拦「写 query-log」，⑤b 要拦「读台账」而**放行写**
  //（若两个都拦，`recallLedger` 会被写入失败那条**覆盖**掉，测到的就不是「读不到」了）。
  const mkFs = (m: Map<string, string>, denyRead: (p: string) => boolean, denyWrite: (p: string) => boolean) => ({
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText(t: any) { if (denyRead(String(t.displayPath))) throw new Error("EACCES: denied"); return m.get(t.displayPath) ?? ""; },
    async writeText(t: any, c: string) {
      if (denyWrite(String(t.displayPath))) throw new Error("readonly");
      m.set(t.displayPath, c); return { version: "v1" };
    },
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
  const toolRegistry = new Map<string, any>();
  const mkCtx = (m: Map<string, string>, denyRead: (p: string) => boolean, denyWrite: (p: string) => boolean) => {
    const agentsById = new Map<string, any>();
    const agent = (id: string, cwd = WS) => { const a = { id, session: { header: { cwd } } }; agentsById.set(id, a); return a; };
    const services: any = { fs: mkFs(m, denyRead, denyWrite), agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) }, systemPrompt: { context: () => {} }, tools: { register: (d: any) => toolRegistry.set(d.name, d) }, llm: undefined, agentDefaultModel: undefined };
    const ctx: any = { get: (k: string) => services[k], on: () => () => {}, inject: (_d: string[], cb: Function) => cb({ get: (k: string) => services[k] }) };
    return { m, agent, ctx };
  };
  const seed = (store: Map<string, string>, rel: string, entry: string, path: string) =>
    store.set(`${WS}/.shadow/${rel}`,
      `# ${entry}\n\n> 完整线索\n> 背景/材料：${path}\n> 决策：〔user〕采用 ${entry}\n> 概况：1 动作 · 1 用户消息 · 1 决策\n> 项目：ws\n> Agent：T7\n\n- [10:00:00] [${entry}] 改/读 ${path}\n`);

  /**
   * 跑两次读（留痕发生在**本回合写入之后**，横幅在下一次读才可见 —— 留痕本身是持久的，不会丢），
   * 返回两次输出、`probe` 观察到的副产物、以及本次实例的全部落盘键。
   */
  const run = async (
    mode: string | undefined,
    args: any,
    deny: { read?: (p: string) => boolean; write?: (p: string) => boolean },
    probe?: (store: Map<string, string>) => boolean,
    extraCfg: any = {},
    seedLedger?: string,
  ) => {
    const store = new Map<string, string>();
    seed(store, "2026-09-13/2026-09-13--090000-pkg-a.md", "pkg-a", "pkg-a/x.js");
    if (seedLedger !== undefined) store.set(`${WS}/.shadow/_recall_log.json`, seedLedger);
    const { agent, ctx } = mkCtx(store, deny.read || (() => false), deny.write || (() => false));
    const { apply, name, inject } = mod;
    apply(ctx, { summary: { enabled: false }, recall: {}, ...extraCfg });
    const rs = toolRegistry.get("read_shadow");
    assert.ok(rs, "read_shadow 应已注册");
    // `mode` 为空时**不传该键** —— 默认召回路径与 `mode:"query"` 是**两条不同的读路径**
    // （第一版把 `mode: undefined` 也塞进去，等于传了 `{mode: undefined}`，得自己确认它等价于不传）。
    const payload: any = mode ? { mode, ...args } : { ...args };
    const first = String(await rs.execute(payload, { agent: agent("T7") }));
    const observed = probe ? probe(store) : false;
    const second = String(await rs.execute(payload, { agent: agent("T7") }));
    return { first, second, observed, keys: [...store.keys()] };
  };

  // ── (A) `queryLog`：`recordQueryObservation` 挂在 `mode:"query"` 上（`query/reads.ts:108`）──
  const qDeny = { write: (p: string) => p.includes("query-log") };
  const sawQueryLog = (s: Map<string, string>) => [...s.keys()].some((k) => k.includes("query-log"));
  const qHealthy = await run("query", { topic: "pkg-a" }, {}, sawQueryLog);
  // **正对照**：证明本组真的走到了 `recordQueryObservation` —— 否则「没有横幅」是假绿。
  // （第一版这里用默认 topic 召回路径调，正对照当场变红，暴露了代码路径没走到。）
  assert.ok(qHealthy.observed, "**正对照**：健康 fs 下 query-log 必须真的落盘");
  assert.ok(!qHealthy.first.includes("能力降级") && !qHealthy.second.includes("能力降级"),
    `**负对照**：queryLog 正常时不得出现任何降级横幅；实际 ${JSON.stringify(qHealthy.second.slice(-300))}`);

  const qBroken = await run("query", { topic: "pkg-a" }, qDeny, sawQueryLog);
  assert.equal(qBroken.observed, false, "**正对照**：拒绝写 query-log 时文件不应存在（证明 fs 桩真的拦住了）");
  assert.ok(qBroken.second.includes("能力降级") && qBroken.second.includes("queryLog"),
    `T8 第 4 条（**默认开启**的观测层写失败）必须在读者可见处出现；实际 ${JSON.stringify(qBroken.second.slice(-600))}`);
  console.log("✔ ⑤a 端到端 queryLog：写失败 ⇒ 输出出现「能力降级 · queryLog」；正常 ⇒ 零横幅（正/负对照齐备）");

  // ── (B) `recallLedger`：`readLedger` 在**默认召回路径**上（不传 `mode`；`query/query.ts:332`）──
  //    路径是**实测**出来的，不是猜的（`.docs/fix/2026-09-12/t8a-read-path-map.ts`）：
  //      · `mode:"recovery"` 走的是**另一个**恢复包渲染器，**不**产生这条留痕
  //        —— 但它**会渲染**别的路径留下的留痕（因为 `flushWarn` 在 `query.ts:74` 统一取，
  //        所有读 handler 都带）⇒ 我第一版把「复用了前一轮留下的横幅」误读成「recovery 走了台账」。
  //      · **不传 mode** 的默认召回才真的调 `readLedger`。
  //    另一个实测结论：留痕发生在**本回合写入之后**，故横幅在**下一次**读才可见 —— 本组的 `second` 就是为此。
  const validLedger = JSON.stringify({ turn: 3, served: {} });
  // **负对照**：合法台账（同一路径、同样调用）⇒ 不得有横幅。这条证明横幅是**内容坏**引起的，
  // 而不是「只要有这个文件就报」。
  const lOk = await run(undefined, { topic: "pkg-a" }, {}, undefined, {}, validLedger);
  assert.ok(!lOk.second.includes("recallLedger"),
    `**负对照**：合法台账不得出现 recallLedger 横幅（否则横幅只是「文件存在」的回声）；实际 ${JSON.stringify(lOk.second.slice(-400))}`);

  // 正：坏件（能读到、解析失败）
  const lCorrupt = await run(undefined, { topic: "pkg-a" }, {}, undefined, {}, "{ this is not json");
  assert.ok(lCorrupt.second.includes("recallLedger"),
    `T8 第 5 条（台账坏件 ⇒ 冷却窗口整体作废）必须可见；实际 ${JSON.stringify(lCorrupt.second.slice(-600))}`);
  assert.match(lCorrupt.second, /坏件/, "横幅必须说清是「坏件」还是「读不到」—— 两者的处置不同");

  // 正：读不到（`resolve`/`readText` 抛错）—— 旧版这个 catch **什么都不带**地回落空台账
  const lUnreadable = await run(undefined, { topic: "pkg-a" }, { read: (p: string) => p.includes("_recall_log.json") });
  assert.ok(lUnreadable.second.includes("recallLedger"),
    `台账**读不到**也必须可见；实际 ${JSON.stringify(lUnreadable.second.slice(-600))}`);
  assert.match(lUnreadable.second, /读不到/, "「读不到」与「坏件」是两个不同的原因，不得混成一句");
  console.log("✔ ⑤b 端到端 recallLedger：坏件 / 读不到 各自可见且原因可区分；合法台账 ⇒ 零横幅（负对照）");

  // ── (C) `abstracts`（目录摘要 sidecar）：T8-A **漏项**，v1.15.65 复查时补上 ──
  //    为什么它不是「正当静默」那一类：写失败时 `writeAbstracts` 会 `continue`，
  //    于是该日期目录的 L0 **不再被写进 `_index.md`** ⇒ **读者拿到的内容变了**（索引少一行）。
  //    判据见 `core/projection-store.ts` 的「正当静默类判据」。这条正是我上一轮
  //    「站在同一个 `catch` 旁边却没给它加信号」的漏项。
  const abDeny = { write: (p: string) => p.includes("_abstract.md") };
  const abHealthy = await run(undefined, {}, {}, undefined, {}, undefined);
  assert.ok(!abHealthy.second.includes("abstracts"),
    `**负对照**：sidecar 正常时不得出现 abstracts 横幅；实际 ${JSON.stringify(abHealthy.second.slice(-400))}`);
  const abBroken = await run(undefined, {}, abDeny);
  assert.ok(abBroken.second.includes("abstracts"),
    `目录摘要 sidecar 写失败必须可见（索引会少一行 ⇒ 内容变了）；实际 ${JSON.stringify(abBroken.second.slice(-600))}`);
  console.log("✔ ⑤c 端到端 abstracts：sidecar 写失败 ⇒ 横幅可见（索引少一行是内容变化，不属于正当静默）；正常 ⇒ 零横幅");
}

console.log("ALL PASS ✅");
