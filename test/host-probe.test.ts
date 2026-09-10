// dsh-shadow —— 宿主绑定探测回归锁定（v1.15.0 建立，v1.15.3 修正）。
//
// ⚠️ v1.15.3 修正的核心事实：Cordis 的 `ctx.inject(deps, cb)` **只在依赖就绪时才回调**
//   （依赖缺失时子 fiber 停在 PENDING，回调根本不执行）。所以「缺 tools 报 error」这类检查
//   **不能写在 inject 回调里** —— 写在里面等于「缺了就不报」，仍是静默。
//   v1.15.0 的 mock `inject: (_d, cb) => cb(...)` 无条件回调，与真语义不符，
//   导致断言①在 mock 里恒真、在真机上永不可能通过（假通过）。本文件据此改写。
//
// 锁六件事：
//   ① 缺硬依赖 tools → **首个 `agent/turn-stopping`** 报 error（不是 inject 回调里）
//   ①b 正例：tools 可用 → 三个工具都注册
//   ①c mock 保真：依赖缺失时 inject 回调不执行、就绪后才执行
//   ② 缺可选服务 → 首个 turn-stopping 报一次 warn，第二次不再报（不刷屏）
//   ③ 包装 `agent/turn-stopping` 必须**透传返回值**（宿主 await 它等落盘完成）
//   ④ 缺框架接口 ctx.on / ctx.inject / ctx.get → 报 error 且不抛异常
//   ⑤ 真实 cordis 端到端（找不到宿主 cordis 时明确跳过，不静默）
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as mod from "../dist/index.js";
const { apply } = mod;

// —— 内存 fs，形状对齐 DSH fs 服务的 resolve / readText / writeText / listDir ——
const mkFs = (store = new Map<string, string>()) => ({
  async resolve(p: string) { return { targetKey: p, displayPath: p }; },
  async readText(t: any) { return store.get(t.displayPath) ?? ""; },
  async writeText(t: any, c: string) { store.set(t.displayPath, c); return { version: "v1" }; },
  async listDir(t: any) {
    const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/"; const names = new Set<string>();
    for (const k of store.keys()) {
      const nk = k.replace(/\\/g, "/");
      if (!nk.startsWith(prefix)) continue;
      names.add(nk.slice(prefix.length).split("/")[0]);
    }
    return [...names].map((n) => ({ name: n }));
  },
});

// —— mock host：get / on / inject ——
// inject **保真**：只有声明依赖全部就绪才回调（对齐 Cordis 语义）。
const mkHost = (services: Record<string, any>) => {
  const listeners = new Map<string, Function>();
  const ctx: any = {
    get: (k: string) => services[k],
    on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); },
    inject: (deps: string[], cb: Function) => {
      if (deps.every((d) => services[d] !== undefined)) cb({ get: (k: string) => services[k] });
    },
  };
  return { ctx, listeners };
};

// —— 捕获 console.error / console.warn（探测输出走这两条）——
const capture = async (fn: () => any) => {
  const logs: Array<{ level: string; text: string }> = [];
  const oe = console.error, ow = console.warn;
  console.error = (...a: any[]) => { logs.push({ level: "error", text: a.join(" ") }); };
  console.warn = (...a: any[]) => { logs.push({ level: "warn", text: a.join(" ") }); };
  try { await fn(); } finally { console.error = oe; console.warn = ow; }
  return logs;
};

const mkTools = () => {
  const reg = new Map<string, any>();
  return { register: (t: any) => reg.set(t.name, t), reg };
};

const AG = { id: "A", session: { header: { cwd: "C:/w" } } };
const fireTurn = async (listeners: Map<string, Function>, turn = 1) => {
  const h: any = listeners.get("agent/turn-stopping");
  assert.ok(h, "必须注册 agent/turn-stopping");
  return h({ agent: AG, turn, signal: undefined });
};

// ── ① 缺硬依赖 tools → 首个 turn-stopping 报 error ──
{
  const logs = await capture(async () => {
    const services: Record<string, any> = {
      fs: mkFs(),
      systemPrompt: { context: () => {} },
      agents: { get: () => undefined, currentInitiator: () => undefined },
      // 故意不提供 tools
    };
    const { ctx, listeners } = mkHost(services);
    apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
    await fireTurn(listeners);
  });
  const errs = logs.filter((l) => l.level === "error");
  assert.ok(errs.length >= 1, "缺 tools 必须在首个 turn-stopping 报 error（inject 回调此时不会执行）");
  assert.ok(
    errs.some((l) => l.text.includes("tools 服务")),
    `error 应点名 tools 服务：\n${errs.map((l) => l.text).join("\n")}`,
  );
  console.log("✔ ① 缺 tools 服务 → 首个 turn-stopping 报 error（不再静默）");
}

// ── ①b 正例：tools 可用 → 三个工具都注册 ──
{
  const tools = mkTools();
  const services: Record<string, any> = { fs: mkFs(), tools, systemPrompt: { context: () => {} } };
  const { ctx } = mkHost(services);
  apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
  for (const t of ["read_shadow", "recall_shadow", "shadow_query"]) assert.ok(tools.reg.has(t), `应注册 ${t}`);
  console.log("✔ ①b tools 可用 → read_shadow / recall_shadow / shadow_query 三个工具都注册");
}

