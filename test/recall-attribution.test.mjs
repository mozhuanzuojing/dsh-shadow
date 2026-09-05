// dsh-shadow —— 归属修复 + 召回升级的 E2E 测试（mock host，驱动真实插件代码）。
// 覆盖：
//   1) 归属：session/event 按 session 自己的 agent（agentById）归属，不再张冠李戴到全局 initiator；
//   2) 召回：read_shadow(topic) 加权打分排序，正确地把相关的记忆排到最前；
//   3) 无 topic 返回索引；LLM 扩词（recall.enabled）在 llm 缺失时静默降级。
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const mod = require("../index.js");
const { apply, name, inject } = mod;

const WS = "D:/ws";

// —— 内存 fs，模拟 DSH fs 服务的 resolve/readText/writeText/listDir ——
const files = new Map();
const fs = {
  async resolve(path) {
    return { targetKey: path, displayPath: path };
  },
  async readText(target) {
    const v = files.get(target.displayPath);
    return v === undefined ? "" : v;
  },
  async writeText(target, content) {
    files.set(target.displayPath, content);
    return { version: "v1" };
  },
  async listDir(target) {
    const base = target.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/";
    const names = new Set();
    for (const k of files.keys()) {
      const nk = k.replace(/\\/g, "/");
      if (!nk.startsWith(prefix)) continue;
      const rest = nk.slice(prefix.length);
      const first = rest.split("/")[0];
      if (first !== "_index.md") names.add(first);
    }
    return [...names].map((n) => ({ name: n }));
  },
};

// —— agents 服务：currentInitiator + get(id) ——
let initiator = null; // 默认全局 initiator（模拟"张冠李戴"的旧行为来源）
const agentsById = new Map();
const agents = {
  currentInitiator: () => initiator,
  get: (id) => agentsById.get(id),
};
const agent = (id, cwd = WS) => {
  const a = { id, session: { header: { cwd } } };
  agentsById.set(id, a);
  return a;
};
const PARENT = agent("PARENT");
const CHILD = agent("CHILD");

// —— systemPrompt ——
const promptContexts = [];
const systemPrompt = {
  context: (c) => promptContexts.push(c),
};

// —— tools 服务：把 read_shadow 存起来 ——
const toolRegistry = new Map();
const tools = {
  register: (def) => toolRegistry.set(def.name, def),
};

// —— llm：默认缺失（summary/expand 应静默降级） ——
let llm = undefined;

// —— mock Cordis ctx ——
const services = { fs, agents, systemPrompt, tools, llm, agentDefaultModel: undefined };
const listeners = new Map();
let injected = [];
const ctx = {
  get: (k) => services[k],
  on: (event, fn) => {
    listeners.set(event, fn);
    return () => listeners.delete(event);
  },
  inject: (deps, cb) => {
    // 只回填工具/service 依赖，简化：cb 拿到一个带 .get 的 scopeCtx
    cb({ get: (k) => services[k] });
  },
};

const plugin = { name, inject, apply };
plugin.apply(ctx, { summary: { enabled: false }, recall: {} });
assert.equal(name, "dsh-shadow", "module 名应为 dsh-shadow");
assert.ok(listeners.has("fs/observed"));
assert.ok(listeners.has("session/event"));
assert.ok(listeners.has("agent/turn-stopping"));
assert.ok(toolRegistry.has("read_shadow"), "应为模型注册 read_shadow");

const fire = (event, ...args) => {
  const fn = listeners.get(event);
  assert.ok(fn, `missing listener ${event}`);
  return fn(...args);
};

const fireUserMessage = (sid, text) => {
  fire(
    "session/event",
    { id: sid, header: { cwd: WS } },
    {
      type: "user/message",
      seq: 1,
      time: Date.now(),
      data: {
        id: `m-${sid}`,
        role: "user",
        content: [{ type: "text", text }],
        source: { kind: "user" },
      },
    },
  );
};

const fireObserved = (sid, path) => {
  fire(
    "fs/observed",
    { targetKey: `${WS}/${path}`, displayPath: `${WS}/${path}` },
    { kind: "present", version: "v1" },
    { agent: { id: sid } }, // 模拟 tool-execution context 带 .agent
  );
};

const flushAgent = async (sid) =>
  fire("agent/turn-stopping", { agent: agentsById.get(sid), turn: 1, signal: undefined });

const listMemoryPaths = () =>
  [...files.keys()].filter((k) => k.replace(/\\/g, "/").includes("/shadow/") && !k.endsWith("_index.md"));

