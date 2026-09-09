// dsh-shadow —— ADR-0049「缺件不静默」回归（mock host，驱动真实插件代码）：
//   ① `streamText`：缺 llm / 缺 route / 出错 → 返回 ""（调用方按空值回退，绝不抛）；
//   ② `routeVerify`：provider 名不存在 → unavailable（**不得**静默退回 fs 冒充 verified）；
//   ③ 读侧：所有 LLM 增强打开但 llm 缺失时，仍走确定性路径、不抛错；
//   ④ 证据校验：路径不存在 → not_found（不是 verified）。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
import { routeVerify } from "../dist/evidence/gateway.js";
import { streamText } from "../dist/core/writer-llm.js";

const { apply, name, inject } = mod;
const WS = "D:/ws";

// 严格 fs：读不存在的路径会抛（贴近真实文件系统，让 fsExists 判 false）
const makeHost = (config: any, seeds: { rel: string; text: string }[] = []) => {
  const files = new Map<string, string>();
  for (const s of seeds) files.set(s.rel, s.text);
  const fs = {
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText(target: any) {
      const v = files.get(target.displayPath);
      if (v === undefined) throw new Error("ENOENT");
      return v;
    },
    async writeText(target: any, content: string) { files.set(target.displayPath, content); return { version: "v1" }; },
    async listDir(target: any) {
      const base = String(target.displayPath).replace(/\\/g, "/").replace(/\/+$/, "") + "/";
      const names = new Set<string>();
      for (const k of files.keys()) {
        const nk = k.replace(/\\/g, "/");
        if (!nk.startsWith(base)) continue;
        const first = nk.slice(base.length).split("/")[0];
        if (first !== "_index.md") names.add(first);
      }
      return [...names].map((n) => ({ name: n }));
    },
  };
  const agentsById = new Map<string, any>();
  const A = { id: "A", session: { header: { cwd: WS } } };
  agentsById.set("A", A);
  const registry = new Map<string, any>();
  const services: any = {
    fs,
    agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) },
    systemPrompt: { context: () => {} },
    tools: { register: (def: any) => registry.set(def.name, def) },
    llm: undefined, // 关键：所有 LLM 增强的依赖都缺
    agentDefaultModel: undefined,
  };
  const ctx: any = { get: (k: string) => services[k], on: () => () => {}, inject: (_d: string[], cb: Function) => cb({ get: (k: string) => services[k] }) };
  apply(ctx, config);
  return { files, ctx, read: (args: any) => registry.get("read_shadow").execute(args, { agent: A }) };
};

// ── ① streamText 契约 ──
const noLlmCtx = { get: () => undefined };
const opts = { label: "", system: "s", messages: [], maxTokens: 8, timeoutMs: 50 };
assert.equal(await streamText(noLlmCtx, { provider: "p", model: "m" }, opts), "", "缺 llm → 空串");
const llmCtx = { get: (k: string) => (k === "llm" ? { stream: async function* () { throw new Error("boom"); } } : undefined) };
assert.equal(await streamText(llmCtx, { provider: "p", model: "m" }, opts), "", "llm 抛错 → 空串（不冒泡）");
assert.equal(await streamText(llmCtx, undefined, opts), "", "缺 route → 空串");
const abortedCtx = { get: (k: string) => (k === "llm" ? { stream: async function* () { yield { type: "finish", reason: { kind: "aborted" } }; } } : undefined) };
assert.equal(await streamText(abortedCtx, { provider: "p", model: "m" }, opts), "", "finish=aborted → 空串");
console.log("✔ ① streamText：缺 llm / 缺 route / 抛错 / aborted 一律返回空串（不抛、不编）");