// ── ①c mock 保真：依赖缺失时 inject 回调不执行、就绪后才执行 ──
{
  const services: Record<string, any> = { fs: mkFs() }; // 无 tools
  const { ctx } = mkHost(services);
  let ranMissing = false;
  ctx.inject(["tools"], () => { ranMissing = true; });
  assert.equal(ranMissing, false, "mock 必须保真：依赖缺失时 inject 回调不得执行（否则断言①就是假通过）");
  services.tools = mkTools();
  let ranReady = false;
  ctx.inject(["tools"], () => { ranReady = true; });
  assert.equal(ranReady, true, "依赖就绪后 inject 回调应执行");
  console.log("✔ ①c mock 保真：依赖缺失时 inject 回调不执行、就绪后才执行");
}

// ── ② 缺可选服务：首个 turn-stopping 报一次 warn，第二次不再报 ──
{
  const logs = await capture(async () => {
    const services: Record<string, any> = { fs: mkFs(), tools: mkTools() }; // 缺 llm/agents/agentDefaultModel/systemPrompt
    const { ctx, listeners } = mkHost(services);
    apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
    await fireTurn(listeners, 1);
    await fireTurn(listeners, 2);
  });
  const warns = logs.filter((l) => l.level === "warn");
  assert.equal(warns.length, 1, `探测只应报一次（不刷屏），实际 ${warns.length} 条`);
  assert.ok(warns[0].text.includes("llm 服务"), "warn 应点名 llm 降级");
  assert.ok(warns[0].text.includes("agentDefaultModel 服务"), "warn 应点名 agentDefaultModel 降级");
  assert.ok(warns[0].text.includes("systemPrompt 服务"), "warn 应点名 systemPrompt 降级");
  console.log("✔ ② 可选服务缺失 → 首个 turn-stopping 报一次 warn，之后不再报");
}

// ── ③ 包装 handler 必须透传返回值（async 落盘完成语义）──
{
  const services: Record<string, any> = {
    fs: mkFs(),
    tools: mkTools(),
    systemPrompt: { context: () => {} },
    llm: {},
    agents: { get: () => undefined, currentInitiator: () => undefined },
    agentDefaultModel: {},
  };
  const { ctx, listeners } = mkHost(services);
  apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
  const h: any = listeners.get("agent/turn-stopping");
  const ret = h({ agent: AG, turn: 1, signal: undefined });
  assert.ok(
    ret && typeof ret.then === "function",
    "turn-stopping handler 必须透传 onTurnStopping 的 Promise —— 丢了 await 语义，落盘未完成就会被当成已完成",
  );
  await ret;
  console.log("✔ ③ 包装 handler 透传返回值（await 落盘完成语义保住）");
}

// ── ④ 缺框架接口：报 error 且不抛异常 ──
{
  const logs = await capture(async () => {
    const ctx: any = { get: () => undefined }; // 没有 on / inject
    apply(ctx, { shadowRoot: "C:/p" });
  });
  assert.ok(
    logs.some((l) => l.level === "error" && l.text.includes("ctx.on")),
    "缺 ctx.on / ctx.inject / ctx.get 应报 error",
  );
  console.log("✔ ④ 缺 ctx.on / ctx.inject / ctx.get → 报 error，且不抛异常");
}

// ── ⑤ 真实 cordis 端到端（堵住「mock 与真语义不符」这个洞）──
{
  const cordisPath = process.env.DSH_CORDIS_PATH
    ?? "C:/Users/l/AppData/Local/pnpm/store/v11/links/@deepseek-ai/cordis/4.0.1/69ef533ba6e69b8e16d2d45de78ae326e8fc92d452525d3fa20c378b6e6aa02b/node_modules/@deepseek-ai/cordis/lib/index.js";
  if (!existsSync(cordisPath)) {
    console.log("⏭ ⑤ 跳过真实 cordis 端到端（未找到宿主 cordis；设 DSH_CORDIS_PATH 可启用）");
  } else {
    const m: any = await import(pathToFileURL(cordisPath).href);
    const logs = await capture(async () => {
      const app = new m.Context();
      app.provide("fs", mkFs());
      app.provide("systemPrompt", { context: () => {} });
      app.provide("llm", {});
      app.provide("agents", { get: () => undefined, currentInitiator: () => undefined });
      app.provide("agentDefaultModel", {});
      // 故意不 provide tools
      apply(app, { shadowRoot: "C:/p", summary: { enabled: false } });
      await new Promise((r) => setTimeout(r, 200));
      app.emit("agent/turn-stopping", { agent: AG, turn: 1, signal: undefined });
      await new Promise((r) => setTimeout(r, 200));
    });
    assert.ok(
      logs.some((l) => l.level === "error" && l.text.includes("tools 服务")),
      `真实 cordis 下缺 tools 应报 error；实际日志：\n${logs.map((l) => l.level + ": " + l.text.split("\n")[0]).join("\n") || "（无）"}`,
    );
    console.log("✔ ⑤ 真实 cordis 端到端：缺 tools → 首个 turn-stopping 报 error");
  }
}

console.log("ALL PASS ✅");
