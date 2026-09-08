// dsh-shadow —— v1.12.6 三项改动的回归（mock host，驱动真实插件代码）：
//   ① mode 描述下沉：工具 schema 变短 + 指针；CONTEXT.md「mode 参考」覆盖源码里的全部 mode（棘轮）。
//   ② 召回信封：截断自报家门（不静默丢）+ 空命中给可执行下一步与近似候选（标「未验证」）。
//   ③ deprioritize：只降权、不移除（被降权的树仍可搜到，只是排名靠后，且 debug 能解释）。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as mod from "../dist/index.js";
import { deprioritizeFactor, DEPRIORITIZE_FACTOR, approxEntries } from "../dist/retrieval/rank.js";
import { truncationNote } from "../dist/retrieval/render.js";

const { apply, name, inject } = mod;
const WS = "D:/ws";

// ── mock host 工厂：每个用例一套独立 fs/tools，互不串线 ──
const makeHost = (config: any, seeds: { rel: string; text: string }[] = []) => {
  const files = new Map<string, string>();
  for (const s of seeds) files.set(s.rel, s.text);
  const fs = {
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText(target: any) { const v = files.get(target.displayPath); return v === undefined ? "" : v; },
    async writeText(target: any, content: string) { files.set(target.displayPath, content); return { version: "v1" }; },
    async listDir(target: any) {
      const base = String(target.displayPath).replace(/\\/g, "/").replace(/\/+$/, "");
      const prefix = base + "/";
      const names = new Set<string>();
      for (const k of files.keys()) {
        const nk = k.replace(/\\/g, "/");
        if (!nk.startsWith(prefix)) continue;
        const first = nk.slice(prefix.length).split("/")[0];
        if (first !== "_index.md") names.add(first);
      }
      return [...names].map((n) => ({ name: n }));
    },
  };
  const agentsById = new Map<string, any>();
  const A = { id: "A", session: { header: { cwd: WS } } };
  agentsById.set("A", A);
  const services: any = {
    fs,
    agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) },
    systemPrompt: { context: () => {} },
    tools: { register: (def: any) => registry.set(def.name, def) },
    llm: undefined,
    agentDefaultModel: undefined,
  };
  const registry = new Map<string, any>();
  const ctx: any = {
    get: (k: string) => services[k],
    on: () => () => {},
    inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
  };
  apply(ctx, config);
  return {
    files,
    tool: registry.get("read_shadow"),
    read: (args: any) => registry.get("read_shadow").execute(args, { agent: A }),
  };
};

const memText = (entry: string, line: string) =>
  `# ${entry}\n\n> 完整线索\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [10:00:00] [${entry}] ${line}\n`;
const mem = (date: string, time: string, slug: string) => `${WS}/.shadow/${date}/${date}--${time}-${slug}.md`;

const seeds = [
  { rel: mem("2026-09-05", "100000", "alpha-src"), text: memText("src/alpha.ts", "一手代码 alpha 实现") },
  { rel: mem("2026-09-06", "100000", "alpha-ref"), text: memText("references-agents/alpha.md", "通用命名 alpha 说明") },
  { rel: mem("2026-09-04", "100000", "alpha-util"), text: memText("src/alpha-util.ts", "alpha 工具函数") },
];
const baseCfg = { summary: { enabled: false }, recall: {} };

// ─────────────────────────────────────────────
// ① mode 描述下沉
// ─────────────────────────────────────────────
const host = makeHost(baseCfg, seeds);
const modeDesc = String(host.tool.parameters.properties.mode.description || "");
assert.ok(modeDesc.length > 0, "mode 参数仍在");
assert.ok(modeDesc.length < 600, `mode 描述应下沉到 <600 字符，实际 ${modeDesc.length}`);
assert.ok(modeDesc.includes("CONTEXT.md「mode 参考」"), "mode 描述应带 CONTEXT.md 指针");
assert.ok(modeDesc.includes("episode") && modeDesc.includes("task"), "常用 mode 仍应在描述里");

// CONTEXT.md 覆盖源码里的全部 mode（棘轮：新增 mode 不写文档就红）
let src = "";
for (const f of readdirSync("query")) if (f.endsWith(".ts")) src += readFileSync(`query/${f}`, "utf8");
const modes = new Set<string>();
const grab = (re: RegExp) => { for (const m of src.matchAll(re)) for (const q of m[1].matchAll(/"([a-z][a-z0-9-]*)"/g)) modes.add(q[1]); };
grab(/MODES\s*=\s*new Set\(\[([\s\S]*?)\]\)/g);
grab(/modes:\s*\[([\s\S]*?)\]/g);
for (const m of src.matchAll(/mode\s*[!=]==\s*"([a-z][a-z0-9-]*)"/g)) modes.add(m[1]);
const contextMd = readFileSync("CONTEXT.md", "utf8");
const missing = [...modes].filter((m) => !contextMd.includes(`\`${m}\``));
assert.equal(missing.length, 0, `CONTEXT.md「mode 参考」缺少这些 mode：${missing.join(", ")}`);
assert.ok(modes.size >= 60, `mode 数应 ≥60（实际 ${modes.size}）`);
console.log(`✔ ① mode 描述下沉：${modeDesc.length} 字符（原 1789）+ 指针；CONTEXT.md 覆盖全部 ${modes.size} 个 mode`);