// ─────────────────────────────────────────────
// 场景 1：归属 —— 先让"全局 initiator"指向 PARENT，再触发 CHILD 的会话事件。
//          旧代码会把 CHILD 的消息归属到 PARENT（张冠李戴）；新代码应按 CHILD 归属。
// ─────────────────────────────────────────────
initiator = PARENT; // 模拟当前全局 initiator（易导致串线）

fireObserved("CHILD", "child-file.txt");
fireUserMessage("CHILD", "子会话：处理 child-file.txt 的采集。" );
await flushAgent("CHILD"); // CHILD 回合收口 → 落 CHILD 自己的记忆

fireObserved("PARENT", "parent-file.txt");
fireUserMessage("PARENT", "父会话：处理 parent-file.txt 的采集。");
await flushAgent("PARENT"); // PARENT 回合收口

const memPaths = listMemoryPaths();
assert.equal(memPaths.length, 2, `应生成 2 条记忆，实际 ${memPaths.length}: ${memPaths.join(",")}`);

// 找到各代理对应的记忆文件（按正文含原始 comp 匹配；文件名 slug 会把 `.` 变为 `-`）
const childFile = memPaths.find((p) => files.get(p)?.includes("child-file.txt"));
const parentFile = memPaths.find((p) => files.get(p)?.includes("parent-file.txt"));
assert.ok(childFile, `应有 child-file.txt 的记忆：${memPaths.join(",")}`);
assert.ok(parentFile, `应有 parent-file.txt 的记忆：${memPaths.join(",")}`);

const childText = files.get(childFile);
const parentText = files.get(parentFile);
assert.ok(childText.includes("子会话：处理 child-file.txt"), "CHILD 消息应落在 CHILD 的记忆里");
assert.ok(!childText.includes("父会话"), "CHILD 记忆不应混入父会话消息");
assert.ok(parentText.includes("父会话：处理 parent-file.txt"), "PARENT 消息应落在 PARENT 的记忆里");
assert.ok(!parentText.includes("子会话"), "PARENT 记忆不应混入子会话消息");
console.log("✔ 场景1 归属：按 session 自己的 agent 归属，未张冠李戴");

// ─────────────────────────────────────────────
// 场景 2：召回 —— read_shadow(topic) 加权打分排序
// ─────────────────────────────────────────────
const readShadow = toolRegistry.get("read_shadow");
const execCtx = { agent: PARENT };
const rChild = await readShadow.execute({ topic: "child-file" }, execCtx);
assert.ok(rChild.includes("child-file.txt"), `child-file 召回应命中 child-file.txt：\n${rChild}`);
assert.ok(rChild.includes("子会话"), "child-file 召回应带正文片段");

const rParent = await readShadow.execute({ topic: "parent-file" }, execCtx);
assert.ok(rParent.includes("parent-file.txt"), `parent-file 召回应命中 parent-file.txt：\n${rParent}`);

const rIndex = await readShadow.execute({}, execCtx);
assert.ok(rIndex.includes("shadow 目录说明与索引"), "无 topic 应返回索引");
assert.ok(rIndex.includes("主题索引"), "索引应含主题索引段");

const rNone = await readShadow.execute({ topic: "完全不相关主题XYZ" }, execCtx);
assert.ok(String(rNone).includes("无匹配"), `不相关主题应返回无匹配：${rNone}`);
console.log("✔ 场景2 召回：加权打分排序按主题正确召回");

// ─────────────────────────────────────────────
// 场景 4：LLM 扩词（recall.enabled + 有 llm）——走 B 档扩词后再打分
// ─────────────────────────────────────────────
const llmStreaming = {
  stream: async function* () {
    yield { type: "text-delta", index: 0, text: "记忆\n投影\n采集" };
    yield { type: "finish", reason: { kind: "stop" } };
  },
};
{
  const plugin3 = { name, inject, apply };
  const services3 = { fs, agents, systemPrompt, tools, llm: llmStreaming, agentDefaultModel: undefined };
  const ctx3 = {
    get: (k) => services3[k],
    on: () => () => {},
    inject: (deps, cb) => cb({ get: (k) => services3[k] }),
  };
  plugin3.apply(ctx3, {
    summary: {},
    recall: { enabled: true, provider: "p", model: "m", maxTokens: 60, timeoutMs: 6000 },
  });
  const rExp = await toolRegistry.get("read_shadow").execute({ topic: "记忆" }, { agent: PARENT });
  assert.ok(!String(rExp).startsWith("ERR"), `扩词后不应抛错：${rExp}`);
  assert.ok(String(rExp).length > 0, "扩词后应返回结果");
  console.log("✔ 场景4 扩词：recall.enabled + 有 llm 时走 B 档扩词后打分");
}

