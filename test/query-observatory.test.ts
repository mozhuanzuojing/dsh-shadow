// dsh-shadow —— Shadow Query Observatory（Phase 1A.5）/ 旁路观测 E2E 测试。
// 验证：
//   1) shadow_query 旁路写 .shadow/query-log/<date>.jsonl（候选/返回/证据/关系/类型/标题/延迟）；
//   2) read_shadow({mode:"query-log"}) 汇总可读（命中/证据/关系/类型分布 + 稳定性）；
//   3) 同一查询同一数据 → nodeTitles 稳定，不误判漂移；
//   4) query-log 是系统派生记录，不进入记忆枚举（rm -rf 无影响）。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
import { missingTypesOf } from "../dist/query/observatory.js";
const { apply, name, inject } = mod;

const WS = "D:/ws";

const files = new Map();
const fs = {
  async resolve(path) { return { targetKey: path, displayPath: path }; },
  async readText(target) { const v = files.get(target.displayPath); return v === undefined ? "" : v; },
  async writeText(target, content) { files.set(target.displayPath, content); return { version: "v1" }; },
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

const agentsById = new Map();
const agents = {
  currentInitiator: () => null,
  get: (id) => agentsById.get(id),
};
const agent = (id, cwd = WS) => { const a = { id, session: { header: { cwd } } }; agentsById.set(id, a); return a; };
const AG = agent("AG");

const systemPrompt = { context: () => {} };
const toolRegistry = new Map();
const tools = { register: (def) => toolRegistry.set(def.name, def) };

const services = { fs, agents, systemPrompt, tools, llm: undefined, agentDefaultModel: undefined };
const listeners = new Map();
const ctx = {
  get: (k) => services[k],
  on: (event, fn) => { listeners.set(event, fn); return () => listeners.delete(event); },
  inject: (_deps, cb) => cb({ get: (k) => services[k] }),
};

const plugin = { name, inject, apply };
plugin.apply(ctx, { summary: { enabled: false }, recall: {} });
assert.ok(toolRegistry.has("shadow_query"), "应注册 shadow_query");

const fire = (event, ...args) => { const fn = listeners.get(event); assert.ok(fn, `missing ${event}`); return fn(...args); };
const fireObserved = (sid, path) =>
  fire("fs/observed", { targetKey: `${WS}/${path}`, displayPath: `${WS}/${path}` }, { kind: "present", version: "v1" }, { agent: { id: sid } });
const fireUserMessage = (sid, text) =>
  fire("session/event", { id: sid, header: { cwd: WS } }, { type: "user/message", seq: 1, time: Date.now(), data: { id: `m-${sid}`, role: "user", content: [{ type: "text", text }], source: { kind: "user" } } });
const flushAgent = async (sid) => fire("agent/turn-stopping", { agent: agentsById.get(sid), turn: 1, signal: undefined });

// —— seed 3 条记忆（对应真实场景：appid secret / SPI annotation / ADR）——
await fireObserved("AG", "apps/appid-secret/guard.ts");
await fireUserMessage("AG", "处理 appid secret 在 AuthFilter 校验的位置");
await flushAgent("AG");
await fireObserved("AG", "api/spi/annotation.ts");
await fireUserMessage("AG", "SPI annotation 的扫描与匹配");
await flushAgent("AG");
await fireObserved("AG", "spec/ADR-0042.md");
await fireUserMessage("AG", "记录 ShadowNode 派生边界");
await flushAgent("AG");

const sq = toolRegistry.get("shadow_query");
const rs = toolRegistry.get("read_shadow");
const execA = { agent: AG };

// —— 场景1：shadow_query 旁路写 query-log ——
const r1 = await sq.execute({ query: "appid", scope: ["memory", "code", "document"] }, execA);
assert.ok(r1.includes("# Shadow Query"), `shadow_query 应命中 appid 相关记忆：\n${r1}`);

const jsonlKeys = [...files.keys()].filter((k) => k.replace(/\\/g, "/").includes("/.shadow/query-log/"));
assert.ok(jsonlKeys.length, `应生成 query-log：${[...files.keys()].join(", ")}`);
const logText = files.get(jsonlKeys[0]);
for (const f of ["candidateNodes", "returnedNodes", "evidenceCount", "relationCount", "nodeTypes", "nodeTitles", "latencyMs", "query"])
  assert.ok(logText.includes(`"${f}"`), `query-log 应含字段 "${f}"：${logText}`);
console.log("✔ 场景 Query-Observatory-1 旁路记录：shadow_query 写 .shadow/query-log/<date>.jsonl（候选/返回/证据/关系/类型/标题/延迟）");

// —— 场景2：mode:query-log 汇总可读 ——
const sum = await rs.execute({ mode: "query-log" }, execA);
assert.ok(sum.includes("Shadow Query Observatory") && sum.includes("总查询") && sum.includes("evidence 完整率"), `query-log 汇总应可读：\n${sum}`);
console.log("✔ 场景 Query-Observatory-2 汇总读：mode:query-log 给出命中/证据/关系/类型分布");

// —— 场景3：同一查询同一数据 → nodeTitles 稳定（无漂移）——
await sq.execute({ query: "appid", scope: ["memory", "code", "document"] }, execA);
const sum2 = await rs.execute({ mode: "query-log" }, execA);
assert.ok(sum2.includes("Node 稳定") && !sum2.includes("## Node 漂移的重复查询"), `重复查询应稳定（无漂移）：\n${sum2}`);
console.log("✔ 场景 Query-Observatory-3 Node 稳定性：同一查询同一数据 → nodeTitles 稳定，不误判漂移");

// —— 场景4：query-log 是派生记录，不进入记忆枚举 ——
const ep = await rs.execute({ mode: "episode" }, execA);
assert.ok(!String(ep).includes("query-log"), "query-log 不应被当作记忆枚举");
const idx = await rs.execute({}, execA);
assert.ok(!String(idx).includes("Shadow Query Observatory"), "query-log 不污染 _index.md 返回");
console.log("✔ 场景 Query-Observatory-4 派生记录：query-log 不进入记忆枚举/索引（rm -rf 无影响）");

// —— 场景5：mode:shadow-report 生成 .shadow/shadow-report.md（Evidence Density/稳定性/类型分布/潜在缺失类型）——
const rep = await rs.execute({ mode: "shadow-report" }, execA);
assert.ok(rep.includes("Shadow Fitness Report"), `shadow-report 应返回报告头：\n${rep}`);
assert.ok(rep.includes("Evidence Density") && rep.includes("Stability") && rep.includes("Node Distribution") && rep.includes("Potential Missing Types"), "报告应含四段");
const reportKey = [...files.keys()].find((k) => k.replace(/\\/g, "/").endsWith("/.shadow/shadow-report.md"));
assert.ok(reportKey, "应写出 .shadow/shadow-report.md");
assert.ok(files.get(reportKey).includes("Evidence Density"), "shadow-report.md 内容应含 Evidence Density 段");
const ep2 = await rs.execute({ mode: "episode" }, execA);
assert.ok(!String(ep2).includes("Shadow Fitness Report"), "shadow-report 不应被当作记忆枚举");
console.log("✔ 场景 Query-Observatory-5 Fitness Report：mode:shadow-report 生成 .shadow/shadow-report.md（诊断而非增强）");

// —— 场景6：missing-types 启发式（纯函数）：≥3 处约束型内容 → 提议 candidate:constraint；<3 不提议 ——
const mkParsed = (n: number, phrase: string) => Array.from({ length: n }, (_, i) => ({
  rel: `.shadow/2026-09-08/00000${i}-constraint.md`, date: "2026-09-08", time: "000000",
  entry: `config/policy-${i}.md`, project: "p", agent: "a", goal: "",
  decisions: [], decisionEvents: [], userMessages: [phrase], materials: [], actions: [], thinkLines: [], body: phrase,
  // v1.15.5：ParsedMemory.kind / lineage 已是必填——合成构造也必须给全（不再有「可选=兼容合成」）。
  kind: "experience",
  lineage: { source: "synthetic", createdBy: "agent", evidence: [], createdAt: "2026-09-08 00:00:00" },
}));
const miss = missingTypesOf(mkParsed(3, "禁止直接 fallback 到默认值，必须显式校验"));
assert.ok(miss.some((m) => m.type === "constraint" && m.count >= 3), "≥3 处约束型 → 应提议 constraint");
const miss2 = missingTypesOf(mkParsed(2, "禁止直接 fallback 到默认值，必须显式校验"));
assert.ok(!miss2.some((m) => m.type === "constraint"), "<3 处约束型 → 不提议（防单例噪声）");
console.log("✔ 场景 Query-Observatory-6 missing-types 启发式：≥3 处约束型内容 → 提议 candidate:constraint；<3 不提议");

console.log("ALL PASS ✅");