// ─────────────────────────────────────────────
// ② 召回信封：截断自报 + 空命中给下一步
// ─────────────────────────────────────────────
const rOne = await host.read({ topic: "alpha", limit: 1, max_tokens: 4096 });
assert.ok(rOne.includes("无匹配") === false, "有命中时不应是无匹配");
assert.ok(rOne.includes("> 未返回的命中："), `limit 截断应自报家门：\n${rOne}`);
assert.ok(rOne.includes("limit=1 上限"), "截断原因应写清是 limit");
assert.ok(rOne.includes("> 下一步："), "截断应给下一步");
assert.ok(rOne.includes("> 未返回示例："), "截断应列未返回示例");

const rAll = await host.read({ topic: "alpha", limit: 10, max_tokens: 4096 });
assert.ok(!rAll.includes("未返回的命中"), `全部返回时不出现截断披露：\n${rAll}`);

// 预算/冷却两种原因走纯函数（集成里难稳定触发）
const tBudget = truncationNote({ matched: 5, returned: 2, limit: 10, maxChars: 400, droppedByLimit: 0, droppedByBudget: 3, droppedByCooldown: 0, dropped: [{ entry: "x", score: 3 }] });
assert.ok(tBudget.includes("预算 400 字"), `预算截断原因：${tBudget}`);
assert.ok(tBudget.includes("未返回的命中：3 条"), "预算截断计数");
const tCool = truncationNote({ matched: 2, returned: 1, limit: 10, maxChars: 4000, droppedByLimit: 0, droppedByBudget: 0, droppedByCooldown: 1, dropped: [] });
assert.ok(tCool.includes("冷却 1 条"), `冷却披露：${tCool}`);
assert.equal(truncationNote({ matched: 2, returned: 2, limit: 10, maxChars: 4000, droppedByLimit: 0, droppedByBudget: 0, droppedByCooldown: 0, dropped: [] }), "", "没丢东西就不加信封");

const rNone = await host.read({ topic: "alpa", max_tokens: 4096 }); // 词形相近但无命中
assert.ok(rNone.includes("无匹配"), "无匹配语义保留");
assert.ok(rNone.includes("> 下一步："), `空命中应给下一步：\n${rNone}`);
assert.ok(rNone.includes("近似候选·未验证"), `空命中应给近似候选并标注未验证：\n${rNone}`);
assert.ok(rNone.includes("alpha"), "近似候选应命中词形相近的入口");
assert.ok(!rNone.includes("可作指令"), "不得把无匹配说成可作指令");
assert.ok(approxEntries("alpa", ["src/alpha.ts"]).length === 1, "approxEntries 应给出近似入口");
assert.equal(approxEntries("完全无关主题xyz", ["src/alpha.ts"]).length, 0, "无相近入口时不给候选");
console.log("✔ ② 召回信封：limit/预算/冷却截断自报 + 空命中给下一步与近似候选（标未验证）");

// ─────────────────────────────────────────────
// ③ deprioritize：只降权、不移除
// ─────────────────────────────────────────────
assert.equal(deprioritizeFactor(".shadow/2026-09-06/x.md", "references-agents/alpha.md", ["references-agents"]), DEPRIORITIZE_FACTOR, "命中降权前缀");
assert.equal(deprioritizeFactor("D:\\ws\\_reports\\x.md", "src/alpha.ts", ["_reports"]), DEPRIORITIZE_FACTOR, "反斜杠路径也应归一匹配");
assert.equal(deprioritizeFactor(".shadow/2026-09-06/x.md", "src/alpha.ts", ["references-agents"]), 1, "未命中不降权");
assert.equal(deprioritizeFactor(".shadow/x.md", "src/alpha.ts", []), 1, "默认空=不降权");

const noDp = makeHost(baseCfg, seeds);
const withDp = makeHost({ summary: { enabled: false }, recall: { deprioritize: ["references-agents"] } }, seeds);
const rNo = await noDp.read({ topic: "alpha", max_tokens: 4096 });
const rDp = await withDp.read({ topic: "alpha", max_tokens: 4096 });
assert.ok(rNo.indexOf("references-agents/alpha.md") < rNo.indexOf("src/alpha.ts"), `不降权时新日期的 references-agents 在前：\n${rNo}`);
assert.ok(rDp.includes("references-agents/alpha.md"), "降权不等于移除（仍可搜到）");
assert.ok(rDp.indexOf("src/alpha.ts") < rDp.indexOf("references-agents/alpha.md"), `降权后一手代码应排前：\n${rDp}`);
const rDbg = await withDp.read({ topic: "alpha", debug: true, max_tokens: 4096 });
assert.ok(rDbg.includes("降权(deprioritize)") || rDbg.includes("降权·deprioritize"), `debug 应解释降权原因：\n${rDbg}`);
console.log("✔ ③ deprioritize：只降权不移除（排序变化 + debug 可解释 + 默认空不生效）");

console.log("ALL PASS ✅");