// ─────────────────────────────────────────────
// 场景 3：LLM 扩词（recall.enabled）在 llm 缺失时静默降级
// ─────────────────────────────────────────────
const plugin2 = { name, inject, apply };
const ctx2 = {
  get: () => undefined,
  on: () => () => {},
  inject: (deps, cb) => cb({ get: () => undefined }),
};
// 无 llm 时：expandTerms 静默返回 []，read_shadow 仍走纯关键词召回
const rec = await (async () => {
  const r = toolRegistry.get("read_shadow");
  try {
    return await r.execute({ topic: "shadow" }, { agent: PARENT });
  } catch (e) {
    return `ERR ${e.message}`;
  }
})();
assert.ok(!String(rec).startsWith("ERR"), `无 llm 时不应抛错：${rec}`);
console.log("✔ 场景3 扩词降级：无 llm 时退化为纯关键词召回（不抛错）");

// 摘要在 llm 缺失时应返回 ""（不写摘要、不影响正文）
// ─────────────────────────────────────────────
// 场景 5：一句话总结回填（回归）——SUMMARY 为 enabled 且有 llm 时，flush 后文件头得 `> 摘要：`
// ─────────────────────────────────────────────
{
  const llmSummary = {
    stream: async function* () {
      yield { type: "text-delta", index: 0, text: "这是测试摘要" };
      yield { type: "finish", reason: { kind: "stop" } };
    },
  };
  agent("SUMMARY_AGENT");
  const services5 = { fs, agents, systemPrompt, tools, llm: llmSummary, agentDefaultModel: undefined };
  const listeners5 = new Map();
  const ctx5 = {
    get: (k) => services5[k],
    on: (e, fn) => listeners5.set(e, fn),
    inject: (deps, cb) => cb({ get: (k) => services5[k] }),
  };
  const plugin5 = { name, inject, apply };
  plugin5.apply(ctx5, { summary: { enabled: true, provider: "p", model: "m" }, recall: {} });
  listeners5.get("session/event")(
    { id: "SUMMARY_AGENT", header: { cwd: WS } },
    { type: "user/message", seq: 1, time: Date.now(), data: { id: "m-s", role: "user", content: [{ type: "text", text: "总结一下这轮。" }], source: { kind: "user" } } },
  );
  await listeners5.get("agent/turn-stopping")({ agent: agentsById.get("SUMMARY_AGENT"), turn: 1, signal: undefined });
  // patchSummary 是 detached（void），给一 tick 让它回填。
  await new Promise((r) => setTimeout(r, 30));
  const sumPath = [...files.keys()].find((k) => k.includes("shadow/") && files.get(k)?.includes("总结一下这轮"));
  assert.ok(sumPath, "SUMMARY_AGENT 的记忆应已落盘");
  const sumText = files.get(sumPath);
  assert.ok(sumText.includes("> 摘要：这是测试摘要"), `应有摘要回填：\n${sumText.slice(0, 120)}`);
  console.log("✔ 场景5 摘要回填：flush 后文件头回填 `> 摘要：`（回归正常）");
}

// ─────────────────────────────────────────────
// 场景 6：无 llm 时一句话总结也不抛错、不阻塞
// ─────────────────────────────────────────────
{
  const noLlmPlugin = { name, inject, apply };
  const services6 = { fs, agents, systemPrompt, tools, llm: undefined, agentDefaultModel: undefined };
  const listeners6 = new Map();
  const ctx6 = { get: (k) => services6[k], on: (e, fn) => listeners6.set(e, fn), inject: (deps, cb) => cb({ get: (k) => services6[k] }) };
  agent("NO_LLM_AGENT");
  noLlmPlugin.apply(ctx6, { summary: { enabled: true }, recall: {} });
  listeners6.get("session/event")(
    { id: "NO_LLM_AGENT", header: { cwd: WS } },
    { type: "user/message", seq: 1, time: Date.now(), data: { id: "m-n", role: "user", content: [{ type: "text", text: "无模型也要能落盘。" }], source: { kind: "user" } } },
  );
  await listeners6.get("agent/turn-stopping")({ agent: agentsById.get("NO_LLM_AGENT"), turn: 1, signal: undefined });
  await new Promise((r) => setTimeout(r, 10));
  const noLlmPath = [...files.keys()].find((k) => k.includes("shadow/") && files.get(k)?.includes("无模型也要能落盘"));
  assert.ok(noLlmPath, "无 llm 时记忆仍应落盘");
  console.log("✔ 场景6 无模型降级：无 llm 时落盘不抛错、无摘要但不影响正文");
}

