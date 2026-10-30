import assert from "node:assert/strict";
import { makeCodeSearchTool } from "../../dist/surface/tools.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { normalizeConfig } from "../../dist/contract/config.js";
import { systemClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { ok } from "../../dist/contract/outcome.js";

const seed = {
  "/ws/.gitignore": "secret/\n",
  "/ws/src/auth.ts": "export function createSession(token) { return token; }\n",
  "/ws/src/ui.ts": "export function renderButton() { return 1; }\n",
  "/ws/secret/hidden.ts": "export function createSession() { return 2; }\n",
};
const fs = new MemoryFs(seed);
const WS = "/ws";
const tool = makeCodeSearchTool(async () =>
  ok({ fs, ws: WS, config: normalizeConfig({ shadowRoot: WS, codeSearch: { embedding: { provider: "hash" } } }), clock: systemClock, signals: new SignalStore() }),
) as any;

// 1) BM25 + 符号两段都在；.gitignore 生效（secret/ 不出现）
const out = String(await tool.execute({ query: "createSession", limit: 5 }, undefined));
assert.ok(out.includes("# 代码检索"), "应有 BM25 段");
assert.ok(out.includes("## 符号（"), "应有符号段");
assert.ok(out.includes("src/auth.ts"), "应命中 auth.ts");
assert.ok(!out.includes("secret/hidden.ts"), "应忽略 .gitignore 的 secret/");

// 2) provider:http 但无 model → 回落哈希（不吞 BM25）
const tool2 = makeCodeSearchTool(async () =>
  ok({
    fs,
    ws: WS,
    config: normalizeConfig({ shadowRoot: WS, codeSearch: { embedding: { provider: "http", model: "" } } }),
    clock: systemClock,
    signals: new SignalStore(),
  }),
) as any;
const out2 = String(await tool2.execute({ query: "createSession", limit: 5 }, undefined));
assert.ok(out2.includes("回落原因"), "HTTP 不可用应注明回落原因");
assert.ok(out2.includes("本地哈希"), "应回落到本地哈希向量");
assert.ok(out2.includes("src/auth.ts"), "回落不应吞掉 BM25 结果");

console.log("✔ search_code 工具层：BM25+符号两段 / .gitignore 生效 / http 不可用回落哈希且不吞结果");
