// dsh-shadow —— v1.8.0 B2（写侧采集）端到端：同回合「决策 + fs/observed 材料」→ 决策原子带 evidence。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
import { parseMemory } from "../dist/core/episode.js";
const { apply, name, inject } = mod;

const WS = "D:/ws";
const files = new Map();
const fs = {
  async resolve(path) { return { targetKey: path, displayPath: path }; },
  async readText(t) { const v = files.get(t.displayPath); return v === undefined ? "" : v; },
  async writeText(t, c) { files.set(t.displayPath, c); return { version: "v1" }; },
  async listDir(t) {
    const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/"; const names = new Set();
    for (const k of files.keys()) { const nk = k.replace(/\\/g, "/"); if (nk.startsWith(prefix)) names.add(nk.slice(prefix.length).split("/")[0]); }
    return [...names].map((n) => ({ name: n }));
  },
};
const agentsById = new Map();
const agents = { currentInitiator: () => null, get: (id) => agentsById.get(id) };
const agent = (id, cwd = WS) => { const a = { id, session: { header: { cwd } } }; agentsById.set(id, a); return a; };
agent("AG");
const systemPrompt = { context: () => {} };
const toolRegistry = new Map();
const tools = { register: (d) => toolRegistry.set(d.name, d) };
const services = { fs, agents, systemPrompt, tools, llm: undefined, agentDefaultModel: undefined };
const listeners = new Map();
const ctx = { get: (k) => services[k], on: (e, fn) => { listeners.set(e, fn); return () => listeners.delete(e); }, inject: (_d, cb) => cb({ get: (k) => services[k] }) };
const P = { name, inject, apply };
P.apply(ctx, { summary: { enabled: false }, recall: {} });
const fire = (e, ...a) => { const fn = listeners.get(e); assert.ok(fn, `missing ${e}`); return fn(...a); };
const flushAgent = async (sid) => fire("agent/turn-stopping", { agent: agentsById.get(sid), turn: 1, signal: undefined });

// 同回合：决策（goal/changed）+ 材料（fs/observed）
fire("goal/changed", { agent: { id: "AG" }, change: { objective: "采用 RSA 签名方案", act: "decision" } });
fire("fs/observed", { targetKey: `${WS}/src/AuthFilter.java`, displayPath: `${WS}/src/AuthFilter.java` }, { kind: "present", version: "v1" }, { agent: { id: "AG" } });
await flushAgent("AG");

const memKeys = [...files.keys()].filter((k) => k.replace(/\\/g, "/").includes("/.shadow/") && !k.endsWith("_index.md"));
assert.ok(memKeys.length, "应落盘记忆文件");
const decKey = memKeys.find((k) => files.get(k).includes("决策"));
assert.ok(decKey, "应有含决策的记忆文件");
const decText = files.get(decKey);
assert.ok(/^> 背景\/材料：.+AuthFilter/m.test(decText), "决策原子应同文件带材料（写侧 B2 协作）");

const parsed = parseMemory(decText, decKey.replace(/\\/g, "/").split("/.shadow/")[1], decKey.split(/[\\/]/).pop());
assert.equal(parsed.kind, "experience", "决策原子 kind=experience");
assert.ok(parsed.lineage && parsed.lineage.evidence.length > 0, "决策原子应带 evidence");
assert.ok(parsed.lineage.evidence.some((e) => e.locator.includes("AuthFilter")), "evidence 指向当回合材料");
assert.equal(parsed.lineage.createdBy, "agent", "goal 决策→agent");

console.log("✔ 场景 B2-写侧协作：同回合 决策+fs/observed → 决策原子带 evidence（event-sourced，非 LLM 补写）");
console.log("ALL PASS ✅");
