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
  ok({ fs, ws: WS, config: normalizeConfig({ shadowRoot: WS }), clock: systemClock, signals: new SignalStore() }),
) as any;

// 1) BM25 + 符号两段都在；.gitignore 生效（secret/ 不出现）
const out = String(await tool.execute({ query: "createSession", limit: 5 }, undefined));
assert.ok(out.includes("# 代码检索"), "应有 BM25 段");
assert.ok(out.includes("## 符号（tree-sitter"), "应有符号段");
assert.ok(out.includes("src/auth.ts"), "应命中 auth.ts");
assert.ok(!out.includes("secret/hidden.ts"), "应忽略 .gitignore 的 secret/");

// 2) embedding 打开但无 model → 显式"不可用"，不影响上面结果
const tool2 = makeCodeSearchTool(async () =>
  ok({
    fs,
    ws: WS,
    config: normalizeConfig({ shadowRoot: WS, codeSearch: { embedding: { enabled: true, model: "" } } }),
    clock: systemClock,
    signals: new SignalStore(),
  }),
) as any;
const out2 = String(await tool2.execute({ query: "createSession", limit: 5 }, undefined));
assert.ok(out2.includes("## 语义（embedding）"), "应有语义段");
assert.ok(out2.includes("语义检索不可用"), "无 model 应显式不可用");
assert.ok(out2.includes("src/auth.ts"), "embedding 不可用不应吞掉 BM25 结果");

console.log("✔ search_code 工具层：BM25+符号两段 / .gitignore 生效 / embedding 无 provider 显式不可用且不吞结果");