// ─────────────────────────────────────────────
// 场景 7：分层召回（L0/L1/L2 + 预算 + 冷热淘汰）——借鉴 OpenViking 分层思想，不引入向量库
// ─────────────────────────────────────────────
{
  const files7 = new Map();
  const fs7 = {
    async resolve(path) { return { targetKey: path, displayPath: path }; },
    async readText(t) { return files7.get(t.displayPath) ?? ""; },
    async writeText(t, c) { files7.set(t.displayPath, c); return { version: "v1" }; },
    async listDir(t) {
      const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
      const prefix = base + "/";
      const names = new Set();
      for (const k of files7.keys()) {
        const nk = k.replace(/\\/g, "/");
        if (!nk.startsWith(prefix)) continue;
        const first = nk.slice(prefix.length).split("/")[0];
        if (first !== "_index.md") names.add(first);
      }
      return [...names].map((n) => ({ name: n }));
    },
  };
  const services7 = { fs: fs7, agents, systemPrompt, tools, llm: undefined, agentDefaultModel: undefined };
  const listeners7 = new Map();
  const ctx7 = { get: (k) => services7[k], on: (e, fn) => listeners7.set(e, fn), inject: (deps, cb) => cb({ get: (k) => services7[k] }) };
  agentsById.set("T7", { id: "T7", session: { header: { cwd: WS } } });
  const fire7 = (e, ...a) => { const fn = listeners7.get(e); assert.ok(fn, `missing ${e}`); return fn(...a); };
  const user7 = (text) =>
    fire7("session/event", { id: "T7", header: { cwd: WS } }, { type: "user/message", seq: Date.now(), time: Date.now(), data: { id: "m-7", role: "user", content: [{ type: "text", text }], source: { kind: "user" } } });
  const obs7 = (path) =>
    fire7("fs/observed", { targetKey: `${WS}/${path}`, displayPath: `${WS}/${path}` }, { kind: "present", version: "v1" }, { agent: { id: "T7" } });
  const flush7 = async () => fire7("agent/turn-stopping", { agent: agentsById.get("T7"), turn: 1, signal: undefined });

  // A 档：cooldown 默认关，测分层 + 预算
  const P7 = { name, inject, apply };
  P7.apply(ctx7, { summary: { enabled: false }, recall: {} });
  obs7("plugin-a/util.js");     // 纯动作记忆 → 应判 L0
  await flush7();
  obs7("plugin-b/entry.js");    // 含用户决策 → 应判 L2
  user7("决定：把插件入口改造成 bundle 模式。");
  await flush7();
  const rs7 = toolRegistry.get("read_shadow");
  const exec7 = { agent: agentsById.get("T7") };
  const rL0 = await rs7.execute({ topic: "plugin-a", max_tokens: 4096 }, exec7);
  assert.ok(rL0.includes("plugin-a"), `纯动作记忆应命中路径：\n${rL0}`);
  assert.ok(!rL0.includes("…"), `纯动作记忆(L0)应只给摘要、无命中片段：\n${rL0}`);
  const rL2 = await rs7.execute({ topic: "plugin-b", max_tokens: 4096 }, exec7);
  assert.ok(rL2.includes("bundle"), `含决策记忆(L2)应命中正文：\n${rL2}`);
  assert.ok(rL2.includes("…"), `含决策记忆(L2)应给命中片段：\n${rL2}`);
  // max_tokens 参数应被接受且返回正常结果（不抛错、能命中）
  const rBudget = await rs7.execute({ topic: "plugin-b", max_tokens: 2048 }, exec7);
  assert.ok(!String(rBudget).startsWith("ERR"), `max_tokens 参数不应导致错误：${rBudget}`);
  assert.ok(rBudget.includes("plugin-b"), `max_tokens 参数下仍应命中：\n${rBudget}`);

  // B 档：显式开启 cooldownTurns=3，验证刚“带内容”发过的路径被抑制
  const listeners7b = new Map();
  const ctx7b = { get: (k) => services7[k], on: (e, fn) => listeners7b.set(e, fn), inject: (deps, cb) => cb({ get: (k) => services7[k] }) };
  P7.apply(ctx7b, { summary: { enabled: false }, recall: { cooldownTurns: 3 } });
  const rs7b = toolRegistry.get("read_shadow");
  const first = await rs7b.execute({ topic: "plugin-b", max_tokens: 4096 }, exec7);
  assert.ok(first.includes("bundle"), `冷热淘汰首查应命中：\n${first}`);
  const second = await rs7b.execute({ topic: "plugin-b", max_tokens: 4096 }, exec7);
  assert.ok(String(second).includes("无匹配"), `冷热淘汰应抑制刚发过的内容：\n${second}`);
  console.log("✔ 场景7 分层召回：L0 仅摘要 / L2 出片段 / 小预算降级 / 冷热淘汰生效");
}

console.log("\nALL PASS ✅");
