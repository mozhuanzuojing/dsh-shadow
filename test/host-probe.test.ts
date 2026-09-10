// dsh-shadow —— 宿主绑定探测（v1.15.0）回归锁定。
//
// 锁四件事：
//   ① 缺硬依赖 tools → 报 error（不再静默 return），不再出现「工具一个都不出现却毫无提示」；
//   ①b 正例：tools 可用时三个工具都注册上；
//   ② 缺可选服务（llm / agents / agentDefaultModel）→ 首个 agent/turn-stopping 报一次 warn，第二次不再报（不刷屏）；
//   ③ 包装 agent/turn-stopping 时必须**透传返回值** —— onTurnStopping 是 async，宿主与测试都靠 await 这个
//      handler 的返回值来等落盘完成；包装丢掉 return 会让等待方提前继续，flush 失败信号随之消失。
//      （本版开发中真实踩到：场景13「flush 失败可见」因此失败，回档复验证实是本包引入。）
//   ④ 缺框架接口 ctx.on / ctx.inject → 报 error 且不抛异常（报告后返回空 disposer）。
import assert from "node:assert/strict";
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
const mkHost = (services: Record<string, any>) => {
  const listeners = new Map<string, Function>();
  const ctx: any = {
    get: (k: string) => services[k],
    on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); },
    inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
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

// ── ① 缺 tools：报 error，不再静默 ──
{
  const logs = await capture(async () => {
    const services: Record<string, any> = {
      fs: mkFs(),
      systemPrompt: { context: () => {} },
      agents: { get: () => undefined, currentInitiator: () => undefined },
    };
    const { ctx } = mkHost(services);
    apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
  });
  const errs = logs.filter((l) => l.level === "error");
  assert.ok(errs.length >= 1, "缺 tools 必须报 error（原实现是静默 return）");
  assert.ok(
    errs.some((l) => l.text.includes("tools 服务")),
    `error 应点名 tools 服务：\n${errs.map((l) => l.text).join("\n")}`,
  );
  console.log("✔ ① 缺 tools 服务 → 报 error（不再静默）");
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

// ── ② 缺可选服务：首个 turn-stopping 报一次 warn，第二次不再报 ──
{
  const logs = await capture(async () => {
    const services: Record<string, any> = { fs: mkFs(), tools: mkTools(), systemPrompt: { context: () => {} } };
    const { ctx, listeners } = mkHost(services);
    apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
    const h: any = listeners.get("agent/turn-stopping");
    assert.ok(h, "必须注册 agent/turn-stopping");
    await h({ agent: AG, turn: 1, signal: undefined });
    await h({ agent: AG, turn: 2, signal: undefined });
  });
  const warns = logs.filter((l) => l.level === "warn");
  assert.equal(warns.length, 1, `探测只应报一次（不刷屏），实际 ${warns.length} 条`);
  assert.ok(warns[0].text.includes("llm 服务"), "warn 应点名 llm 降级");
  assert.ok(warns[0].text.includes("agentDefaultModel 服务"), "warn 应点名 agentDefaultModel 降级");
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
    "缺 ctx.on / ctx.inject 应报 error",
  );
  console.log("✔ ④ 缺 ctx.on / ctx.inject → 报 error，且不抛异常");
}

console.log("ALL PASS ✅");
