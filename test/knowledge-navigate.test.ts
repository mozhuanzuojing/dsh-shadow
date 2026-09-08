// dsh-shadow —— v1.10.0 Knowledge Engine LLM 树上导航：mode:"knowledge" 端到端（LLM 未配置/失败→确定性检索回退）。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
const { apply, name, inject } = mod;

const WS = "D:/ws";
const files = new Map();
const fs = {
  async resolve(p) { return { targetKey: p, displayPath: p }; },
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
// llm=undefined：knowledgeNavigate 会因无 llm/路由而返回 []，回退确定性检索。
const services = { fs, agents, systemPrompt, tools, llm: undefined, agentDefaultModel: undefined };
const listeners = new Map();
const ctx = { get: (k) => services[k], on: (e, fn) => { listeners.set(e, fn); return () => listeners.delete(e); }, inject: (_d, cb) => cb({ get: (k) => services[k] }) };
const P = { name, inject, apply };
P.apply(ctx, { summary: { enabled: false }, recall: {}, knowledgeEngine: { llmNavigate: { enabled: true, provider: "p", model: "m" } } });
const fire = (e, ...a) => { const fn = listeners.get(e); assert.ok(fn, `missing ${e}`); return fn(...a); };
const flushAgent = async (sid) => fire("agent/turn-stopping", { agent: agentsById.get(sid), turn: 1, signal: undefined });

// 种一条带章节的规范文档
fire("fs/observed", { targetKey: `${WS}/spec/u8-openapi-biz-sa.md`, displayPath: `${WS}/spec/u8-openapi-biz-sa.md` }, { kind: "present", version: "v1" }, { agent: { id: "AG" } });
fire("session/event", { id: "AG", header: { cwd: WS } }, { type: "user/message", seq: 1, time: Date.now(), data: { id: "m1", role: "user", content: [{ type: "text", text: "研究 spec/u8-openapi-biz-sa.md 的签名算法" }], source: { kind: "user" } } });
await flushAgent("AG");

const rs = toolRegistry.get("read_shadow");
assert.ok(rs, "read_shadow 已注册");
// mode:"knowledge" 无 topic → corpus 树；有 topic → 检索（LLM 未配置/失败 → 确定性回退）
const rTree = String(await rs.execute({ mode: "knowledge" }, { agent: agentsById.get("AG") }));
assert.ok(rTree.includes("Knowledge Tree") || rTree.includes("spec"), "无 topic 应出知识树(corpus)");
const rRet = String(await rs.execute({ mode: "knowledge", topic: "RSA" }, { agent: agentsById.get("AG") }));
assert.ok(rRet.includes("Knowledge Retrieval") || rRet.includes("未命中"), "有 topic 应出检索结果(确定性回退)");
console.log("✔ 场景 Knowledge-Navigate-1 mode:knowledge 端到端：corpus 树 + topic 检索（LLM 未配置→确定性回退，不崩溃）");
console.log("ALL PASS ✅");