// ── ② routeVerify：未知 provider 不得静默退回 fs ──
const badProvider = await routeVerify({ path: "src/x.ts" }, { fs: null, ws: WS }, "typo-provider");
assert.equal(badProvider.status, "unavailable", `未知 provider 应 unavailable，实际 ${badProvider.status}`);
assert.notEqual(badProvider.status, "verified", "未知 provider 绝不能是 verified");
assert.equal(badProvider.source, "typo-provider", "source 应回显请求的 provider 名");
assert.equal(badProvider.provenance.reason, "provider_unknown", "应带 reason=provider_unknown");
assert.equal(badProvider.confidence, 0, "未验证 → confidence 0");

// fs provider 本身仍要工作：存在的路径 verified，不存在的 not_found
const hostFs = makeHost({ summary: { enabled: false }, recall: {} }, [{ rel: `${WS}/.shadow/2026-09-08/2026-09-08--100000-a.md`, text: "# src/a.ts\n\n> 背景/材料：src/a.ts\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [10:00:00] [src/a.ts] alpha 条目\n" }]);
const okRef = await routeVerify({ path: ".shadow/2026-09-08/2026-09-08--100000-a.md" }, { fs: (hostFs as any).ctx.get("fs"), ws: WS }, "fs");
assert.equal(okRef.status, "verified", "存在的路径应 verified（未把 fs 一起改坏）");
const missingRef = await routeVerify({ path: "src/does-not-exist.ts" }, { fs: (hostFs as any).ctx.get("fs"), ws: WS }, "fs");
assert.equal(missingRef.status, "not_found", "不存在的路径应 not_found");
console.log("✔ ② routeVerify：未知 provider → unavailable(provider_unknown)；fs 仍 verified/not_found");

// ── ③ 全增强打开但 llm 缺失：读侧仍确定性可用、不抛错 ──
const host = makeHost(
  {
    summary: { enabled: true, provider: "p", model: "m" },
    recall: { enabled: true, provider: "p", model: "m" },
    llmRecall: { enabled: true, provider: "p", model: "m" },
    projectionStore: { enabled: true },
    knowledgeEngine: { enabled: true, llmNavigate: { enabled: true, provider: "p", model: "m" } },
  },
  [{ rel: `${WS}/.shadow/2026-09-08/2026-09-08--100000-a.md`, text: "# src/auth/JwtFilter.java\n\n> 完整线索\n> 背景/材料：D:/ws/src/missing.ts\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [10:00:00] [src/auth/JwtFilter.java] alpha JWT 校验\n" }],
);
const rTopic = await host.read({ topic: "JwtFilter", max_tokens: 4096 });
assert.ok(rTopic.includes("JwtFilter"), `缺 llm 时仍应召回：\n${rTopic}`);
assert.ok(!rTopic.startsWith("ERR"), "缺 llm 不应报错");
const rIndex = await host.read({});
assert.ok(rIndex.length > 0 && !rIndex.startsWith("ERR"), "缺 llm 时读索引仍可用");
const rKnowledge = await host.read({ mode: "knowledge", topic: "JwtFilter" });
assert.ok(!rKnowledge.startsWith("ERR") && rKnowledge.length > 0, "缺 llm 时 knowledge 模式仍走确定性路径");
const rRecall = await host.read({ mode: "recovery", topic: "JwtFilter" });
assert.ok(rRecall.includes("JwtFilter"), `缺 llm 时恢复包仍应命中：\n${rRecall}`);
console.log("✔ ③ 全增强打开 + llm 缺失：topic/index/knowledge/recall 全部走确定性路径且不抛错");

// ── ④ 证据校验：缺件只报事实（not_found），不冒充 verified ──
const rVerify = await host.read({ topic: "JwtFilter", verifyEvidence: true, max_tokens: 4096 });
assert.ok(rVerify.includes("not_found"), `路径不存在应 not_found：\n${rVerify}`);
assert.ok(!/verified\s+D:\/ws\/src\/missing\.ts/.test(rVerify), "不得把缺失路径报成 verified");
assert.ok(rVerify.includes("provider=fs"), "应披露用的哪个 provider");
console.log("✔ ④ 证据校验：缺件 → not_found + 披露 provider（不冒充 verified）");

console.log("ALL PASS ✅");
